import { z } from 'zod';
import { paginatedResponseSchema } from '../common/pagination';

export const UNIDADE_MEDIDA_NOME_MAX = 60;
export const UNIDADE_MEDIDA_SIGLA_MAX = 10;

const nome = z
  .string({ error: 'O nome é obrigatório.' })
  .trim()
  .min(1, { error: 'O nome é obrigatório.' })
  .max(UNIDADE_MEDIDA_NOME_MAX, {
    error: `O nome deve ter no máximo ${UNIDADE_MEDIDA_NOME_MAX} caracteres`,
  });

/** A sigla é guardada em maiúsculas (ex.: `ML`). */
const sigla = z
  .string({ error: 'A sigla é obrigatória.' })
  .trim()
  .min(1, { error: 'A sigla é obrigatória.' })
  .max(UNIDADE_MEDIDA_SIGLA_MAX, {
    error: `A sigla deve ter no máximo ${UNIDADE_MEDIDA_SIGLA_MAX} caracteres`,
  })
  .transform((valor) => valor.toUpperCase());

/** `POST /api/compras-estoque/unidades-medida`: botão "Incluir" do modal "Unidades de Medida". */
export const createUnidadeMedidaSchema = z.strictObject({ nome, sigla });

export type CreateUnidadeMedidaInput = z.infer<typeof createUnidadeMedidaSchema>;
export type UnidadeMedidaFormInput = z.input<typeof createUnidadeMedidaSchema>;

export const unidadeMedidaSchema = z.object({
  id: z.uuid(),
  nome: z.string(),
  sigla: z.string(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type UnidadeMedida = z.infer<typeof unidadeMedidaSchema>;

export const unidadeMedidaPageSchema = paginatedResponseSchema(unidadeMedidaSchema);
