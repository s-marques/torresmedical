import { z } from 'zod';
import { listQuerySchema } from '../common/list-query';
import { paginatedResponseSchema } from '../common/pagination';

export const GRUPO_WHATSAPP_SORT_FIELDS = ['nome', 'participantes'] as const;

/** `GET /api/comercial-atendimento/grupos-whatsapp`: grupos do canal escolhido na tela. */
export const listGruposWhatsappQuerySchema = listQuerySchema({
  sortFields: GRUPO_WHATSAPP_SORT_FIELDS,
  defaultSort: 'nome:asc',
  filters: {
    canalId: z.uuid({ error: 'Canal inválido' }),
  },
});

export type ListGruposWhatsappQuery = z.infer<typeof listGruposWhatsappQuerySchema>;

/** Grupo de WhatsApp de que o número do canal participa (vem do provedor, não é gravado). */
export const grupoWhatsappSchema = z.object({
  /** Identificador do grupo no WhatsApp (ex.: `1203630...@g.us`). */
  id: z.string(),
  nome: z.string(),
  participantes: z.number().int().min(0),
});

export type GrupoWhatsapp = z.infer<typeof grupoWhatsappSchema>;

export const grupoWhatsappPageSchema = paginatedResponseSchema(grupoWhatsappSchema);
