import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import {
  HISTORICO_EVENTO_TIPO,
  type HistoricoEvento,
  type ProfissionalHistorico,
  type ProfissionalHistoricoEvento,
  type ProfissionalHistoricoQuery,
} from '@torres/shared';
import { EscopoDadosService } from '../../../common/auth/escopo-dados.service';
import { isUuid } from '../../../common/auth/tokens';
import { BusinessException } from '../../../common/errors/api.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import { NegociosHistoricoService } from '../../comercial-atendimento/pipeline/negocios-historico.service';
import { UsuariosService } from '../../configuracoes-gestao/usuarios/usuarios.service';
import { PacientesVinculadosService } from '../../consultorio-assistencial/pacientes-vinculados/pacientes-vinculados.service';

const NAO_EXCLUIDO = { deletedAt: null } as const;

/** Meia-noite UTC do dia de uma coluna `@db.Date`, em ISO. */
const dataIso = (data: Date): string => data.toISOString();

/**
 * Linha do tempo do relacionamento com o profissional (issue #144): do lead ao primeiro
 * atendimento. Não grava nada; junta, na leitura, o que cada módulo já guarda: CRM (lead, marcos e
 * atividades), contrato de sala (assinatura e encerramento), onboarding e atendimentos. Assim o
 * histórico do CRM acompanha o profissional assim que o negócio é ligado a ele.
 */
@Injectable()
export class ProfissionaisHistoricoService {
  constructor(
    private readonly txHost: TransactionHost<PrismaAdapter>,
    private readonly negocios: NegociosHistoricoService,
    private readonly atendimentos: PacientesVinculadosService,
    private readonly usuarios: UsuariosService,
    private readonly escopo: EscopoDadosService,
  ) {}

  async listar(
    profissionalId: string,
    query: ProfissionalHistoricoQuery,
  ): Promise<ProfissionalHistorico> {
    await this.garantirProfissional(profissionalId);
    const [crm, contratos, onboarding, atendimento] = await Promise.all([
      this.negocios.eventosDoProfissional(profissionalId),
      this.eventosDosContratos(profissionalId),
      this.eventosDoOnboarding(profissionalId),
      this.eventoDoPrimeiroAtendimento(profissionalId),
    ]);
    const fator = query.ordem === 'asc' ? 1 : -1;
    const data = [...crm, ...contratos, ...onboarding, ...atendimento]
      .filter((e) => !query.tipo || e.tipo === query.tipo)
      .sort(
        (a, b) => (a.ocorridoEm.localeCompare(b.ocorridoEm) || a.id.localeCompare(b.id)) * fator,
      );
    return { data };
  }

  private evento(
    id: string,
    evento: HistoricoEvento,
    ocorridoEm: string,
    extra: Partial<
      Pick<ProfissionalHistoricoEvento, 'detalhe' | 'autor' | 'link' | 'somenteData'>
    > = {},
  ): ProfissionalHistoricoEvento {
    return {
      id,
      tipo: HISTORICO_EVENTO_TIPO[evento],
      evento,
      ocorridoEm,
      somenteData: extra.somenteData ?? false,
      detalhe: extra.detalhe ?? null,
      autor: extra.autor ?? null,
      link: extra.link ?? null,
    };
  }

  /** Assinatura e encerramento (ou rescisão) dos contratos de sala do profissional. */
  private async eventosDosContratos(
    profissionalId: string,
  ): Promise<ProfissionalHistoricoEvento[]> {
    const contratos = await this.txHost.tx.contratoSala.findMany({
      where: { profissionalId, ...NAO_EXCLUIDO },
      select: {
        id: true,
        assinadoEm: true,
        encerradoEm: true,
        status: true,
        motivoEncerramento: true,
        sala: { select: { nome: true } },
      },
    });
    return contratos.flatMap((c) => {
      const eventos: ProfissionalHistoricoEvento[] = [];
      if (c.assinadoEm) {
        eventos.push(
          this.evento(`contrato:${c.id}:assinado`, 'CONTRATO_ASSINADO', dataIso(c.assinadoEm), {
            detalhe: c.sala.nome,
            link: '/salas',
            somenteData: true,
          }),
        );
      }
      if (c.encerradoEm && (c.status === 'ENCERRADO' || c.status === 'CANCELADO')) {
        const cancelado = c.status === 'CANCELADO';
        eventos.push(
          this.evento(
            `contrato:${c.id}:${cancelado ? 'cancelado' : 'encerrado'}`,
            cancelado ? 'CONTRATO_CANCELADO' : 'CONTRATO_ENCERRADO',
            dataIso(c.encerradoEm),
            { detalhe: c.motivoEncerramento ?? c.sala.nome, link: '/salas', somenteData: true },
          ),
        );
      }
      return eventos;
    });
  }

  /** Início do onboarding (assinatura) e a única etapa marcada por uma pessoa: a recepção. */
  private async eventosDoOnboarding(
    profissionalId: string,
  ): Promise<ProfissionalHistoricoEvento[]> {
    const onboarding = await this.txHost.tx.profissionalOnboarding.findUnique({
      where: { profissionalId },
      select: {
        id: true,
        iniciadoEm: true,
        recepcaoOrientadaEm: true,
        recepcaoOrientadaPorId: true,
        contrato: { select: { sala: { select: { nome: true } } } },
      },
    });
    if (!onboarding) return [];
    const eventos = [
      this.evento(
        `onboarding:${onboarding.id}:iniciado`,
        'ONBOARDING_INICIADO',
        dataIso(onboarding.iniciadoEm),
        {
          detalhe: onboarding.contrato.sala.nome,
          somenteData: true,
        },
      ),
    ];
    if (onboarding.recepcaoOrientadaEm) {
      const nomes = await this.usuarios.nomesPorIds(
        onboarding.recepcaoOrientadaPorId ? [onboarding.recepcaoOrientadaPorId] : [],
      );
      eventos.push(
        this.evento(
          `onboarding:${onboarding.id}:recepcao`,
          'RECEPCAO_ORIENTADA',
          onboarding.recepcaoOrientadaEm.toISOString(),
          {
            autor: onboarding.recepcaoOrientadaPorId
              ? (nomes.get(onboarding.recepcaoOrientadaPorId) ?? null)
              : null,
          },
        ),
      );
    }
    return eventos;
  }

  private async eventoDoPrimeiroAtendimento(
    profissionalId: string,
  ): Promise<ProfissionalHistoricoEvento[]> {
    const quando = await this.atendimentos.primeiroAtendimentoFinalizado(profissionalId);
    return quando
      ? [
          this.evento(
            `atendimento:${profissionalId}:primeiro`,
            'PRIMEIRO_ATENDIMENTO',
            quando.toISOString(),
          ),
        ]
      : [];
  }

  private async garantirProfissional(profissionalId: string): Promise<void> {
    const existe = isUuid(profissionalId)
      ? await this.txHost.tx.profissional.count({ where: { id: profissionalId, ...NAO_EXCLUIDO } })
      : 0;
    if (existe === 0) {
      throw new BusinessException(ErrorCode.NOT_FOUND, 'Profissional não encontrado', {
        status: 404,
      });
    }
    this.escopo.garantirProfissional(profissionalId);
  }
}
