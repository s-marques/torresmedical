import type { Prisma } from '../../generated/prisma/client';
import { BusinessException } from '../../common/errors/api.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import type { ExportColumn } from '../../common/export/export.types';

/**
 * Base comum de Contas a Pagar e Contas a Receber (mesmos campos, filtros e ordenação). Cada
 * service acrescenta só o que é dele: o beneficiário/cliente e, em Contas a Pagar, as baixas.
 */

export const NAO_EXCLUIDAS = { deletedAt: null } as const;

/**
 * Contas a receber do Torres: exclui as receitas dos profissionais (`profissionalId`, tela Receita
 * Profissionais), que não entram em Contas a Receber, Conciliação nem saldos ("sem misturar o
 * caixa dos médicos", requisitos do cliente).
 */
export const DO_TORRES = { ...NAO_EXCLUIDAS, profissionalId: null } as const;

/** Relações exibidas pelo nome nas duas telas. */
export const INCLUDE_CONTA_FINANCEIRA = {
  formaPagamento: { select: { nome: true } },
  planoConta: { select: { nome: true } },
} as const;

interface ContaFinanceiraComRelacoes {
  id: string;
  numero: number;
  descricao: string;
  valor: Prisma.Decimal;
  dataVencimento: Date;
  formaPagamentoId: string | null;
  formaPagamento: { nome: string } | null;
  planoContaId: string | null;
  planoConta: { nome: string } | null;
  documento: string | null;
  totalParcelas: number;
  observacoes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Campos da resposta comuns às duas telas. */
export function camposContaFinanceira(conta: ContaFinanceiraComRelacoes) {
  return {
    id: conta.id,
    numero: conta.numero,
    descricao: conta.descricao,
    valor: conta.valor.toString(),
    dataVencimento: conta.dataVencimento.toISOString().slice(0, 10),
    formaPagamentoId: conta.formaPagamentoId,
    formaPagamentoNome: conta.formaPagamento?.nome ?? null,
    planoContaId: conta.planoContaId,
    planoContaNome: conta.planoConta?.nome ?? null,
    documento: conta.documento,
    totalParcelas: conta.totalParcelas,
    observacoes: conta.observacoes,
    createdAt: conta.createdAt.toISOString(),
    updatedAt: conta.updatedAt.toISOString(),
  };
}

export function contaNaoEncontrada(mensagem: string): BusinessException {
  return new BusinessException(ErrorCode.NOT_FOUND, mensagem, { status: 404 });
}

interface FiltrosContaFinanceira {
  search?: string;
  status?: string;
  vencimentoDe?: string;
  vencimentoAte?: string;
}

/**
 * Filtros do grid. O chip "Vencido" filtra contas Pendentes com vencimento antes de hoje (não é
 * status gravado). `buscaExtra` acrescenta à busca textual os campos próprios da tela.
 */
export function whereContaFinanceira<S extends string, W extends object = never>(
  query: FiltrosContaFinanceira,
  buscaExtra: readonly W[] = [],
) {
  const vencidas = query.status === 'VENCIDO';
  return {
    ...NAO_EXCLUIDAS,
    status: (vencidas ? 'PENDENTE' : query.status) as S | undefined,
    dataVencimento: {
      gte: query.vencimentoDe ? new Date(query.vencimentoDe) : undefined,
      lte: query.vencimentoAte ? new Date(query.vencimentoAte) : undefined,
      lt: vencidas ? new Date() : undefined,
    },
    ...(query.search && {
      OR: [
        { descricao: { contains: query.search, mode: 'insensitive' as const } },
        { documento: { contains: query.search, mode: 'insensitive' as const } },
        ...buscaExtra,
      ],
    }),
  };
}

/**
 * Ordenação do grid: "#" ordena pelo número e a coluna da pessoa (cliente/beneficiário) usa a
 * ordem que a tela informar; o id desempata.
 */
export function orderByContaFinanceira<T>(
  sort: { field: string; direction: 'asc' | 'desc' },
  campoPessoa: string,
  ordemPessoa: (direction: 'asc' | 'desc') => T,
): T[] {
  const { field, direction } = sort;
  let principal: T;
  if (field === 'id') principal = { numero: direction } as T;
  else if (field === campoPessoa) principal = ordemPessoa(direction);
  else principal = { [field]: direction } as T;
  return [principal, { id: direction } as T];
}

interface ContaExportavel {
  numero: number;
  descricao: string;
  valor: string;
  dataVencimento: string;
}

/** Colunas exportáveis, iguais às do grid: "#", Descrição, a pessoa, Valor, Vencimento e Status. */
export function colunasExportContaFinanceira<C extends ContaExportavel, K extends string>(
  pessoa: ExportColumn<C, K>,
  rotuloStatus: (conta: C) => string,
): readonly ExportColumn<C, K>[] {
  return [
    { key: 'id' as K, header: '#', type: 'number', value: (c) => c.numero },
    { key: 'descricao' as K, header: 'Descrição', value: (c) => c.descricao, width: 3 },
    pessoa,
    { key: 'valor' as K, header: 'Valor', type: 'currency', value: (c) => c.valor },
    {
      key: 'dataVencimento' as K,
      header: 'Vencimento',
      type: 'date',
      value: (c) => c.dataVencimento,
    },
    { key: 'status' as K, header: 'Status', value: rotuloStatus },
  ];
}
