import { z } from 'zod';
import { exportQuerySchema, listQuerySchema } from '../common/list-query';
import { paginatedResponseSchema } from '../common/pagination';

export const CAIXA_NOME_MAX = 120;
/** Cabe em DECIMAL(12,2). */
export const CAIXA_VALOR_MAX = 999_999_999;

export const MSG_CAIXA_NOME_OBRIGATORIO = 'Nome é obrigatório.';
export const MSG_CAIXA_VALOR_ABERTURA_OBRIGATORIO = 'Valor de abertura é obrigatório.';

/** Chips do grid: Todos (ausente) / Aberto / Fechado. */
export const CAIXA_STATUS = ['aberto', 'fechado'] as const;
export const caixaStatusSchema = z.enum(CAIXA_STATUS, { error: 'Status inválido' });
export type CaixaStatusFiltro = z.infer<typeof caixaStatusSchema>;

const nome = z
  .string({ error: MSG_CAIXA_NOME_OBRIGATORIO })
  .trim()
  .min(1, { error: MSG_CAIXA_NOME_OBRIGATORIO })
  .max(CAIXA_NOME_MAX, { error: `O nome deve ter no máximo ${CAIXA_NOME_MAX} caracteres` });

const valorAbertura = z
  .number({ error: MSG_CAIXA_VALOR_ABERTURA_OBRIGATORIO })
  .min(0, { error: 'O valor de abertura não pode ser negativo' })
  .max(CAIXA_VALOR_MAX, { error: 'Valor muito alto' });

/** `POST /api/financeiro/caixas`: modal "Abrir Caixa". O operador é o usuário autenticado. */
export const abrirCaixaSchema = z.strictObject({ nome, valorAbertura });

export type AbrirCaixaInput = z.infer<typeof abrirCaixaSchema>;
export type AbrirCaixaFormulario = z.input<typeof abrirCaixaSchema>;

export const CAIXA_SORT_FIELDS = [
  'id',
  'nome',
  'operador',
  'dataAbertura',
  'dataFechamento',
  'valorAbertura',
  'valorFechamento',
  'quebra',
  'status',
] as const;

/** `GET /api/financeiro/caixas`. */
export const listCaixasQuerySchema = listQuerySchema({
  sortFields: CAIXA_SORT_FIELDS,
  defaultSort: 'dataAbertura:desc',
  filters: { status: caixaStatusSchema.optional() },
});

export type ListCaixasQuery = z.infer<typeof listCaixasQuerySchema>;

export const CAIXA_EXPORT_COLUMNS = [
  'id',
  'nome',
  'operador',
  'dataAbertura',
  'dataFechamento',
  'valorAbertura',
  'valorFechamento',
  'quebra',
  'status',
] as const;
export type CaixaExportColumn = (typeof CAIXA_EXPORT_COLUMNS)[number];

/** `GET /api/financeiro/caixas/export`. */
export const exportCaixasQuerySchema = exportQuerySchema(
  listCaixasQuerySchema,
  CAIXA_EXPORT_COLUMNS,
);

export type ExportCaixasQuery = z.infer<typeof exportCaixasQuerySchema>;

/** Valores monetários chegam como texto decimal (ex.: `"150.00"`), exatos como no banco. */
const decimal = z.string();

export const caixaSchema = z.object({
  id: z.uuid(),
  /** Número sequencial exibido na coluna "#". */
  numero: z.number().int(),
  nome: z.string(),
  operadorId: z.uuid(),
  operador: z.string(),
  dataAbertura: z.iso.datetime(),
  dataFechamento: z.iso.datetime().nullable(),
  valorAbertura: decimal,
  valorFechamento: decimal.nullable(),
  quebra: decimal.nullable(),
  /** Valor do banco (igual ao `audit_log`). */
  status: z.enum(['ABERTO', 'FECHADO']),
});

export type Caixa = z.infer<typeof caixaSchema>;

export const caixaPageSchema = paginatedResponseSchema(caixaSchema);

export type CaixaPage = z.infer<typeof caixaPageSchema>;

export const CAIXA_ROTULO_STATUS: Readonly<Record<Caixa['status'], string>> = {
  ABERTO: 'Aberto',
  FECHADO: 'Fechado',
};
