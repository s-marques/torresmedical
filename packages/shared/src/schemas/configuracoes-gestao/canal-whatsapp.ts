import { z } from 'zod';
import { normalizarTelefoneWhatsapp } from '../comercial-atendimento/conversa-whatsapp';
import { listQuerySchema } from '../common/list-query';
import { mensagemObrigatoria, textoObrigatorio } from '../common/obrigatorio';
import { paginatedResponseSchema } from '../common/pagination';

export const CANAL_WHATSAPP_NOME_MAX = 100;
export const CANAL_WHATSAPP_NUMERO_MIN = 10;
export const CANAL_WHATSAPP_NUMERO_MAX = 15;

/** `CLOUD_API` existe no banco desde a #16, mas a clínica só usa DinastiAPI: a tela não tem a aba Cloud API. */
export const CANAL_WHATSAPP_TIPOS = ['DINASTI_API', 'CLOUD_API'] as const;
export type CanalWhatsappTipo = (typeof CANAL_WHATSAPP_TIPOS)[number];

export const CANAL_WHATSAPP_STATUS = ['CONECTADO', 'DESCONECTADO', 'AGUARDANDO_QR'] as const;
export type CanalWhatsappStatus = (typeof CANAL_WHATSAPP_STATUS)[number];

export const CANAL_WHATSAPP_STATUS_ROTULO: Record<CanalWhatsappStatus, string> = {
  CONECTADO: 'Conectado',
  DESCONECTADO: 'Desconectado',
  AGUARDANDO_QR: 'Aguardando QR',
};

export const CANAL_WHATSAPP_NUMERO_INVALIDO =
  'Informe um número de WhatsApp válido, com DDD. Ex.: (65) 99999-9999';

/** Só dígitos, com DDI (`(65) 99999-0000` → `5565999990000`). */
function numeroWhatsapp(rotulo: string) {
  const obrigatorio = mensagemObrigatoria(rotulo);
  return z
    .string({ error: obrigatorio })
    .trim()
    .min(1, { error: obrigatorio })
    .transform(normalizarTelefoneWhatsapp)
    .refine(
      (digitos) =>
        digitos.length >= CANAL_WHATSAPP_NUMERO_MIN && digitos.length <= CANAL_WHATSAPP_NUMERO_MAX,
      { error: CANAL_WHATSAPP_NUMERO_INVALIDO },
    );
}

/** Vazio = linha da clínica (requisito do cliente, #26). */
const profissionalId = z
  .union([z.uuid({ error: 'Profissional inválido' }), z.literal('')])
  .nullish()
  .transform((valor) => valor || null);

const usuarioIds = z
  .array(z.uuid({ error: 'Usuário inválido' }), { error: 'Usuários inválidos' })
  .default([])
  .transform((ids) => [...new Set(ids)]);

/** `POST /api/configuracoes-gestao/canais-whatsapp` (modal "Novo Canal WhatsApp", aba DinastiAPI). */
export const createCanalWhatsappSchema = z.strictObject({
  nome: textoObrigatorio('Nome do Canal', { max: CANAL_WHATSAPP_NOME_MAX }),
  numero: numeroWhatsapp('Número WhatsApp'),
  profissionalId,
  usuarioIds,
});

/** `PATCH /:id` (modal "Editar Canal DinastiAPI": Nome do Canal e Telefone, mais o vínculo). */
export const updateCanalWhatsappSchema = z.strictObject({
  nome: textoObrigatorio('Nome do Canal', { max: CANAL_WHATSAPP_NOME_MAX }),
  numero: numeroWhatsapp('Telefone'),
  profissionalId,
});

/** `PUT /:id/usuarios`: lista vazia = todos os usuários têm acesso. */
export const definirUsuariosCanalWhatsappSchema = z.strictObject({ usuarioIds });

export type CanalWhatsappFormulario = z.input<typeof createCanalWhatsappSchema>;
export type CanalWhatsappEdicaoFormulario = z.input<typeof updateCanalWhatsappSchema>;
export type CreateCanalWhatsappInput = z.output<typeof createCanalWhatsappSchema>;
export type UpdateCanalWhatsappInput = z.output<typeof updateCanalWhatsappSchema>;
export type DefinirUsuariosCanalWhatsappInput = z.output<typeof definirUsuariosCanalWhatsappSchema>;

export const listCanaisWhatsappQuerySchema = listQuerySchema({
  sortFields: ['nome', 'createdAt'],
  defaultSort: 'nome:asc',
  filters: {},
});
export type ListCanaisWhatsappQuery = z.infer<typeof listCanaisWhatsappQuerySchema>;

export const canalWhatsappSchema = z.object({
  id: z.uuid(),
  nome: z.string(),
  numero: z.string(),
  tipo: z.enum(CANAL_WHATSAPP_TIPOS),
  status: z.enum(CANAL_WHATSAPP_STATUS),
  profissionalId: z.uuid().nullable(),
  profissionalNome: z.string().nullable(),
  usuarioIds: z.array(z.uuid()),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type CanalWhatsapp = z.infer<typeof canalWhatsappSchema>;

export const canalWhatsappPageSchema = paginatedResponseSchema(canalWhatsappSchema);

/** Usuário do modal "Usuários": nome, e-mail e perfil. */
export const usuarioCanalWhatsappSchema = z.object({
  id: z.uuid(),
  nome: z.string(),
  email: z.string(),
  perfil: z.string().nullable(),
});
export type UsuarioCanalWhatsapp = z.infer<typeof usuarioCanalWhatsappSchema>;
export const usuariosCanalWhatsappSchema = z.array(usuarioCanalWhatsappSchema);
