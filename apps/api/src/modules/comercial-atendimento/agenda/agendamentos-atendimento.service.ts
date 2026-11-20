import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import type {
  AgendamentoStatus,
  AtendimentoMedicoItem,
  CreateRecebimentoInput,
  EvolucaoVozAgendamento,
  ListAtendimentoMedicoQuery,
  ListEvolucaoVozQuery,
  PagamentoAtendimento,
  Recebimento,
} from '@torres/shared';
import type { Prisma } from '../../../generated/prisma/client';
import { AuditService } from '../../../common/audit/audit.service';
import { EscopoDadosService } from '../../../common/auth/escopo-dados.service';
import { isUuid } from '../../../common/auth/tokens';
import { BusinessException } from '../../../common/errors/api.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import { toLocalWallClock } from '../../../common/export/export-values';
import { paginate, type Page } from '../../../common/pagination/paginate';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import { intervaloDoPeriodo } from '../../../common/relatorios/periodo';
import { FormasPagamentoService } from '../../financeiro/formas-pagamento/formas-pagamento.service';

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

function toEvolucaoVozAgendamento(a: AgendamentoCompleto): EvolucaoVozAgendamento {
  return { ...toAtendimentoMedicoItem(a), numero: a.numero };
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
    formaPagamentoId: a.formaPagamentoId,
    pagoEm: a.pagoEm?.toISOString() ?? null,
  };
}

type RecebimentoComForma = Prisma.AgendamentoRecebimentoGetPayload<{
  include: { formaPagamento: { select: { nome: true } } };
}>;

export function toRecebimento(r: RecebimentoComForma): Recebimento {
  return {
    id: r.id,
    agendamentoId: r.agendamentoId,
    valor: Number(r.valor),
    formaPagamentoId: r.formaPagamentoId,
    formaPagamentoNome: r.formaPagamento.nome,
    recebidoEm: r.recebidoEm.toISOString(),
  };
}

/** Arredonda para centavos, evitando resíduo de ponto flutuante nas somas. */
function arredondar(valor: number): number {
  return Math.round(valor * 100) / 100;
}

function somar(valores: readonly number[]): number {
  return arredondar(valores.reduce((total, valor) => total + valor, 0));
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
    private readonly formasPagamento: FormasPagamentoService,
    private readonly escopo: EscopoDadosService,
  ) {}

  /** Card "Registrar Recebimento": valor da consulta, já recebido, saldo e formas aceitas. */
  async pagamento(id: string): Promise<PagamentoAtendimento> {
    const agendamento = await this.buscar(id);
    const recebimentos = await this.txHost.tx.agendamentoRecebimento.findMany({
      where: { agendamentoId: id },
      include: { formaPagamento: { select: { nome: true } } },
      orderBy: [{ recebidoEm: 'asc' }, { id: 'asc' }],
    });
    const valorConsulta = agendamento.valor === null ? null : Number(agendamento.valor);
    const recebido = somar(recebimentos.map((r) => Number(r.valor)));
    return {
      valorConsulta,
      recebido,
      saldo: valorConsulta === null ? null : Math.max(arredondar(valorConsulta - recebido), 0),
      pago: agendamento.pagoEm !== null,
      recebimentos: recebimentos.map(toRecebimento),
      formasPagamento: await this.formasPagamento.paraRecebimentoSemCartao(),
    };
  }

  /**
   * "Registrar Pagamento": grava o recebimento (parcial ou total). Quando a soma cobre o valor da
   * consulta (ou a consulta não tem valor), o agendamento fica pago com a forma deste recebimento.
   */
  async registrarRecebimento(id: string, input: CreateRecebimentoInput): Promise<Recebimento> {
    const situacao = await this.pagamento(id);
    const agendamento = await this.buscar(id);
    if (agendamento.status === 'CANCELADO') {
      throw new BusinessException(
        'AGENDAMENTO_CANCELADO',
        'Agendamento cancelado não pode receber pagamento.',
      );
    }
    if (situacao.pago) {
      throw new BusinessException('AGENDAMENTO_JA_PAGO', 'Este atendimento já está pago.');
    }
    if (await this.formasPagamento.ehCartao(input.formaPagamentoId)) {
      throw new BusinessException(
        'FORMA_PAGAMENTO_CARTAO',
        'Cartão se lança pela Agenda: a conciliação precisa de bandeira, NSU e parcelas.',
      );
    }
    if (situacao.saldo !== null && input.valor > situacao.saldo) {
      throw new BusinessException(
        'VALOR_ACIMA_DO_SALDO',
        'O valor a receber não pode ser maior que o saldo.',
      );
    }

    const criado = await this.txHost.tx.agendamentoRecebimento.create({
      data: { agendamentoId: id, valor: input.valor, formaPagamentoId: input.formaPagamentoId },
      include: { formaPagamento: { select: { nome: true } } },
    });
    const quitado = situacao.saldo === null || arredondar(situacao.saldo - input.valor) <= 0;
    if (quitado) {
      const depois = await this.txHost.tx.agendamento.update({
        where: { id },
        data: { pagoEm: criado.recebidoEm, formaPagamentoId: input.formaPagamentoId },
        include: INCLUDE,
      });
      await this.audit.record({
        action: 'UPDATE',
        entity: 'Agendamento',
        entityId: id,
        before: estadoAuditado(agendamento),
        after: estadoAuditado(depois),
      });
    }
    return toRecebimento(criado);
  }

  /** Agendamentos do dia (fuso da clínica), com filtro por profissional e status. */
  async listarDoDia(query: ListAtendimentoMedicoQuery): Promise<Page<AtendimentoMedicoItem>> {
    const { gte, lt } = intervaloDoPeriodo(query.data, query.data);
    const where: Prisma.AgendamentoWhereInput = {
      deletedAt: null,
      inicio: { gte, lt },
      profissionalId: this.escopo.filtroProfissional(query.profissionalId),
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

  /**
   * "Agendamentos de Hoje" da tela Evolução por Voz (#39): o dia sem os cancelados, com busca
   * pelo nome do paciente e filtro por profissional.
   */
  async listarParaEvolucaoVoz(query: ListEvolucaoVozQuery): Promise<Page<EvolucaoVozAgendamento>> {
    const { gte, lt } = intervaloDoPeriodo(query.data, query.data);
    const where: Prisma.AgendamentoWhereInput = {
      deletedAt: null,
      inicio: { gte, lt },
      status: { not: 'CANCELADO' },
      profissionalId: this.escopo.filtroProfissional(query.profissionalId),
      ...(query.search && {
        paciente: { nome: { contains: query.search, mode: 'insensitive' } },
      }),
    };
    const orderBy = this.orderBy(query.sort);
    const pagina = await paginate(query, {
      findMany: (p) =>
        this.txHost.tx.agendamento.findMany({ where, orderBy, include: INCLUDE, ...p }),
      count: () => this.txHost.tx.agendamento.count({ where }),
    });
    return { ...pagina, data: pagina.data.map(toEvolucaoVozAgendamento) };
  }

  /**
   * Aba "Fila do Dia" da tela Soroterapia (#44): agendamentos de hoje (dia da clínica) cujo tipo é
   * "É soroterapia (agenda separada)", menos os cancelados, por horário. Só os profissionais do
   * escopo do usuário (issue #153).
   */
  async listarFilaSoroterapia(): Promise<AtendimentoMedicoItem[]> {
    const hoje = toLocalWallClock(new Date()).toISOString().slice(0, 10);
    const { gte, lt } = intervaloDoPeriodo(hoje, hoje);
    const agendamentos = await this.txHost.tx.agendamento.findMany({
      where: {
        deletedAt: null,
        inicio: { gte, lt },
        status: { not: 'CANCELADO' },
        tipoAgendamento: { soroterapia: true },
        profissionalId: this.escopo.filtroProfissional(),
      },
      orderBy: [{ inicio: 'asc' }, { id: 'asc' }],
      include: INCLUDE,
    });
    return agendamentos.map(toAtendimentoMedicoItem);
  }

  /** Cabeçalho da sessão de gravação, com o número do agendamento. 404/403 como `resumo`. */
  async resumoComNumero(id: string): Promise<EvolucaoVozAgendamento> {
    return toEvolucaoVozAgendamento(await this.buscar(id));
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

  /** 404 se não existe; 403 se é de um profissional fora do escopo do usuário (issue #153). */
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
    this.escopo.garantirProfissional(agendamento.profissionalId);
    return agendamento;
  }

  private orderBy(
    sort: ListAtendimentoMedicoQuery['sort'] | ListEvolucaoVozQuery['sort'],
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
