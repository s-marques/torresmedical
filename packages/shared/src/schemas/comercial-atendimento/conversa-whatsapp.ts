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

/** Quem escreveu a mensagem (cor e legenda do balão no painel da conversa). */
export const MENSAGEM_WHATSAPP_AUTOR = [
  'CLIENTE',
  'ATENDENTE',
  'ASSISTENTE_VIRTUAL',
  'CELULAR',
  'CAMPANHA',
] as const;
export type MensagemWhatsappAutor = (typeof MENSAGEM_WHATSAPP_AUTOR)[number];

/** Legenda do balão enviado. Atendente mostra o nome do usuário; cliente não tem legenda. */
export const MENSAGEM_WHATSAPP_ROTULO_AUTOR: Readonly<
  Record<Exclude<MensagemWhatsappAutor, 'CLIENTE' | 'ATENDENTE'>, string>
> = {
  ASSISTENTE_VIRTUAL: 'Assistente Virtual',
  CELULAR: 'Enviado pelo celular',
  CAMPANHA: 'Campanha',
};

/** Pendente (na fila), enviada (✓), entregue (✓✓), lida (✓✓ azul) ou "Não enviada". */
export const MENSAGEM_WHATSAPP_STATUS = [
  'PENDENTE',
  'ENVIADA',
  'ENTREGUE',
  'LIDA',
  'FALHA',
] as const;
export type MensagemWhatsappStatus = (typeof MENSAGEM_WHATSAPP_STATUS)[number];

export const MENSAGEM_WHATSAPP_TIPO = ['TEXTO', 'AUDIO', 'IMAGEM', 'DOCUMENTO', 'VIDEO'] as const;
export type MensagemWhatsappTipo = (typeof MENSAGEM_WHATSAPP_TIPO)[number];

export const MENSAGEM_WHATSAPP_ROTULO_TIPO: Readonly<Record<MensagemWhatsappTipo, string>> = {
  TEXTO: 'Texto',
  AUDIO: 'Áudio',
  IMAGEM: 'Imagem',
  DOCUMENTO: 'Documento',
  VIDEO: 'Vídeo',
};

export const MENSAGEM_WHATSAPP_MAX = 4096;

/** `POST /api/comercial-atendimento/conversas-whatsapp/:id/mensagens`: texto digitado no painel. */
export const enviarMensagemWhatsappSchema = z.strictObject({
  conteudo: z
    .string({ error: mensagemObrigatoria('Mensagem', 'f') })
    .trim()
    .min(1, { error: mensagemObrigatoria('Mensagem', 'f') })
    .max(MENSAGEM_WHATSAPP_MAX, {
      error: `A mensagem deve ter no máximo ${MENSAGEM_WHATSAPP_MAX} caracteres`,
    }),
});

export type EnviarMensagemWhatsappInput = z.infer<typeof enviarMensagemWhatsappSchema>;

/** `POST /api/comercial-atendimento/conversas-whatsapp/:id/transferir`. */
export const transferirConversaWhatsappSchema = z.strictObject({
  usuarioId: z.uuid({ error: mensagemObrigatoria('Usuário') }),
});

export type TransferirConversaWhatsappInput = z.infer<typeof transferirConversaWhatsappSchema>;

export const MENSAGENS_WHATSAPP_SORT_FIELDS = ['enviadaEm'] as const;

/** `GET /api/comercial-atendimento/conversas-whatsapp/:id/mensagens`: as mais recentes primeiro. */
export const listMensagensWhatsappQuerySchema = listQuerySchema({
  sortFields: MENSAGENS_WHATSAPP_SORT_FIELDS,
  defaultSort: 'enviadaEm:desc',
  filters: {},
});

export type ListMensagensWhatsappQuery = z.infer<typeof listMensagensWhatsappQuerySchema>;

export const mensagemWhatsappSchema = z.object({
  id: z.uuid(),
  autor: z.enum(MENSAGEM_WHATSAPP_AUTOR),
  /** Nome do atendente (autor ATENDENTE). */
  autorNome: z.string().nullable(),
  status: z.enum(MENSAGEM_WHATSAPP_STATUS),
  tipo: z.enum(MENSAGEM_WHATSAPP_TIPO),
  conteudo: z.string(),
  duracaoSegundos: z.number().int().nullable(),
  enviadaEm: z.iso.datetime(),
  /** Mensagem respondida (balão com "Cliente: …"). */
  citacao: z
    .object({
      autor: z.enum(MENSAGEM_WHATSAPP_AUTOR),
      autorNome: z.string().nullable(),
      conteudo: z.string(),
    })
    .nullable(),
});

export type MensagemWhatsapp = z.infer<typeof mensagemWhatsappSchema>;

export const mensagemWhatsappPageSchema = paginatedResponseSchema(mensagemWhatsappSchema);

export type MensagemWhatsappPage = z.infer<typeof mensagemWhatsappPageSchema>;

/** Tag aplicada à conversa (chip do painel direito). */
export const tagDaConversaSchema = z.object({ id: z.uuid(), nome: z.string(), cor: z.string() });

export type TagDaConversa = z.infer<typeof tagDaConversaSchema>;

/** `GET /api/comercial-atendimento/conversas-whatsapp/:id`: cabeçalho e painel direito. */
export const conversaWhatsappDetalheSchema = z.object({
  id: z.uuid(),
  status: z.enum(CONVERSA_WHATSAPP_STATUS),
  naoLidas: z.number().int(),
  ultimaMensagemEm: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  contato: z.object({
    id: z.uuid(),
    nome: z.string().nullable(),
    telefone: z.string(),
    /** E-mail e observações vêm do cadastro do paciente, quando o contato está vinculado. */
    email: z.string().nullable(),
    observacoes: z.string().nullable(),
    pacienteId: z.uuid().nullable(),
  }),
  canal: z.object({ id: z.uuid(), nome: z.string() }),
  atendente: z.object({ id: z.uuid(), nome: z.string() }).nullable(),
  /** "Veio de anúncio · Facebook": preenchido pela integração com o provedor. */
  anuncio: z
    .object({ origem: z.string(), titulo: z.string().nullable(), url: z.string().nullable() })
    .nullable(),
  tags: z.array(tagDaConversaSchema),
});

export type ConversaWhatsappDetalhe = z.infer<typeof conversaWhatsappDetalheSchema>;

/**
 * Telefone do WhatsApp para exibição: `5565999979796` → `(65) 99997-9796`. Só os números
 * brasileiros (DDI 55, que `normalizarTelefoneWhatsapp` sempre acrescenta) recebem a máscara;
 * os demais ficam como vieram.
 */
export function formatarTelefoneWhatsapp(telefone: string): string {
  const partes = /^55(\d{2})(\d{4,5})(\d{4})$/.exec(telefone.replaceAll(/\D/g, ''));
  return partes ? `(${partes[1]}) ${partes[2]}-${partes[3]}` : telefone;
}
