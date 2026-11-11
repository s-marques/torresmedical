import { z } from 'zod';
import { listQuerySchema } from '../common/list-query';
import { textoObrigatorio } from '../common/obrigatorio';
import { paginatedResponseSchema } from '../common/pagination';

export const TAG_ATENDIMENTO_NOME_MAX = 50;
/** Cor inicial do seletor no modal "Gerenciar Tags" (cinza do print). */
export const TAG_ATENDIMENTO_COR_PADRAO = '#6b7280';

/** `POST /api/comercial-atendimento/tags-atendimento`: modal "Gerenciar Tags" (nome + cor + "+"). */
export const createTagAtendimentoSchema = z.strictObject({
  nome: textoObrigatorio('Nome da tag', { max: TAG_ATENDIMENTO_NOME_MAX }),
  cor: z
    .string({ error: 'Cor inválida' })
    .regex(/^#[0-9a-fA-F]{6}$/, { error: 'Cor inválida. Use o formato #RRGGBB' })
    .default(TAG_ATENDIMENTO_COR_PADRAO),
});

export type CreateTagAtendimentoInput = z.infer<typeof createTagAtendimentoSchema>;
export type TagAtendimentoFormulario = z.input<typeof createTagAtendimentoSchema>;

export const TAG_ATENDIMENTO_SORT_FIELDS = ['nome'] as const;

/** `GET /api/comercial-atendimento/tags-atendimento`. */
export const listTagsAtendimentoQuerySchema = listQuerySchema({
  sortFields: TAG_ATENDIMENTO_SORT_FIELDS,
  defaultSort: 'nome:asc',
  filters: {},
});

export type ListTagsAtendimentoQuery = z.infer<typeof listTagsAtendimentoQuerySchema>;

export const tagAtendimentoSchema = z.object({
  id: z.uuid(),
  nome: z.string(),
  cor: z.string(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type TagAtendimento = z.infer<typeof tagAtendimentoSchema>;

export const tagAtendimentoPageSchema = paginatedResponseSchema(tagAtendimentoSchema);

export type TagAtendimentoPage = z.infer<typeof tagAtendimentoPageSchema>;
