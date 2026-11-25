import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import { EncerramentoAcessoService } from '../../../common/auth/encerramento-acesso.service';
import { PoliticaSegurancaService } from '../../../common/auth/politica-seguranca.service';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import { hojeEmSaoPaulo } from '../salas/data-local';

const DIA_MS = 86_400_000;

interface ContratoParaAcesso {
  status: 'ATIVO' | 'CANCELADO' | 'ENCERRADO' | 'AGUARDANDO_ASSINATURA';
  dataFim: Date | null;
  encerradoEm: Date | null;
}

/** Dia (UTC, sem hora) de uma data `@db.Date` ou de `AAAA-MM-DD`, em dias desde 1970. */
const dia = (data: Date | string): number =>
  Math.floor((typeof data === 'string' ? Date.parse(data) : data.getTime()) / DIA_MS);

/**
 * O contrato ainda dá acesso ao profissional? Ativo sem data final, aguardando assinatura e os
 * encerrados ou cancelados até `carenciaDias` depois da data de encerramento (decisão do dev:
 * carência configurável na política, padrão 0 = o acesso acaba no dia). Ativo com `dataFim`
 * vencida também conta a carência.
 */
export function contratoDaAcesso(
  contrato: ContratoParaAcesso,
  hoje: string,
  carenciaDias: number,
): boolean {
  if (contrato.status === 'AGUARDANDO_ASSINATURA') return true;
  const fim = contrato.status === 'ATIVO' ? contrato.dataFim : contrato.encerradoEm;
  if (fim === null) return contrato.status === 'ATIVO';
  return dia(fim) + carenciaDias >= dia(hoje);
}

/**
 * Acesso do usuário que representa um profissional (issue #156, R §41): quando o profissional
 * fica sem contrato (encerrado, cancelado ou vencido, descontada a carência) ou é inativado, o
 * usuário vinculado é desativado e as sessões caem, com registro no `audit_log`.
 *
 * Profissional que nunca teve contrato não é governado por esta regra. Usuário ligado a mais de um
 * profissional (ex.: secretária) só é desativado quando nenhum deles mantém o acesso.
 */
@Injectable()
export class AcessoProfissionalService {
  constructor(
    private readonly txHost: TransactionHost<PrismaAdapter>,
    private readonly politica: PoliticaSegurancaService,
    private readonly encerramento: EncerramentoAcessoService,
  ) {}

  /** Reavalia o profissional e encerra o acesso dos usuários que ficaram sem nenhum profissional com acesso. */
  async avaliar(profissionalId: string, agora = new Date()): Promise<string[]> {
    const hoje = hojeEmSaoPaulo(agora);
    const { carenciaProfissionalDias } = await this.politica.obterDaPrimeiraEmpresa();
    if (await this.temAcesso(profissionalId, hoje, carenciaProfissionalDias)) return [];

    const encerrados: string[] = [];
    for (const vinculo of await this.encerramento.usuariosVinculados(profissionalId)) {
      const restantes = vinculo.profissionalIds.filter((id) => id !== profissionalId);
      const algumComAcesso = await this.algumTemAcesso(restantes, hoje, carenciaProfissionalDias);
      if (algumComAcesso) continue;
      const motivo = (await this.estaInativo(profissionalId))
        ? 'PROFISSIONAL_INATIVO'
        : 'PROFISSIONAL_SEM_CONTRATO';
      if (await this.encerramento.encerrar(vinculo.usuarioId, motivo)) {
        encerrados.push(vinculo.usuarioId);
      }
    }
    return encerrados;
  }

  /** Rotina diária: cobre o término natural dos contratos e o fim da carência. */
  async avaliarTodos(agora = new Date()): Promise<number> {
    const vinculados = await this.txHost.tx.usuarioProfissional.findMany({
      where: { usuario: { ativo: true, deletedAt: null } },
      select: { profissionalId: true },
      distinct: ['profissionalId'],
    });
    let encerrados = 0;
    for (const { profissionalId } of vinculados) {
      encerrados += (await this.avaliar(profissionalId, agora)).length;
    }
    return encerrados;
  }

  private async algumTemAcesso(ids: string[], hoje: string, carencia: number): Promise<boolean> {
    for (const id of ids) {
      if (await this.temAcesso(id, hoje, carencia)) return true;
    }
    return false;
  }

  private async estaInativo(profissionalId: string): Promise<boolean> {
    const profissional = await this.txHost.tx.profissional.findFirst({
      where: { id: profissionalId },
      select: { ativo: true, deletedAt: true },
    });
    return !profissional || !profissional.ativo || profissional.deletedAt !== null;
  }

  private async temAcesso(
    profissionalId: string,
    hoje: string,
    carencia: number,
  ): Promise<boolean> {
    if (await this.estaInativo(profissionalId)) return false;
    const contratos = await this.txHost.tx.contratoSala.findMany({
      where: { profissionalId, deletedAt: null },
      select: { status: true, dataFim: true, encerradoEm: true },
    });
    if (contratos.length === 0) return true;
    return contratos.some((c) => contratoDaAcesso(c, hoje, carencia));
  }
}
