import { z } from 'zod';
import { exportQuerySchema, listQuerySchema } from '../common/list-query';
import { mensagemObrigatoria, textoObrigatorio } from '../common/obrigatorio';
import { paginatedResponseSchema, paginationQuerySchema } from '../common/pagination';

/**
 * Confirmações de agenda (tela Confirmações, `/confirmacoes`): acompanha as mensagens de
 * confirmação enviadas pelo WhatsApp (MSG1, MSG2, MSG3 e lembrete do dia) e a resposta do
 * paciente. Abas Pendentes, Histórico e Modelos e Config.
 */

export const CONFIRMACAO_MENSAGEM_MAX = 1000;
export const CONFIRMACAO_ANTECEDENCIAS = [1, 2] as const;

/** Etapas de envio. O lembrete sai no dia da consulta; as demais, na véspera (ou 2 dias antes). */
export const CONFIRMACAO_ETAPAS = ['MSG1', 'MSG2', 'MSG3', 'LEMBRETE'] as const;
export type ConfirmacaoEtapa = (typeof CONFIRMACAO_ETAPAS)[number];
export const CONFIRMACAO_ETAPA_ROTULO: Readonly<Record<ConfirmacaoEtapa, string>> = {
  MSG1: 'MSG1',
  MSG2: 'MSG2',
  MSG3: 'MSG3',
  LEMBRETE: 'Lembrete',
};

export const CONFIRMACAO_ENVIO_STATUS = ['ENVIADO', 'FALHA'] as const;
export type ConfirmacaoEnvioStatus = (typeof CONFIRMACAO_ENVIO_STATUS)[number];
export const CONFIRMACAO_ENVIO_STATUS_ROTULO: Readonly<Record<ConfirmacaoEnvioStatus, string>> = {
  ENVIADO: 'Enviado',
  FALHA: 'Falha',
};

/** Status exibido na coluna Status, derivado do status do agendamento. */
export const CONFIRMACAO_STATUS = ['PENDENTE', 'CONFIRMADO', 'CANCELADO'] as const;
export type ConfirmacaoStatus = (typeof CONFIRMACAO_STATUS)[number];
export const CONFIRMACAO_STATUS_ROTULO: Readonly<Record<ConfirmacaoStatus, string>> = {
  PENDENTE: 'Pendente',
  CONFIRMADO: 'Confirmado',
  CANCELADO: 'Cancelado',
};

/** Variáveis dos textos, trocadas pelos dados do agendamento no envio. */
export const CONFIRMACAO_VARIAVEIS = ['{nome}', '{data}', '{hora}', '{profissional}'] as const;

export function aplicarVariaveisConfirmacao(
  texto: string,
  dados: { nome: string; data: string; hora: string; profissional: string },
): string {
  return texto
    .replaceAll('{nome}', dados.nome)
    .replaceAll('{data}', dados.data)
    .replaceAll('{hora}', dados.hora)
    .replaceAll('{profissional}', dados.profissional);
}

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const DIA = /^\d{4}-\d{2}-\d{2}$/;

const dia = z.string().regex(DIA, { error: 'Data inválida' });

// ---------- Grid (aba Pendentes) ----------

export const confirmacaoEnvioSchema = z.object({
  etapa: z.enum(CONFIRMACAO_ETAPAS),
  status: z.enum(CONFIRMACAO_ENVIO_STATUS),
  enviadoEm: z.iso.datetime(),
});
export type ConfirmacaoEnvio = z.infer<typeof confirmacaoEnvioSchema>;

/** Linha do grid: um agendamento do dia e o que já foi enviado a respeito dele. */
export const confirmacaoSchema = z.object({
  id: z.uuid(),
  numero: z.number().int(),
  /** Primeiro envio (coluna "Enviado em"); nulo = "Não enviado". */
  enviadoEm: z.iso.datetime().nullable(),
  inicio: z.iso.datetime(),
  tipo: z.string().nullable(),
  paciente: z.string(),
  telefone: z.string().nullable(),
  profissional: z.string(),
  envios: z.array(confirmacaoEnvioSchema),
  status: z.enum(CONFIRMACAO_STATUS),
});
export type Confirmacao = z.infer<typeof confirmacaoSchema>;

export const confirmacaoPageSchema = paginatedResponseSchema(confirmacaoSchema);
export type ConfirmacaoPage = z.infer<typeof confirmacaoPageSchema>;

export const CONFIRMACAO_SORT_FIELDS = ['agendamento', 'paciente', 'profissional', 'status'] as const;

/** `GET /confirmacoes`: dia do envio (padrão: hoje) e busca por paciente. */
export const listConfirmacoesQuerySchema = listQuerySchema({
  sortFields: CONFIRMACAO_SORT_FIELDS,
  defaultSort: 'agendamento:asc',
  filters: { dataEnvio: dia.optional() },
});
export type ListConfirmacoesQuery = z.infer<typeof listConfirmacoesQuerySchema>;

export const resumoConfirmacoesQuerySchema = z.object({ dataEnvio: dia.optional() });
export type ResumoConfirmacoesQuery = z.infer<typeof resumoConfirmacoesQuerySchema>;

/** Cartões do cabeçalho: pendentes e quantas MSG1/2/3 já saíram para os agendamentos do dia. */
export const resumoConfirmacoesSchema = z.object({
  pendentes: z.number().int(),
  msg1: z.number().int(),
  msg2: z.number().int(),
  msg3: z.number().int(),
});
export type ResumoConfirmacoes = z.infer<typeof resumoConfirmacoesSchema>;

export const CONFIRMACAO_EXPORT_COLUMNS = [
  'enviadoEm',
  'agendamento',
  'paciente',
  'telefone',
  'profissional',
  'envios',
  'status',
] as const;
export type ConfirmacaoExportColumn = (typeof CONFIRMACAO_EXPORT_COLUMNS)[number];

export const exportConfirmacoesQuerySchema = exportQuerySchema(
  listConfirmacoesQuerySchema,
  CONFIRMACAO_EXPORT_COLUMNS,
);
export type ExportConfirmacoesQuery = z.infer<typeof exportConfirmacoesQuerySchema>;

// ---------- Histórico ----------

export const confirmacaoHistoricoSchema = z.object({
  id: z.uuid(),
  agendamentoNumero: z.number().int(),
  etapa: z.enum(CONFIRMACAO_ETAPAS),
  status: z.enum(CONFIRMACAO_ENVIO_STATUS),
  /** Motivo da falha (sem dados pessoais). */
  erro: z.string().nullable(),
  ocorridoEm: z.iso.datetime(),
});
export type ConfirmacaoHistorico = z.infer<typeof confirmacaoHistoricoSchema>;

export const confirmacaoHistoricoPageSchema = paginatedResponseSchema(confirmacaoHistoricoSchema);

export const listHistoricoConfirmacoesQuerySchema = paginationQuerySchema;
export type ListHistoricoConfirmacoesQuery = z.infer<typeof listHistoricoConfirmacoesQuerySchema>;

// ---------- Ações da linha ----------

/** Resposta do paciente (ou da recepção) que muda o agendamento. */
export const CONFIRMACAO_RESPOSTAS = ['CONFIRMAR', 'CANCELAR'] as const;
export type ConfirmacaoResposta = (typeof CONFIRMACAO_RESPOSTAS)[number];

// ---------- Modelos e Config ----------

const horario = (rotulo: string) =>
  z
    .string({ error: mensagemObrigatoria(rotulo) })
    .min(1, { error: mensagemObrigatoria(rotulo), abort: true })
    .regex(HORA, { error: `${rotulo} inválido (HH:MM)` });

const texto = (rotulo: string) => textoObrigatorio(rotulo, { max: CONFIRMACAO_MENSAGEM_MAX });

/** Textos padrão (legado), usados enquanto nada foi salvo. */
export const CONFIRMACAO_CONFIG_PADRAO = {
  ativo: true,
  antecedenciaDias: 1,
  horarioLembrete: '07:00',
  horarioMsg1: '08:00',
  horarioMsg2: '12:00',
  horarioMsg3: '17:00',
  horarioNaoConfirmou: '09:00',
  mensagemCriacao:
    'Olá {nome}!\n\nSeu agendamento foi realizado com sucesso!\n\n*Data:* {data}\n*Hora:* {hora}\n*Profissional:* {profissional}',
  mensagemConfirmada:
    'Obrigado por confirmar seu agendamento do dia *{data}* às *{hora}*! Aguardamos você.',
  mensagemJaConfirmado:
    'Seu agendamento do dia *{data}* às *{hora}* já está confirmado. Aguardamos você!',
} as const;

/** `PUT /confirmacoes/configuracao`: "Configuração Geral". */
export const confirmacaoConfigInputSchema = z.strictObject({
  ativo: z.boolean({ error: mensagemObrigatoria('Ativo') }),
  antecedenciaDias: z.union([z.literal(1), z.literal(2)], {
    error: 'Antecedência deve ser de 1 ou 2 dias',
  }),
  horarioLembrete: horario('Lembrete (dia)'),
  horarioMsg1: horario('MSG 1'),
  horarioMsg2: horario('MSG 2'),
  horarioMsg3: horario('MSG 3'),
  horarioNaoConfirmou: horario('Não confirmou'),
  mensagemCriacao: texto('A mensagem ao criar agendamento'),
  mensagemConfirmada: texto('A resposta a quem confirma'),
  mensagemJaConfirmado: texto('A resposta a quem clica de novo'),
});
export type ConfirmacaoConfigInput = z.output<typeof confirmacaoConfigInputSchema>;
export type ConfirmacaoConfigFormulario = z.input<typeof confirmacaoConfigInputSchema>;

export const confirmacaoConfigSchema = confirmacaoConfigInputSchema.extend({
  atualizadoEm: z.iso.datetime().nullable(),
});
export type ConfirmacaoConfig = z.infer<typeof confirmacaoConfigSchema>;

/** `POST /confirmacoes/modelos` e `PATCH /confirmacoes/modelos/:id`: "Novo Modelo". */
export const confirmacaoModeloInputSchema = z.strictObject({
  tipoAgendamentoId: z.uuid({ error: mensagemObrigatoria('Tipo de agendamento') }),
  msg1: texto('A MSG1'),
  msg2: texto('A MSG2'),
  msg3: texto('A MSG3'),
  lembreteConfirmado: texto('O lembrete (confirmado)'),
  lembreteNaoConfirmado: texto('O lembrete (não confirmado)'),
});
export type ConfirmacaoModeloInput = z.output<typeof confirmacaoModeloInputSchema>;
export type ConfirmacaoModeloFormulario = z.input<typeof confirmacaoModeloInputSchema>;

export const confirmacaoModeloSchema = confirmacaoModeloInputSchema.extend({
  id: z.uuid(),
  /** Nome do tipo de agendamento. */
  tipo: z.string(),
});
export type ConfirmacaoModelo = z.infer<typeof confirmacaoModeloSchema>;
export const confirmacaoModeloListaSchema = z.array(confirmacaoModeloSchema);
