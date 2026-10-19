import { z } from 'zod';
import { ativoStatusSchema, exportQuerySchema, listQuerySchema } from '../common/list-query';
import { paginatedResponseSchema } from '../common/pagination';

export const ORIGEM_CLIENTE_NOME_MAX = 120;

const nome = z
  .string({ error: 'Nome é obrigatório.' })
  .trim()
  .min(1, { error: 'Nome é obrigatório.' })
  .max(ORIGEM_CLIENTE_NOME_MAX, {
    error: `O nome deve ter no máximo ${ORIGEM_CLIENTE_NOME_MAX} caracteres`,
  });

/** `POST /api/comercial-atendimento/origens-cliente`. O código é gerado a partir do nome. */
export const createOrigemClienteSchema = z.strictObject({ nome });

export type CreateOrigemClienteInput = z.infer<typeof createOrigemClienteSchema>;

/** `PATCH /api/comercial-atendimento/origens-cliente/:id`: renomear (o código gerado na criação não muda). */
export const updateOrigemClienteSchema = z.strictObject({ nome });

export type UpdateOrigemClienteInput = z.infer<typeof updateOrigemClienteSchema>;

/** `PATCH /api/comercial-atendimento/origens-cliente/:id/ativa`: interruptor Ativa. */
export const alterarAtivaOrigemClienteSchema = z.strictObject({
  ativa: z.boolean({ error: 'Informe se a origem está ativa' }),
});

export type AlterarAtivaOrigemClienteInput = z.infer<typeof alterarAtivaOrigemClienteSchema>;

export const ORIGEM_CLIENTE_DIRECOES = ['cima', 'baixo'] as const;

/** `PATCH /api/comercial-atendimento/origens-cliente/:id/mover`: setas Mover para cima/baixo. */
export const moverOrigemClienteSchema = z.strictObject({
  direcao: z.enum(ORIGEM_CLIENTE_DIRECOES, { error: 'Direção inválida. Use cima ou baixo' }),
});

export type MoverOrigemClienteInput = z.infer<typeof moverOrigemClienteSchema>;

export const ORIGEM_CLIENTE_SORT_FIELDS = ['ordem', 'nome', 'codigo', 'ativa'] as const;

/** `GET /api/comercial-atendimento/origens-cliente`. */
export const listOrigensClienteQuerySchema = listQuerySchema({
  sortFields: ORIGEM_CLIENTE_SORT_FIELDS,
  defaultSort: 'ordem:asc',
  filters: { status: ativoStatusSchema.optional() },
});

export type ListOrigensClienteQuery = z.infer<typeof listOrigensClienteQuerySchema>;

export const ORIGEM_CLIENTE_EXPORT_COLUMNS = ['ordem', 'nome', 'codigo', 'ativa'] as const;
export type OrigemClienteExportColumn = (typeof ORIGEM_CLIENTE_EXPORT_COLUMNS)[number];

/** `GET /api/comercial-atendimento/origens-cliente/export`. */
export const exportOrigensClienteQuerySchema = exportQuerySchema(
  listOrigensClienteQuerySchema,
  ORIGEM_CLIENTE_EXPORT_COLUMNS,
);

export type ExportOrigensClienteQuery = z.infer<typeof exportOrigensClienteQuerySchema>;

export const origemClienteSchema = z.object({
  id: z.uuid(),
  nome: z.string(),
  codigo: z.string(),
  ordem: z.number().int(),
  ativa: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type OrigemCliente = z.infer<typeof origemClienteSchema>;

export const origemClientePageSchema = paginatedResponseSchema(origemClienteSchema);

export type OrigemClientePage = z.infer<typeof origemClientePageSchema>;

/**
 * Código da origem: o nome em minúsculas, sem acento, com `_` entre as palavras
 * (`Evento Wellness 26/09/2026` → `evento_wellness_26_09_2026`).
 */
export function gerarCodigoOrigemCliente(nome: string): string {
  return nome
    .normalize('NFD')
    .replaceAll(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '_')
    .replaceAll(/^_+|_+$/g, '');
}
