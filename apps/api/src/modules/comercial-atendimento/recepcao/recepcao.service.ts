import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import {
  RECEPCAO_STATUS_NA_CLINICA,
  type AgendamentoStatus,
  recepcaoPodeAlterar,
  type ListRecepcaoQuery,
  type RecepcaoItem,
  type UpdateRecepcaoStatusInput,
} from '@torres/shared';
import type { Prisma } from '../../../generated/prisma/client';
import { EscopoDadosService } from '../../../common/auth/escopo-dados.service';
import { isUuid } from '../../../common/auth/tokens';
import { BusinessException } from '../../../common/errors/api.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import { toLocalWallClock } from '../../../common/export/export-values';
import { paginate, type Page } from '../../../common/pagination/paginate';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import { intervaloDoPeriodo } from '../../../common/relatorios/periodo';
import { horariosDaTransicao } from './recepcao-horarios';

const INCLUDE = {
  paciente: { select: { nome: true } },
  profissional: { select: { nome: true } },
  sala: { select: { nome: true } },
} satisfies Prisma.AgendamentoInclude;

type AgendamentoRecepcao = Prisma.AgendamentoGetPayload<{ include: typeof INCLUDE }>;

/** Só o que a recepção vê: nada de evolução, anamnese, receita ou valores (R §7). */
export function toRecepcaoItem(a: AgendamentoRecepcao): RecepcaoItem {
  return {
    id: a.id,
    inicio: a.inicio.toISOString(),
    pacienteNome: a.paciente.nome,
    profissionalId: a.profissionalId,
    profissionalNome: a.profissional.nome,
    salaNome: a.sala?.nome ?? null,
    status: a.status,
    chegadaEm: a.chegadaEm?.toISOString() ?? null,
    entradaEm: a.entradaEm?.toISOString() ?? null,
    finalizadoEm: a.finalizadoEm?.toISOString() ?? null,
  };
}

/** Hoje, no fuso da clínica, como `[gte, lt)` em UTC. */
function intervaloDeHoje(): { gte: Date; lt: Date } {
  const hoje = toLocalWallClock(new Date()).toISOString().slice(0, 10);
  return intervaloDoPeriodo(hoje, hoje);
}

/** Atendimentos de hoje por status e profissionais com atendimento no dia (Painel "Hoje", #170). */
export interface ResumoDoDia {
  porStatus: Partial<Record<AgendamentoStatus, number>>;
  /** Profissionais com ao menos um atendimento que não saiu do dia (cancelado/reagendar ficam fora). */
  profissionaisComAtendimento: number;
}

/** Cancelado e "reagendar" saem do dia: o paciente não está mais agendado para hoje. */
const STATUS_FORA_DO_DIA: readonly AgendamentoStatus[] = ['CANCELADO', 'REAGENDAR'];

export function resumirDia(
  grupos: ReadonlyArray<{ profissionalId: string; status: AgendamentoStatus; quantidade: number }>,
): ResumoDoDia {
  const porStatus: ResumoDoDia['porStatus'] = {};
  const profissionais = new Set<string>();
  for (const { profissionalId, status, quantidade } of grupos) {
    porStatus[status] = (porStatus[status] ?? 0) + quantidade;
    if (!STATUS_FORA_DO_DIA.includes(status)) profissionais.add(profissionalId);
  }
  return { porStatus, profissionaisComAtendimento: profissionais.size };
}

/**
 * Tela Recepção (`/recepcao`, #147): atendimentos de hoje, fila de espera e status rápidos.
 * Agendamento é deste módulo (comercial-atendimento). A escrita é auditada pelo `@Audit` do
 * controller (a transação do interceptor grava o agendamento e o `audit_log` juntos).
 */
@Injectable()
export class RecepcaoService {
  constructor(
    private readonly txHost: TransactionHost<PrismaAdapter>,
    private readonly escopo: EscopoDadosService,
  ) {}

  /** Atendimentos de hoje, com filtro por profissional, sala e status. Respeita o escopo. */
  async listar(query: ListRecepcaoQuery): Promise<Page<RecepcaoItem>> {
    const where: Prisma.AgendamentoWhereInput = {
      deletedAt: null,
      inicio: intervaloDeHoje(),
      profissionalId: this.escopo.filtroProfissional(query.profissionalId),
      ...(query.salaId && { salaId: query.salaId }),
      ...(query.status && { status: query.status }),
    };
    const orderBy = this.orderBy(query.sort);
    const pagina = await paginate(query, {
      findMany: (p) =>
        this.txHost.tx.agendamento.findMany({ where, orderBy, include: INCLUDE, ...p }),
      count: () => this.txHost.tx.agendamento.count({ where }),
    });
    return { ...pagina, data: pagina.data.map(toRecepcaoItem) };
  }

  /** Resumo do dia para o Painel (#170). Respeita o escopo: perfil restrito conta só os seus. */
  async resumoDoDia(): Promise<ResumoDoDia> {
    const grupos = await this.txHost.tx.agendamento.groupBy({
      by: ['profissionalId', 'status'],
      where: {
        deletedAt: null,
        inicio: intervaloDeHoje(),
        profissionalId: this.escopo.filtroProfissional(),
      },
      _count: { _all: true },
    });
    return resumirDia(
      grupos.map((g) => ({
        profissionalId: g.profissionalId,
        status: g.status,
        quantidade: g._count._all,
      })),
    );
  }

  /** Fila de espera: quem já chegou e ainda não entrou, do que chegou há mais tempo. */
  async fila(): Promise<RecepcaoItem[]> {
    const agendamentos = await this.txHost.tx.agendamento.findMany({
      where: {
        deletedAt: null,
        inicio: intervaloDeHoje(),
        status: { in: [...RECEPCAO_STATUS_NA_CLINICA] },
        profissionalId: this.escopo.filtroProfissional(),
      },
      orderBy: [{ chegadaEm: 'asc' }, { inicio: 'asc' }, { numero: 'asc' }],
      include: INCLUDE,
    });
    return agendamentos.map(toRecepcaoItem);
  }

  /**
   * Botões de status rápido. Grava o horário da transição (chegada ao "Chegou"/"Aguardando").
   * Atendimento em curso ou finalizado é do médico: 422 `RECEPCAO_STATUS_TRAVADO`.
   * 404 se não existe; 403 se é de um profissional fora do escopo do usuário (issue #153).
   */
  async alterarStatus(id: string, input: UpdateRecepcaoStatusInput): Promise<RecepcaoItem> {
    const antes = await this.buscar(id);
    this.escopo.garantirProfissional(antes.profissionalId);
    if (!recepcaoPodeAlterar(antes.status)) {
      throw new BusinessException(
        'RECEPCAO_STATUS_TRAVADO',
        'O atendimento já está em curso ou finalizado e só o médico altera o status.',
      );
    }
    if (antes.status === input.status) return toRecepcaoItem(antes);

    const depois = await this.txHost.tx.agendamento.update({
      where: { id },
      data: { status: input.status, ...horariosDaTransicao(antes, input.status, new Date()) },
      include: INCLUDE,
    });
    return toRecepcaoItem(depois);
  }

  private async buscar(id: string): Promise<AgendamentoRecepcao> {
    const agendamento = isUuid(id)
      ? await this.txHost.tx.agendamento.findFirst({
          where: { id, deletedAt: null },
          include: INCLUDE,
        })
      : null;
    if (!agendamento) {
      throw new BusinessException(ErrorCode.NOT_FOUND, 'Agendamento não encontrado', {
        status: 404,
      });
    }
    return agendamento;
  }

  private orderBy(sort: ListRecepcaoQuery['sort']): Prisma.AgendamentoOrderByWithRelationInput[] {
    const { field, direction } = sort;
    const campos: Record<typeof field, Prisma.AgendamentoOrderByWithRelationInput> = {
      inicio: { inicio: direction },
      paciente: { paciente: { nome: direction } },
      profissional: { profissional: { nome: direction } },
      sala: { sala: { nome: direction } },
    };
    return [campos[field], { inicio: 'asc' }, { numero: 'asc' }];
  }
}
