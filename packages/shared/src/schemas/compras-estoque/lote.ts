import { z } from 'zod';
import { exportQuerySchema, listQuerySchema } from '../common/list-query';
import { erroObrigatorio, textoObrigatorio } from '../common/obrigatorio';
import { paginatedResponseSchema } from '../common/pagination';

/**
 * Tela Lotes / Validade (`/lotes`, issue #22). O lote registra a validade e a quantidade de um
 * produto para rastreio; não movimenta o saldo do produto, que continua com a tela Estoque (#20).
 * Decisão do dev na issue #22.
 *
 * Não importa `./estoque`: é o `estoque.ts` que usa o `loteSchema` (aba Alertas).
 */

/** Mesmo limite do campo Lote da Entrada Manual. */
export const LOTE_NUMERO_MAX = 50;
/** Cabe em DECIMAL(12,3). */
export const LOTE_QUANTIDADE_MAX = 999_999_999;

/** Janela do card "Vencendo em 60 dias" e do status "Vencendo" (relatório EST-01 usa a mesma). */
export const LOTE_DIAS_VENCENDO = 60;

// --- Status ---

/** Status do lote, calculado pela data de vencimento (regra confirmada pelo dev na issue #22). */
export const LOTE_STATUS = ['VENCIDO', 'VENCENDO', 'VALIDO'] as const;
export type LoteStatus = (typeof LOTE_STATUS)[number];

export const ROTULO_LOTE_STATUS: Readonly<Record<LoteStatus, string>> = {
  VENCIDO: 'Vencido',
  VENCENDO: 'Vencendo',
  VALIDO: 'Válido',
};

/** Soma dias a uma data `AAAA-MM-DD`, sem fuso. */
export function somarDias(data: string, dias: number): string {
  const [ano = 0, mes = 1, dia = 1] = data.split('-').map(Number);
  return new Date(Date.UTC(ano, mes - 1, dia + dias)).toISOString().slice(0, 10);
}

/**
 * Vencido: vencimento antes de hoje. Vencendo: de hoje até `LOTE_DIAS_VENCENDO` dias. Válido: o
 * resto. As datas são `AAAA-MM-DD` (hoje no fuso da clínica).
 */
export function statusLote(dataVencimento: string, hoje: string): LoteStatus {
  if (dataVencimento < hoje) return 'VENCIDO';
  if (dataVencimento <= somarDias(hoje, LOTE_DIAS_VENCENDO)) return 'VENCENDO';
  return 'VALIDO';
}

// --- Entrada (modal "Novo Lote") ---

/** `POST /api/compras-estoque/lotes`. Campos e obrigatoriedade do print do modal "Novo Lote". */
export const loteInputSchema = z.strictObject({
  produtoId: z
    .string({ error: erroObrigatorio('Produto') })
    .min(1, { error: erroObrigatorio('Produto') })
    .pipe(z.uuid({ error: 'Produto inválido' })),
  numero: textoObrigatorio('Número do Lote', { max: LOTE_NUMERO_MAX }),
  dataVencimento: z
    .string({ error: erroObrigatorio('Data de Vencimento', 'f') })
    .min(1, { error: erroObrigatorio('Data de Vencimento', 'f') })
    .pipe(z.iso.date({ error: 'Data de Vencimento inválida' })),
  quantidade: z
    .number({ error: erroObrigatorio('Quantidade', 'f') })
    .positive({ error: 'A quantidade deve ser maior que zero' })
    .max(LOTE_QUANTIDADE_MAX, { error: 'Quantidade inválida' }),
});
export type LoteFormulario = z.input<typeof loteInputSchema>;
export type LoteInput = z.output<typeof loteInputSchema>;

// --- Consultas ---

export const LOTE_SORT_FIELDS = ['produto', 'lote', 'quantidade', 'vencimento', 'status'] as const;

/** `GET /api/compras-estoque/lotes`: "Todos os produtos", "Apenas com saldo" e "Buscar lotes...". */
export const listLotesQuerySchema = listQuerySchema({
  sortFields: LOTE_SORT_FIELDS,
  defaultSort: 'vencimento:asc',
  filters: {
    produtoId: z.uuid({ error: 'Produto inválido' }).optional(),
    /** Checkbox "Apenas com saldo": `true` mostra só lotes com quantidade maior que zero. */
    comSaldo: z
      .enum(['true', 'false'], { error: 'Apenas com saldo deve ser true ou false' })
      .optional()
      .transform((valor) => valor === 'true'),
  },
});
export type ListLotesQuery = z.infer<typeof listLotesQuerySchema>;

export const LOTE_EXPORT_COLUMNS = [
  'produto',
  'lote',
  'quantidade',
  'vencimento',
  'status',
] as const;
export type LoteExportColumn = (typeof LOTE_EXPORT_COLUMNS)[number];

/** `GET /api/compras-estoque/lotes/export` ("Exportar" Excel/PDF). */
export const exportLotesQuerySchema = exportQuerySchema(listLotesQuerySchema, LOTE_EXPORT_COLUMNS);
export type ExportLotesQuery = z.infer<typeof exportLotesQuerySchema>;

// --- Respostas ---

export const loteSchema = z.object({
  id: z.uuid(),
  produtoId: z.uuid(),
  produtoNome: z.string(),
  produtoSku: z.string().nullable(),
  numero: z.string(),
  dataVencimento: z.iso.date(),
  /** Texto decimal (ex.: `"12.5"`), exato como no banco. */
  quantidade: z.string(),
  status: z.enum(LOTE_STATUS),
  createdAt: z.iso.datetime(),
});
export type Lote = z.infer<typeof loteSchema>;

export const lotePageSchema = paginatedResponseSchema(loteSchema);

/** Cards do topo da tela. */
export const resumoLotesSchema = z.object({
  vencidos: z.number().int(),
  vencendo: z.number().int(),
  abaixoMinimo: z.number().int(),
});
export type ResumoLotes = z.infer<typeof resumoLotesSchema>;
