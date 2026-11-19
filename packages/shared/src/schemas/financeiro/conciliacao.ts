import { z } from 'zod';
import { erroObrigatorio } from '../common/obrigatorio';
import { paginatedResponseSchema, paginationQuerySchema } from '../common/pagination';

/**
 * Tela Conciliação (`/conciliacao`, #46), aba "Bancaria". Parte 1: painel "Lançamentos do
 * Sistema" e card "Saldo Sistema". O extrato importado (OFX/CSV), a conciliação e o
 * "Novo Lançamento" ficam para a parte 2.
 *
 * Data de referência (decisão do dev na #46): a data do pagamento/recebimento para o que já foi
 * pago ou recebido; o vencimento para o que está pendente ou cancelado.
 */

/** Alternância "A Pagar" / "A Receber" do painel. */
export const CONCILIACAO_TIPOS_LANCAMENTO = ['PAGAR', 'RECEBER'] as const;
export const conciliacaoTipoLancamentoSchema = z.enum(CONCILIACAO_TIPOS_LANCAMENTO, {
  error: 'Tipo inválido',
});
export type ConciliacaoTipoLancamento = (typeof CONCILIACAO_TIPOS_LANCAMENTO)[number];

export const CONCILIACAO_ROTULO_TIPO_LANCAMENTO: Readonly<
  Record<ConciliacaoTipoLancamento, string>
> = {
  PAGAR: 'A Pagar',
  RECEBER: 'A Receber',
};

/** Status exibidos na pílula (print: "pago", "pendente", "recebido", "cancelado"). */
export const CONCILIACAO_STATUS_LANCAMENTO = ['PENDENTE', 'PAGO', 'RECEBIDO', 'CANCELADO'] as const;
export const conciliacaoStatusLancamentoSchema = z.enum(CONCILIACAO_STATUS_LANCAMENTO);
export type ConciliacaoStatusLancamento = (typeof CONCILIACAO_STATUS_LANCAMENTO)[number];

export const CONCILIACAO_ROTULO_STATUS_LANCAMENTO: Readonly<
  Record<ConciliacaoStatusLancamento, string>
> = {
  PENDENTE: 'pendente',
  PAGO: 'pago',
  RECEBIDO: 'recebido',
  CANCELADO: 'cancelado',
};

const dataObrigatoria = (rotulo: string) =>
  z
    .string({ error: erroObrigatorio(rotulo, 'f') })
    .min(1, { error: erroObrigatorio(rotulo, 'f') })
    .pipe(z.iso.date({ error: `${rotulo} inválida` }));

/** Período De/Até, obrigatório: a tela sempre abre com um período preenchido. */
const periodoSchema = z.object({
  de: dataObrigatoria('Data inicial'),
  ate: dataObrigatoria('Data final'),
});

function periodoValido(periodo: { de: string; ate: string }) {
  return periodo.de <= periodo.ate;
}
const PERIODO_INVALIDO = {
  error: 'A data inicial deve ser anterior ou igual à data final',
  path: ['ate'],
};

/** `GET /api/financeiro/conciliacao/lancamentos`. */
export const listLancamentosConciliacaoQuerySchema = paginationQuerySchema
  .extend(periodoSchema.shape)
  .extend({
    tipo: conciliacaoTipoLancamentoSchema.default('PAGAR'),
    /** "Todas as contas" quando ausente. */
    contaBancariaId: z.uuid({ error: 'Conta bancária inválida' }).optional(),
  })
  .refine(periodoValido, PERIODO_INVALIDO);
export type ListLancamentosConciliacaoQuery = z.infer<typeof listLancamentosConciliacaoQuerySchema>;

export const lancamentoConciliacaoSchema = z.object({
  /** Id da conta a pagar ou a receber de origem. */
  id: z.uuid(),
  tipo: conciliacaoTipoLancamentoSchema,
  descricao: z.string(),
  /** Cliente (A Receber). Em A Pagar o print não mostra pessoa. */
  pessoaNome: z.string().nullable(),
  /** Texto decimal (ex.: `"561.00"`). */
  valor: z.string(),
  /** Data de referência: pagamento/recebimento quando quitado; senão, vencimento. */
  data: z.iso.date(),
  status: conciliacaoStatusLancamentoSchema,
});
export type LancamentoConciliacao = z.infer<typeof lancamentoConciliacaoSchema>;

export const lancamentoConciliacaoPageSchema = paginatedResponseSchema(lancamentoConciliacaoSchema);
export type LancamentoConciliacaoPage = z.infer<typeof lancamentoConciliacaoPageSchema>;

/** `GET /api/financeiro/conciliacao/resumo`: card "Saldo Sistema" do período. */
export const resumoConciliacaoQuerySchema = periodoSchema.refine(periodoValido, PERIODO_INVALIDO);
export type ResumoConciliacaoQuery = z.infer<typeof resumoConciliacaoQuerySchema>;

export const resumoConciliacaoSchema = z.object({
  /** Soma das contas recebidas no período (pela data de recebimento). */
  recebido: z.string(),
  /** Soma das baixas de contas a pagar no período (pela data do pagamento). */
  pago: z.string(),
  /** Recebido − Pago. */
  saldo: z.string(),
});
export type ResumoConciliacao = z.infer<typeof resumoConciliacaoSchema>;
