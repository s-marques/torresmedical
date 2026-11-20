import { z } from 'zod';

const MES = /^\d{4}-(0[1-9]|1[0-2])$/;

/** `GET /api/financeiro/indicadores`: mês (`AAAA-MM`); vazio = mês atual. */
export const indicadoresFinanceirosQuerySchema = z.strictObject({
  mes: z
    .string()
    .trim()
    .regex(MES, { error: 'Mês inválido' })
    .optional()
    .or(z.literal('').transform(() => undefined)),
});

export type IndicadoresFinanceirosQuery = z.infer<typeof indicadoresFinanceirosQuerySchema>;

/** Formatos de exibição de um indicador. */
export const FORMATOS_INDICADOR = ['moeda', 'percentual', 'inteiro'] as const;
export type FormatoIndicador = (typeof FORMATOS_INDICADOR)[number];

/** Seções da tela, na ordem do inventário. */
export const SECOES_INDICADORES = ['receitas', 'ocupacao-salas', 'clientes'] as const;
export type SecaoIndicadores = (typeof SECOES_INDICADORES)[number];

/**
 * Um card. `valor` e `anterior` nulos = ainda sem fonte de dados (aparece como "—").
 * `variacao` é a variação percentual sobre o mês anterior; nula quando o anterior é zero ou nulo.
 */
export const indicadorFinanceiroSchema = z.object({
  id: z.string(),
  secao: z.enum(SECOES_INDICADORES),
  formato: z.enum(FORMATOS_INDICADOR),
  valor: z.number().nullable(),
  anterior: z.number().nullable(),
  variacao: z.number().nullable(),
  /** Texto de apoio opcional (ex.: "38/132 períodos"). */
  detalhe: z.string().nullable(),
});

export type IndicadorFinanceiro = z.infer<typeof indicadorFinanceiroSchema>;

export const indicadoresFinanceirosSchema = z.object({
  /** Mês consultado (`AAAA-MM`). */
  mes: z.string(),
  /** Mês anterior usado na comparação (`AAAA-MM`). */
  mesAnterior: z.string(),
  indicadores: z.array(indicadorFinanceiroSchema),
});

export type IndicadoresFinanceiros = z.infer<typeof indicadoresFinanceirosSchema>;

/** Variação percentual de `atual` sobre `anterior`, com 1 casa; nula sem base de comparação. */
export function variacaoPercentual(atual: number | null, anterior: number | null): number | null {
  if (atual === null || anterior === null || anterior === 0) return null;
  return Math.round(((atual - anterior) / Math.abs(anterior)) * 1000) / 10;
}
