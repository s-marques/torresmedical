import { z } from 'zod';
import { normalizarTelefoneWhatsapp } from '../comercial-atendimento/conversa-whatsapp';
import { ativoStatusSchema, listQuerySchema } from '../common/list-query';
import { mensagemObrigatoria } from '../common/obrigatorio';
import { paginatedResponseSchema } from '../common/pagination';

export const BYPASS_AGENTE_NOME_MAX = 100;
export const BYPASS_AGENTE_CARGO_MAX = 100;
export const BYPASS_AGENTE_TELEFONE_MIN = 10;
export const BYPASS_AGENTE_TELEFONE_MAX = 15;

export const BYPASS_AGENTE_TELEFONE_INVALIDO =
  'Informe um telefone válido, com DDD. Ex.: (65) 99999-9999';
export const BYPASS_AGENTE_TELEFONE_DUPLICADO = 'Este telefone já está na lista de bypass';

const telefone = z
  .string({ error: mensagemObrigatoria('Telefone') })
  .trim()
  .min(1, { error: mensagemObrigatoria('Telefone') })
  .transform(normalizarTelefoneWhatsapp)
  .refine(
    (digitos) =>
      digitos.length >= BYPASS_AGENTE_TELEFONE_MIN && digitos.length <= BYPASS_AGENTE_TELEFONE_MAX,
    { error: BYPASS_AGENTE_TELEFONE_INVALIDO },
  );

/** Texto opcional: vazio vira `null`. */
const textoOpcional = (rotulo: string, max: number) =>
  z
    .string({ error: `${rotulo} inválido` })
    .trim()
    .max(max, { error: `${rotulo} deve ter no máximo ${max} caracteres` })
    .nullish()
    .transform((valor) => valor || null);

/**
 * Corpo de `POST` e `PATCH /api/configuracoes-gestao/bypass-agente` (modal "Adicionar Telefone ao
 * Bypass"): só o Telefone é obrigatório (asterisco no inventário). O `PATCH` substitui os campos.
 */
export const bypassAgenteInputSchema = z.strictObject({
  telefone,
  nome: textoOpcional('Nome', BYPASS_AGENTE_NOME_MAX),
  cargo: textoOpcional('Cargo', BYPASS_AGENTE_CARGO_MAX),
});

export type BypassAgenteFormulario = z.input<typeof bypassAgenteInputSchema>;
export type CreateBypassAgenteInput = z.output<typeof bypassAgenteInputSchema>;
export type UpdateBypassAgenteInput = CreateBypassAgenteInput;
export const createBypassAgenteSchema = bypassAgenteInputSchema;
export const updateBypassAgenteSchema = bypassAgenteInputSchema;

/** `PATCH /:id/status`: o switch da coluna Status. */
export const alterarStatusBypassAgenteSchema = z.strictObject({
  ativo: z.boolean({ error: 'Status inválido' }),
});
export type AlterarStatusBypassAgenteInput = z.output<typeof alterarStatusBypassAgenteSchema>;

export const BYPASS_AGENTE_SORT_FIELDS = ['telefone', 'nome', 'cargo', 'createdAt'] as const;

/** `GET /api/configuracoes-gestao/bypass-agente`. Busca em nome, telefone e cargo. */
export const listBypassAgenteQuerySchema = listQuerySchema({
  sortFields: BYPASS_AGENTE_SORT_FIELDS,
  defaultSort: 'nome:asc',
  filters: { status: ativoStatusSchema.optional() },
});
export type ListBypassAgenteQuery = z.infer<typeof listBypassAgenteQuerySchema>;

export const bypassAgenteSchema = z.object({
  id: z.uuid(),
  telefone: z.string(),
  nome: z.string().nullable(),
  cargo: z.string().nullable(),
  ativo: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type BypassAgente = z.infer<typeof bypassAgenteSchema>;

export const bypassAgentePageSchema = paginatedResponseSchema(bypassAgenteSchema);
export type BypassAgentePage = z.infer<typeof bypassAgentePageSchema>;
