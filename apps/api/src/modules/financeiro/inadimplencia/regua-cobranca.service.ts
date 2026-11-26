import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import {
  aplicarVariaveisCobranca,
  DIAS_DO_MARCO,
  MARCOS_COBRANCA,
  MENSAGEM_PADRAO_MARCO,
  type ReguaMarco,
  type UpdateReguaMarcoInput,
} from '@torres/shared';
import { AuditService } from '../../../common/audit/audit.service';
import { EscopoDadosService, semPermissao } from '../../../common/auth/escopo-dados.service';
import { BusinessException } from '../../../common/errors/api.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import type { Prisma, ReguaCobranca } from '../../../generated/prisma/client';
import { CanaisWhatsappService } from '../../configuracoes-gestao/canais-whatsapp/canais-whatsapp.service';
import { MensagensSaidaWhatsappService } from '../../comercial-atendimento/whatsapp/mensagens-saida-whatsapp.service';
import { DO_TORRES } from '../conta-financeira';
import { EM_ABERTO } from './inadimplencia.service';
import { saldoEmAberto, vencimentoDoMarco } from './inadimplencia.regras';

const ENTITY_ENVIO = 'CobrancaEnvio';

const dia = (valor: string) => new Date(`${valor}T00:00:00.000Z`);
const ptBrDia = (valor: string) => valor.split('-').reverse().join('/');
const moeda = (valor: Prisma.Decimal) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
    .format(valor.toNumber())
    .replaceAll(' ', ' ');

function toDto(r: ReguaCobranca): ReguaMarco {
  return {
    id: r.id,
    marco: r.marco,
    dias: DIAS_DO_MARCO[r.marco],
    ativo: r.ativo,
    enviarWhatsapp: r.enviarWhatsapp,
    alertaInterno: r.alertaInterno,
    mensagem: r.mensagem,
    updatedAt: r.updatedAt.toISOString(),
  };
}

/** Só as contas com profissional como sacado entram na régua (decisão do dev, issue #166). */
const DA_REGUA = {
  ...DO_TORRES,
  profissionalSacadoId: { not: null },
} satisfies Prisma.ContaReceberWhereInput;

/**
 * Régua de cobrança (issue #166, R §18): configuração dos 4 marcos e a rodada diária que avisa o
 * profissional por WhatsApp. Cada título recebe cada marco uma única vez (restrição única em
 * `cobrancas_envios`), e a rodada pode repetir sem duplicar. Falta de telefone ou de canal vira
 * "Falha" no histórico e não é repetida sozinha.
 */
@Injectable()
export class ReguaCobrancaService {
  constructor(
    private readonly txHost: TransactionHost<PrismaAdapter>,
    private readonly escopo: EscopoDadosService,
    private readonly audit: AuditService,
    private readonly canais: CanaisWhatsappService,
    private readonly whatsapp: MensagensSaidaWhatsappService,
  ) {}

  async listar(): Promise<ReguaMarco[]> {
    if (this.escopo.restrito()) throw semPermissao();
    return (await this.garantirMarcos()).map(toDto);
  }

  async atualizar(id: string, input: UpdateReguaMarcoInput): Promise<ReguaMarco> {
    if (this.escopo.restrito()) throw semPermissao();
    const atual = await this.txHost.tx.reguaCobranca.findUnique({ where: { id } });
    if (!atual) {
      throw new BusinessException(ErrorCode.NOT_FOUND, 'Marco da régua não encontrado.', {
        status: 404,
      });
    }
    return toDto(await this.txHost.tx.reguaCobranca.update({ where: { id }, data: input }));
  }

  /** Marcos da régua; cria os que faltarem com o texto padrão (por exemplo, num banco novo). */
  async garantirMarcos(): Promise<ReguaCobranca[]> {
    const existentes = await this.txHost.tx.reguaCobranca.findMany();
    const faltam = MARCOS_COBRANCA.filter((m) => !existentes.some((e) => e.marco === m));
    if (faltam.length > 0) {
      await this.txHost.tx.reguaCobranca.createMany({
        data: faltam.map((marco) => ({ marco, mensagem: MENSAGEM_PADRAO_MARCO[marco] })),
        skipDuplicates: true,
      });
    }
    const todos = faltam.length > 0 ? await this.txHost.tx.reguaCobranca.findMany() : existentes;
    return [...todos].sort(
      (a, b) => MARCOS_COBRANCA.indexOf(a.marco) - MARCOS_COBRANCA.indexOf(b.marco),
    );
  }

  /**
   * Títulos que estão num marco ativo da régua em `hoje`, com o alerta interno ligado. É o que a
   * central de notificações conta ("N cobranças da régua hoje").
   */
  async contarParaAlerta(hoje: string): Promise<number> {
    const marcos = (await this.garantirMarcos()).filter((m) => m.ativo && m.alertaInterno);
    let total = 0;
    for (const { marco } of marcos) {
      total += await this.txHost.tx.contaReceber.count({
        where: {
          ...DA_REGUA,
          status: EM_ABERTO.status,
          dataVencimento: dia(vencimentoDoMarco(marco, hoje)),
        },
      });
    }
    return total;
  }

  /**
   * Rodada da régua em `hoje` (`AAAA-MM-DD`, fuso da clínica): para cada marco ativo com WhatsApp,
   * avisa os títulos em aberto que estão nele e ainda não foram cobrados. Devolve quantos
   * registros gravou no histórico (enviados e falhas).
   */
  async executar(hoje: string): Promise<number> {
    let registrados = 0;
    const marcos = (await this.garantirMarcos()).filter((m) => m.ativo && m.enviarWhatsapp);
    for (const regra of marcos) registrados += await this.cobrarMarco(regra, hoje);
    return registrados;
  }

  private async cobrarMarco(regra: ReguaCobranca, hoje: string): Promise<number> {
    const vencimento = vencimentoDoMarco(regra.marco, hoje);
    const contas = await this.txHost.tx.contaReceber.findMany({
      where: {
        ...DA_REGUA,
        status: EM_ABERTO.status,
        dataVencimento: dia(vencimento),
        cobrancas: { none: { marco: regra.marco } },
      },
      include: {
        profissionalSacado: { select: { id: true, nome: true, telefone: true } },
        baixas: { where: { deletedAt: null }, select: { valorRecebido: true } },
      },
      orderBy: { numero: 'asc' },
    });

    let registrados = 0;
    for (const conta of contas) {
      const profissional = conta.profissionalSacado;
      const saldo = saldoEmAberto(conta.valor, conta.baixas);
      if (!profissional || saldo.lessThanOrEqualTo(0)) continue;

      const resultado = await this.enviar(regra, profissional, {
        numero: conta.numero,
        saldo,
        vencimento,
      });
      const envio = await this.txHost.tx.cobrancaEnvio.create({
        data: {
          contaReceberId: conta.id,
          marco: regra.marco,
          status: resultado.erro ? 'FALHA' : 'ENVIADO',
          erro: resultado.erro,
          mensagemWhatsappId: resultado.mensagemId,
          vencimento: dia(vencimento),
        },
      });
      // Rodada sem request HTTP: a auditoria é gravada direto, sem texto nem telefone.
      await this.audit.record({
        action: 'CREATE',
        entity: ENTITY_ENVIO,
        entityId: envio.id,
        before: null,
        after: {
          contaReceberId: envio.contaReceberId,
          marco: envio.marco,
          canal: envio.canal,
          status: envio.status,
          erro: envio.erro,
        },
      });
      registrados += 1;
    }
    return registrados;
  }

  private async enviar(
    regra: ReguaCobranca,
    profissional: { id: string; nome: string; telefone: string | null },
    titulo: { numero: number; saldo: Prisma.Decimal; vencimento: string },
  ): Promise<{ erro: 'SEM_TELEFONE' | 'SEM_CANAL' | null; mensagemId: string | null }> {
    if (!profissional.telefone?.trim()) return { erro: 'SEM_TELEFONE', mensagemId: null };
    const canalId = await this.canais.canalParaProfissional(profissional.id);
    if (!canalId) return { erro: 'SEM_CANAL', mensagemId: null };

    const conteudo = aplicarVariaveisCobranca(regra.mensagem, {
      nome: profissional.nome,
      valor: moeda(titulo.saldo),
      vencimento: ptBrDia(titulo.vencimento),
      titulo: `#${titulo.numero}`,
    });
    const mensagemId = await this.whatsapp.registrar({
      canalId,
      nome: profissional.nome,
      telefone: profissional.telefone,
      conteudo,
    });
    return { erro: null, mensagemId };
  }
}
