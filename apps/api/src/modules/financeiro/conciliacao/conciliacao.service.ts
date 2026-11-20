import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import type {
  LancamentoConciliacao,
  ListLancamentosConciliacaoQuery,
  ResumoConciliacao,
  ResumoConciliacaoQuery,
} from '@torres/shared';
import { Prisma } from '../../../generated/prisma/client';
import { paginate, type Page } from '../../../common/pagination/paginate';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';

import { DO_TORRES } from '../conta-financeira';

const NAO_EXCLUIDAS = { deletedAt: null } as const;

const dia = (data: Date) => data.toISOString().slice(0, 10);

function intervalo(periodo: { de: string; ate: string }) {
  return { gte: new Date(periodo.de), lte: new Date(periodo.ate) };
}

const INCLUDE_PAGAR = {
  baixas: {
    where: NAO_EXCLUIDAS,
    orderBy: [{ dataPagamento: 'desc' }, { createdAt: 'desc' }],
    take: 1,
    select: { dataPagamento: true },
  },
} satisfies Prisma.ContaPagarInclude;

const INCLUDE_RECEBER = {
  paciente: { select: { nome: true } },
} satisfies Prisma.ContaReceberInclude;

type ContaPagarLancamento = Prisma.ContaPagarGetPayload<{ include: typeof INCLUDE_PAGAR }>;
type ContaReceberLancamento = Prisma.ContaReceberGetPayload<{ include: typeof INCLUDE_RECEBER }>;

/** Conta a pagar como lançamento: a data é a do último pagamento quando paga. */
export function lancamentoDePagar(conta: ContaPagarLancamento): LancamentoConciliacao {
  const ultimaBaixa = conta.baixas[0];
  const data =
    conta.status === 'PAGO' && ultimaBaixa ? ultimaBaixa.dataPagamento : conta.dataVencimento;
  return {
    id: conta.id,
    tipo: 'PAGAR',
    descricao: conta.descricao,
    pessoaNome: null,
    valor: conta.valor.toString(),
    data: dia(data),
    status: conta.status,
  };
}

/** Conta a receber como lançamento: a data é a do recebimento quando recebida. */
export function lancamentoDeReceber(conta: ContaReceberLancamento): LancamentoConciliacao {
  const data =
    conta.status === 'RECEBIDO' && conta.dataRecebimento
      ? conta.dataRecebimento
      : conta.dataVencimento;
  return {
    id: conta.id,
    tipo: 'RECEBER',
    descricao: conta.descricao,
    pessoaNome: conta.paciente?.nome ?? null,
    valor: conta.valor.toString(),
    data: dia(data),
    status: conta.status,
  };
}

/**
 * Conciliação (`/conciliacao`, #46), aba "Bancaria". Lê as contas a pagar e a receber do próprio
 * módulo Financeiro.
 *
 * Data de referência (decisão do dev na #46): a do pagamento/recebimento para o que já foi
 * quitado; o vencimento para o que está pendente ou cancelado.
 */
@Injectable()
export class ConciliacaoService {
  constructor(private readonly txHost: TransactionHost<PrismaAdapter>) {}

  /** Painel "Lançamentos do Sistema", com a alternância A Pagar / A Receber e o filtro de conta. */
  lancamentos(query: ListLancamentosConciliacaoQuery): Promise<Page<LancamentoConciliacao>> {
    return query.tipo === 'PAGAR' ? this.lancamentosPagar(query) : this.lancamentosReceber(query);
  }

  /** Card "Saldo Sistema": Recebido e Pago no período, pela data do recebimento/pagamento. */
  async resumo(query: ResumoConciliacaoQuery): Promise<ResumoConciliacao> {
    const periodo = intervalo(query);
    const [recebido, pago] = await Promise.all([
      this.txHost.tx.contaReceber.aggregate({
        _sum: { valor: true },
        where: { ...DO_TORRES, status: 'RECEBIDO', dataRecebimento: periodo },
      }),
      this.txHost.tx.contaPagarBaixa.aggregate({
        _sum: { valorPago: true },
        where: { ...NAO_EXCLUIDAS, dataPagamento: periodo, contaPagar: NAO_EXCLUIDAS },
      }),
    ]);
    const totalRecebido = recebido._sum.valor ?? new Prisma.Decimal(0);
    const totalPago = pago._sum.valorPago ?? new Prisma.Decimal(0);
    return {
      recebido: totalRecebido.toFixed(2),
      pago: totalPago.toFixed(2),
      saldo: totalRecebido.sub(totalPago).toFixed(2),
    };
  }

  private async lancamentosPagar(
    query: ListLancamentosConciliacaoQuery,
  ): Promise<Page<LancamentoConciliacao>> {
    const periodo = intervalo(query);
    const where: Prisma.ContaPagarWhereInput = {
      ...NAO_EXCLUIDAS,
      OR: [
        { status: 'PAGO', baixas: { some: { ...NAO_EXCLUIDAS, dataPagamento: periodo } } },
        { status: { not: 'PAGO' }, dataVencimento: periodo },
      ],
      ...(query.contaBancariaId && {
        baixas: { some: { ...NAO_EXCLUIDAS, contaBancariaId: query.contaBancariaId } },
      }),
    };
    const page = await paginate(query, {
      findMany: (p) =>
        this.txHost.tx.contaPagar.findMany({
          where,
          orderBy: [{ dataVencimento: 'asc' }, { id: 'asc' }],
          include: INCLUDE_PAGAR,
          ...p,
        }),
      count: () => this.txHost.tx.contaPagar.count({ where }),
    });
    return { ...page, data: page.data.map(lancamentoDePagar) };
  }

  private async lancamentosReceber(
    query: ListLancamentosConciliacaoQuery,
  ): Promise<Page<LancamentoConciliacao>> {
    const periodo = intervalo(query);
    const where: Prisma.ContaReceberWhereInput = {
      ...DO_TORRES,
      OR: [
        { status: 'RECEBIDO', dataRecebimento: periodo },
        { status: { not: 'RECEBIDO' }, dataVencimento: periodo },
      ],
      ...(query.contaBancariaId && { contaBancariaId: query.contaBancariaId }),
    };
    const page = await paginate(query, {
      findMany: (p) =>
        this.txHost.tx.contaReceber.findMany({
          where,
          orderBy: [{ dataVencimento: 'asc' }, { id: 'asc' }],
          include: INCLUDE_RECEBER,
          ...p,
        }),
      count: () => this.txHost.tx.contaReceber.count({ where }),
    });
    return { ...page, data: page.data.map(lancamentoDeReceber) };
  }
}
