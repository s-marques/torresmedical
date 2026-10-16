import { z } from 'zod';
import type { TelaId } from '../../menu/menu';
import {
  exportColumnsSchema,
  exportFormatSchema,
  sortSchema,
  type SortDirection,
} from '../common/list-query';
import { paginationMetaSchema, paginationQuerySchema } from '../common/pagination';

/** Tela de Relatórios de um módulo, ex.: `financeiro.relatorios`. */
export type TelaRelatorios = Extract<TelaId, `${string}.relatorios`>;

/** Data do calendário (`AAAA-MM-DD`), sem hora. */
const DATA = /^(\d{4})-(\d{2})-(\d{2})$/;

export const PERIODO_INVALIDO = 'A data inicial deve ser anterior ou igual à final';

function dataValida(valor: string): boolean {
  const partes = DATA.exec(valor);
  if (!partes) return false;
  const [ano, mes, dia] = partes.slice(1).map(Number) as [number, number, number];
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  return (
    data.getUTCFullYear() === ano && data.getUTCMonth() === mes - 1 && data.getUTCDate() === dia
  );
}

function dataSchema(qual: 'inicial' | 'final') {
  return z
    .string({ error: `Informe a data ${qual}` })
    .trim()
    .min(1, { error: `Informe a data ${qual}`, abort: true })
    .refine(dataValida, { error: `Data ${qual} inválida` });
}

/** Campos De/Até (`AAAA-MM-DD`), obrigatórios. */
export const periodoShape = { de: dataSchema('inicial'), ate: dataSchema('final') };

/**
 * De ≤ Até; o erro aparece no campo "Até". Datas `AAAA-MM-DD` comparam como texto. Com alguma
 * data inválida, vale só o erro do campo.
 */
export function comPeriodoValido<T extends z.ZodType<{ de: string; ate: string }>>(schema: T) {
  return schema.refine(({ de, ate }) => !dataValida(de) || !dataValida(ate) || de <= ate, {
    error: PERIODO_INVALIDO,
    path: ['ate'],
  });
}

/** Período De/Até das telas de Relatórios. */
export const periodoRelatorioSchema = comPeriodoValido(z.object(periodoShape));

export type PeriodoRelatorio = z.infer<typeof periodoRelatorioSchema>;

/** Seleção da `ReportPage`: o relatório (vazio enquanto nenhum foi escolhido) e o período. */
export const selecaoRelatorioSchema = comPeriodoValido(
  z.object({ relatorio: z.string().trim(), ...periodoShape }),
);

export type SelecaoRelatorio = z.infer<typeof selecaoRelatorioSchema>;

/** Tipos de coluna (iguais aos da exportação): definem a formatação no grid e no arquivo. */
export const TIPOS_COLUNA_RELATORIO = [
  'text',
  'number',
  'currency',
  'date',
  'datetime',
  'boolean',
] as const;

export type TipoColunaRelatorio = (typeof TIPOS_COLUNA_RELATORIO)[number];

export const colunaRelatorioSchema = z.object({
  id: z.string(),
  titulo: z.string(),
  tipo: z.enum(TIPOS_COLUNA_RELATORIO),
  ordenavel: z.boolean(),
});

export type ColunaRelatorio = z.infer<typeof colunaRelatorioSchema>;

const opcaoSchema = z.object({ valor: z.string(), rotulo: z.string() });

/** Filtro extra do relatório, além do período. */
export const filtroRelatorioSchema = z.object({
  tipo: z.literal('select'),
  parametro: z.string(),
  rotulo: z.string(),
  opcoes: z.array(opcaoSchema),
});

export type FiltroRelatorio = z.infer<typeof filtroRelatorioSchema>;

/** Relatório no catálogo do módulo: o front monta o grid a partir dele. */
export const relatorioResumoSchema = z.object({
  id: z.string(),
  nome: z.string(),
  colunas: z.array(colunaRelatorioSchema),
  filtros: z.array(filtroRelatorioSchema),
});

export type RelatorioResumo = z.infer<typeof relatorioResumoSchema>;

/** `GET /api/<modulo>/relatorios`: só os relatórios permitidos ao usuário. */
export const catalogoRelatoriosSchema = z.object({ data: z.array(relatorioResumoSchema) });

export type CatalogoRelatorios = z.infer<typeof catalogoRelatoriosSchema>;

/** Linha do resultado: valor de cada coluna pelo `id` (datas em ISO, valores decimais em texto). */
export const linhaRelatorioSchema = z.record(z.string(), z.unknown());

export type LinhaRelatorio = z.infer<typeof linhaRelatorioSchema>;

/** `GET /api/<modulo>/relatorios/:id`: o contrato paginado `{ data, meta }`. */
export const paginaRelatorioSchema = z.object({
  data: z.array(linhaRelatorioSchema),
  meta: paginationMetaSchema,
});

export type PaginaRelatorio = z.infer<typeof paginaRelatorioSchema>;

/** O que a query de um relatório aceita, a partir da definição dele na API. */
export interface OpcoesConsultaRelatorio {
  /** Ids das colunas (para o `columns=` da exportação). */
  colunas: readonly [string, ...string[]];
  /** Ids das colunas ordenáveis (whitelist do `sort`). */
  ordenaveis: readonly string[];
  /** Ex.: `nome:asc`. Obrigatório quando há colunas ordenáveis. */
  ordenacaoPadrao?: `${string}:${SortDirection}`;
  filtros: readonly FiltroRelatorio[];
}

function filtrosShape(filtros: readonly FiltroRelatorio[]) {
  return Object.fromEntries(
    filtros.map((filtro) => {
      const valores = filtro.opcoes.map((opcao) => opcao.valor);
      const schema = z
        .string()
        .refine((valor) => valores.includes(valor), { error: `${filtro.rotulo} inválido` })
        .optional();
      return [filtro.parametro, schema];
    }),
  );
}

function sortShape({ ordenaveis, ordenacaoPadrao }: OpcoesConsultaRelatorio) {
  const [primeiro, ...demais] = ordenaveis;
  if (primeiro === undefined || ordenacaoPadrao === undefined) return {};
  return { sort: sortSchema([primeiro, ...demais], ordenacaoPadrao) };
}

/** `GET /api/<modulo>/relatorios/:id?de=&ate=&page=&pageSize=&sort=&<filtros>`. */
export function consultaRelatorioSchema(opcoes: OpcoesConsultaRelatorio) {
  return comPeriodoValido(
    paginationQuerySchema.extend({
      ...periodoShape,
      ...sortShape(opcoes),
      ...filtrosShape(opcoes.filtros),
    }),
  );
}

/** `GET /api/<modulo>/relatorios/:id/export`: a mesma query, sem paginação, com `format` e `columns`. */
export function exportRelatorioSchema(opcoes: OpcoesConsultaRelatorio) {
  return comPeriodoValido(
    z.object({
      ...periodoShape,
      ...sortShape(opcoes),
      ...filtrosShape(opcoes.filtros),
      format: exportFormatSchema,
      columns: exportColumnsSchema(opcoes.colunas),
    }),
  );
}
