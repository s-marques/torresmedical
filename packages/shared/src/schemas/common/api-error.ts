import { z } from 'zod';

/**
 * Erro de um campo. Mensagens de validação por chave (issue #205) trazem também `code` (a chave,
 * ex.: `validacao.obrigatorio`) e `params`, para o front mostrar no idioma do usuário;
 * `message` continua em português.
 */
export const errorDetailSchema = z.object({
  field: z.string(),
  message: z.string(),
  code: z.string().optional(),
  params: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
});

export type ErrorDetail = z.infer<typeof errorDetailSchema>;

/** Corpo de toda resposta de erro da API (CLAUDE.md, seção 3, "Tratamento de erros"). */
export const apiErrorSchema = z.object({
  statusCode: z.number().int(),
  code: z.string(),
  message: z.string(),
  details: z.array(errorDetailSchema).optional(),
  requestId: z.string().optional(),
});

export type ApiError = z.infer<typeof apiErrorSchema>;
