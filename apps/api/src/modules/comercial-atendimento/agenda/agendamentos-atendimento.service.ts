import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import type {
  AgendamentoStatus,
  AtendimentoMedicoItem,
  ListAtendimentoMedicoQuery,
} from '@torres/shared';
import type { Prisma } from '../../../generated/prisma/client';
import { AuditService } from '../../../common/audit/audit.service';
import { isUuid } from '../../../common/auth/tokens';
import { BusinessException } from '../../../common/errors/api.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import { paginate, type Page } from '../../../common/pagination/paginate';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import { intervaloDoPeriodo } from '../../../common/relatorios/periodo';

const INCLUDE = {
  paciente: { select: { nome: true } },
  profissional: { select: { nome: true } },
  tipoAgendamento: { select: { nome: true } },
} satisfies Prisma.AgendamentoInclude;

type AgendamentoCompleto = Prisma.AgendamentoGetPayload<{ include: typeof INCLUDE }>;

export function toAtendimentoMedicoItem(a: AgendamentoCompleto): AtendimentoMedicoItem {
  return {
    id: a.id,
    inicio: a.inicio.toISOString(),
    pacienteId: a.pacienteId,
    pacienteNome: a.paciente.nome,
    profissionalId: a.profissionalId,
    profissionalNome: a.profissional.nome,
    procedimento: a.tipoAgendamento?.nome ?? null,
    status: a.status,
    pago: a.pagoEm !== null,
  };
}

/** Estado gravado no audit_log ao mudar o status do agendamento. */
function estadoAuditado(a: AgendamentoCompleto) {
  return {
    id: a.id,
    numero: a.numero,
    pacienteId: a.pacienteId,
    profissionalId: a.profissionalId,
    inicio: a.inicio.toISOString(),
    status: a.status,
  };
}

/**
 * Agendamentos vistos pela tela Atendimento Médico (consultorio-assistencial, #38). Agendamento
 * pertence a este módulo: a outra tela lê e muda o status só por aqui (CLAUDE.md, seção 3).
 */
@Injectable()
export class AgendamentosAtendimentoService {
  constructor(
    private readonly txHost: TransactionHost<PrismaAdapter>,
    private readonly audit: AuditService,
  ) {}

  /** Agendamentos do dia (fuso da clínica), com filtro por profissional e status. */
  async listarDoDia(query: ListAtendimentoMedicoQuery): Promise<Page<AtendimentoMedicoItem>> {
    const { gte, lt } = intervaloDoPeriodo(query.data, query.data);
    const where: Prisma.AgendamentoWhereInput = {
      deletedAt: null,
      inicio: { gte, lt },
      ...(query.profissionalId && { profissionalId: query.profissionalId }),
      ...(query.status && { status: query.status }),
    };
    const orderBy = this.orderBy(query.sort);
    const pagina = await paginate(query, {
      findMany: (p) =>
        this.txHost.tx.agendamento.findMany({ where, orderBy, include: INCLUDE, ...p }),
      count: () => this.txHost.tx.agendamento.count({ where }),
    });
    return { ...pagina, data: pagina.data.map(toAtendimentoMedicoItem) };
  }

  /** Cabeçalho do detalhe. 404 se o agendamento não existir. */
  async resumo(id: string): Promise<AtendimentoMedicoItem> {
    return toAtendimentoMedicoItem(await this.buscar(id));
  }

  /** Muda o status (ex.: `EM_ATENDIMENTO` no "Atender") e grava o audit_log do agendamento. */
  async alterarStatus(id: string, status: AgendamentoStatus): Promise<AtendimentoMedicoItem> {
    const antes = await this.buscar(id);
    if (antes.status === status) return toAtendimentoMedicoItem(antes);
    const depois = await this.txHost.tx.agendamento.update({
      where: { id },
      data: { status },
      include: INCLUDE,
    });
    await this.audit.record({
      action: 'UPDATE',
      entity: 'Agendamento',
      entityId: id,
      before: estadoAuditado(antes),
      after: estadoAuditado(depois),
    });
    return toAtendimentoMedicoItem(depois);
  }

  private async buscar(id: string): Promise<AgendamentoCompleto> {
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

  private orderBy(
    sort: ListAtendimentoMedicoQuery['sort'],
  ): Prisma.AgendamentoOrderByWithRelationInput[] {
    const { field, direction } = sort;
    const principal: Prisma.AgendamentoOrderByWithRelationInput =
      field === 'paciente'
        ? { paciente: { nome: direction } }
        : field === 'profissional'
          ? { profissional: { nome: direction } }
          : { inicio: direction };
    return [principal, { inicio: 'asc' }, { numero: 'asc' }];
  }
}
