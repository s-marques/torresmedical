import { z } from 'zod';
import { listQuerySchema } from '../common/list-query';
import { textoObrigatorio } from '../common/obrigatorio';
import { paginatedResponseSchema } from '../common/pagination';

export const RESPOSTA_RAPIDA_TITULO_MAX = 120;
export const RESPOSTA_RAPIDA_MENSAGEM_MAX = 4000;
export const RESPOSTA_RAPIDA_CATEGORIA_MAX = 60;
export const RESPOSTA_RAPIDA_ATALHO_MAX = 50;
/** Valor inicial do campo Categoria no modal "Nova Resposta Rápida" (print do inventário). */
export const RESPOSTA_RAPIDA_CATEGORIA_PADRAO = 'Geral';

/** "/" seguida de letras, números, "-" ou "_", sem espaços. Ex.: `/boasvindas`. */
const ATALHO_REGEX = /^\/[\p{L}\p{N}_-]+$/u;

export const RESPOSTA_RAPIDA_ATALHO_INVALIDO =
  'O atalho deve começar com "/" e ter só letras, números, "-" ou "_", sem espaços';

/** Categoria livre; vazia volta para "Geral". */
const categoria = z
  .string({ error: 'Categoria inválida' })
  .trim()
  .max(RESPOSTA_RAPIDA_CATEGORIA_MAX, {
    error: `Categoria deve ter no máximo ${RESPOSTA_RAPIDA_CATEGORIA_MAX} caracteres`,
  })
  .nullish()
  .transform((valor) => valor || RESPOSTA_RAPIDA_CATEGORIA_PADRAO);

/** Atalho opcional: vazio vira `null`. Unicidade (entre as não excluídas) é regra do service. */
const atalho = z
  .string({ error: 'Atalho inválido' })
  .trim()
  .max(RESPOSTA_RAPIDA_ATALHO_MAX, {
    error: `Atalho deve ter no máximo ${RESPOSTA_RAPIDA_ATALHO_MAX} caracteres`,
  })
  .refine((valor) => valor === '' || ATALHO_REGEX.test(valor), {
    error: RESPOSTA_RAPIDA_ATALHO_INVALIDO,
  })
  .nullish()
  .transform((valor) => valor || null);

/**
 * Corpo de `POST` e `PATCH /api/configuracoes-gestao/respostas-rapidas`. O `PATCH` substitui
 * todos os campos (o modal Editar envia o formulário inteiro). Título e Mensagem são
 * obrigatórios (asterisco no modal do inventário).
 */
export const respostaRapidaInputSchema = z.strictObject({
  titulo: textoObrigatorio('Título', { max: RESPOSTA_RAPIDA_TITULO_MAX }),
  mensagem: textoObrigatorio('Mensagem', { genero: 'f', max: RESPOSTA_RAPIDA_MENSAGEM_MAX }),
  categoria,
  atalho,
});

export type RespostaRapidaFormulario = z.input<typeof respostaRapidaInputSchema>;
export type CreateRespostaRapidaInput = z.output<typeof respostaRapidaInputSchema>;
export type UpdateRespostaRapidaInput = CreateRespostaRapidaInput;
export const createRespostaRapidaSchema = respostaRapidaInputSchema;
export const updateRespostaRapidaSchema = respostaRapidaInputSchema;

export const RESPOSTA_RAPIDA_SORT_FIELDS = ['titulo', 'categoria', 'atalho', 'createdAt'] as const;

/** `GET /api/configuracoes-gestao/respostas-rapidas`. A busca cobre título, mensagem, categoria e atalho. */
export const listRespostasRapidasQuerySchema = listQuerySchema({
  sortFields: RESPOSTA_RAPIDA_SORT_FIELDS,
  defaultSort: 'titulo:asc',
  filters: {},
});

export type ListRespostasRapidasQuery = z.infer<typeof listRespostasRapidasQuerySchema>;

export const respostaRapidaSchema = z.object({
  id: z.uuid(),
  titulo: z.string(),
  mensagem: z.string(),
  categoria: z.string(),
  atalho: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type RespostaRapida = z.infer<typeof respostaRapidaSchema>;

export const respostaRapidaPageSchema = paginatedResponseSchema(respostaRapidaSchema);

export type RespostaRapidaPage = z.infer<typeof respostaRapidaPageSchema>;
