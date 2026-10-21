import { z } from 'zod';
import { listQuerySchema } from '../common/list-query';
import { paginatedResponseSchema } from '../common/pagination';

export const BANDEIRA_NOME_MAX = 60;
export const BANDEIRA_ICONE_MAX = 60;
export const BANDEIRA_ICONE_PADRAO = 'fa-credit-card';

const nome = z
  .string({ error: 'Nome é obrigatório.' })
  .trim()
  .min(1, { error: 'Nome é obrigatório.' })
  .max(BANDEIRA_NOME_MAX, { error: `O nome deve ter no máximo ${BANDEIRA_NOME_MAX} caracteres` });

/** Classe do ícone FontAwesome, ex.: `fa-cc-visa`. Vazio volta ao ícone padrão. */
const icone = z
  .string({ error: 'Ícone inválido' })
  .trim()
  .max(BANDEIRA_ICONE_MAX, {
    error: `O ícone deve ter no máximo ${BANDEIRA_ICONE_MAX} caracteres`,
  })
  .regex(/^[a-z0-9-]*$/, { error: 'Use o formato fa-credit-card' })
  .transform((valor) => valor || BANDEIRA_ICONE_PADRAO);

/** `POST /api/financeiro/bandeiras`: modal "Nova Bandeira". */
export const createBandeiraSchema = z.strictObject({
  nome,
  icone: icone.default(BANDEIRA_ICONE_PADRAO),
});

export type CreateBandeiraInput = z.infer<typeof createBandeiraSchema>;
export type BandeiraFormulario = z.input<typeof createBandeiraSchema>;

export const BANDEIRA_SORT_FIELDS = ['nome', 'createdAt'] as const;

/** `GET /api/financeiro/bandeiras`. */
export const listBandeirasQuerySchema = listQuerySchema({
  sortFields: BANDEIRA_SORT_FIELDS,
  defaultSort: 'nome:asc',
  filters: {},
});

export type ListBandeirasQuery = z.infer<typeof listBandeirasQuerySchema>;

export const bandeiraSchema = z.object({
  id: z.uuid(),
  nome: z.string(),
  icone: z.string(),
  ativo: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type Bandeira = z.infer<typeof bandeiraSchema>;

export const bandeiraPageSchema = paginatedResponseSchema(bandeiraSchema);

export type BandeiraPage = z.infer<typeof bandeiraPageSchema>;
