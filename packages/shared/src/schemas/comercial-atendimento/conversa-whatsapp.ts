import { z } from 'zod';
import { listQuerySchema, searchSchema } from '../common/list-query';
import { mensagemObrigatoria } from '../common/obrigatorio';
import { paginatedResponseSchema } from '../common/pagination';

/** Situação da conversa (chips e badge da lista da tela WhatsApp, `/atendimento`). */
export const CONVERSA_WHATSAPP_STATUS = [
  'BOT',
  'AGUARDANDO',
  'EM_ATENDIMENTO',
  'FINALIZADA',
] as const;
export type ConversaWhatsappStatus = (typeof CONVERSA_WHATSAPP_STATUS)[number];

export const CONVERSA_WHATSAPP_ROTULO_STATUS: Readonly<Record<ConversaWhatsappStatus, string>> = {
  BOT: 'Bot',
  AGUARDANDO: 'Aguardando',
  EM_ATENDIMENTO: 'Em Atendimento',
  FINALIZADA: 'Finalizada',
};

/** Valores do filtro `status` na query string. */
export const CONVERSA_WHATSAPP_STATUS_FILTRO = [
  'bot',
  'aguardando',
  'em-atendimento',
  'finalizada',
] as const;
export type ConversaWhatsappStatusFiltro = (typeof CONVERSA_WHATSAPP_STATUS_FILTRO)[number];

export const CONVERSA_WHATSAPP_STATUS_DO_FILTRO: Readonly<
  Record<ConversaWhatsappStatusFiltro, ConversaWhatsappStatus>
> = {
  bot: 'BOT',
  aguardando: 'AGUARDANDO',
  'em-atendimento': 'EM_ATENDIMENTO',
  finalizada: 'FINALIZADA',
};

/** Modal "Buscar Conversas": a busca só começa a partir deste tamanho. */
export const BUSCA_CONVERSAS_MIN = 2;
export const BUSCA_CONVERSAS_MENSAGEM = `Digite pelo menos ${BUSCA_CONVERSAS_MIN} caracteres`;

const canalId = z.uuid({ error: 'Canal inválido' });

export const CONVERSA_WHATSAPP_SORT_FIELDS = ['ultimaMensagemEm'] as const;

/**
 * `GET /api/comercial-atendimento/conversas-whatsapp`: lista lateral (chips de canal e de
 * status) e modal "Buscar Conversas" (`search` por nome, telefone, tag ou palavra nas mensagens).
 */
export const listConversasWhatsappQuerySchema = listQuerySchema({
  sortFields: CONVERSA_WHATSAPP_SORT_FIELDS,
  defaultSort: 'ultimaMensagemEm:desc',
  filters: {
    search: searchSchema.refine(
      (valor) => valor === undefined || valor.length >= BUSCA_CONVERSAS_MIN,
      { error: BUSCA_CONVERSAS_MENSAGEM },
    ),
    status: z
      .enum(CONVERSA_WHATSAPP_STATUS_FILTRO, {
        error: 'Status deve ser bot, aguardando, em-atendimento ou finalizada',
      })
      .optional(),
    canalId: canalId.optional(),
  },
});

export type ListConversasWhatsappQuery = z.infer<typeof listConversasWhatsappQuerySchema>;

/** `GET /api/comercial-atendimento/conversas-whatsapp/contadores`: números dos chips de status. */
export const contadoresConversasWhatsappQuerySchema = z.object({ canalId: canalId.optional() });

export type ContadoresConversasWhatsappQuery = z.infer<
  typeof contadoresConversasWhatsappQuerySchema
>;

export const contadoresConversasWhatsappSchema = z.object({
  BOT: z.number().int(),
  AGUARDANDO: z.number().int(),
  EM_ATENDIMENTO: z.number().int(),
  FINALIZADA: z.number().int(),
});

export type ContadoresConversasWhatsapp = z.infer<typeof contadoresConversasWhatsappSchema>;

/** `POST /api/comercial-atendimento/conversas-whatsapp`: formulário "Nova conversa". */
export const novaConversaWhatsappSchema = z.strictObject({
  pacienteId: z.uuid({ error: mensagemObrigatoria('Paciente') }),
  canalId: z.uuid({ error: mensagemObrigatoria('Canal') }),
});

export type NovaConversaWhatsappInput = z.infer<typeof novaConversaWhatsappSchema>;

/** Prévia da última mensagem na lista: o resto aparece ao abrir a conversa. */
export const CONVERSA_WHATSAPP_PREVIA_MAX = 120;

/** Item da lista lateral. */
export const conversaWhatsappSchema = z.object({
  id: z.uuid(),
  status: z.enum(CONVERSA_WHATSAPP_STATUS),
  naoLidas: z.number().int(),
  ultimaMensagem: z.string().nullable(),
  ultimaMensagemEm: z.iso.datetime().nullable(),
  contato: z.object({ id: z.uuid(), nome: z.string().nullable(), telefone: z.string() }),
  canal: z.object({ id: z.uuid(), nome: z.string() }),
  createdAt: z.iso.datetime(),
});

export type ConversaWhatsapp = z.infer<typeof conversaWhatsappSchema>;

export const conversaWhatsappPageSchema = paginatedResponseSchema(conversaWhatsappSchema);

export type ConversaWhatsappPage = z.infer<typeof conversaWhatsappPageSchema>;

/**
 * Telefone do contato no padrão do WhatsApp: só dígitos, com o DDI 55 quando o número
 * brasileiro vem só com DDD (10 ou 11 dígitos). `(65) 99999-0000` → `5565999990000`.
 */
export function normalizarTelefoneWhatsapp(telefone: string): string {
  const digitos = telefone.replaceAll(/\D/g, '');
  return digitos.length === 10 || digitos.length === 11 ? `55${digitos}` : digitos;
}
