export interface ContaFinanceiraEditavel {
  descricao: string;
  valor: string;
  dataVencimento: string;
  formaPagamentoId: string | null;
  planoContaId: string | null;
  documento: string | null;
  totalParcelas: number;
  observacoes: string | null;
}

/** Valores iniciais dos campos comuns do modal "Nova/Editar Conta". */
export function valoresIniciaisContaFinanceira(conta?: ContaFinanceiraEditavel) {
  return {
    descricao: conta?.descricao ?? '',
    valor: conta ? Number(conta.valor) : 0,
    dataVencimento: conta?.dataVencimento ?? '',
    formaPagamentoId: conta?.formaPagamentoId ?? null,
    planoContaId: conta?.planoContaId ?? null,
    documento: conta?.documento ?? '',
    totalParcelas: conta?.totalParcelas ?? 1,
    observacoes: conta?.observacoes ?? '',
  };
}
