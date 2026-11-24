import { z } from 'zod';
import { paginatedResponseSchema, paginationQuerySchema } from '../common/pagination';

/**
 * Linha do tempo do relacionamento com o profissional, do lead ao primeiro atendimento
 * (issue #144, R §24). Não é gravada: é montada na leitura a partir das fontes (CRM, contrato de
 * sala, onboarding e atendimentos), então nunca fica fora de sincronia.
 *
 * Decisões confirmadas pelo dev na #144:
 * - o negócio do CRM se liga ao profissional por `Negocio.profissionalId`, pelo "Vincular
 *   negócio" na própria linha do tempo (o lead médico ainda não é cadastrado);
 * - sem o evento "Negociação" (o CRM não tem esse marco) e sem "Reajuste" (não há fluxo);
 * - sem autor onde a fonte não registra quem fez (marcos do CRM, assinatura e encerramento);
 * - o histórico é uma seção do detalhe do profissional, não uma aba nova.
 */

/** Tipo de evento da linha do tempo; é o filtro da tela. */
export const HISTORICO_TIPOS = ['CRM', 'CONTRATO', 'ONBOARDING', 'ATENDIMENTO'] as const;
export type HistoricoTipo = (typeof HISTORICO_TIPOS)[number];
export const historicoTipoSchema = z.enum(HISTORICO_TIPOS);

/** Rótulos em português (API). A tela usa as traduções. */
export const HISTORICO_TIPO_ROTULOS: Readonly<Record<HistoricoTipo, string>> = {
  CRM: 'CRM',
  CONTRATO: 'Contrato',
  ONBOARDING: 'Onboarding',
  ATENDIMENTO: 'Atendimento',
};

/** O que aconteceu. Cada código pertence a um tipo (`HISTORICO_EVENTO_TIPO`). */
export const HISTORICO_EVENTOS = [
  'LEAD_CRIADO',
  'PRIMEIRO_CONTATO',
  'VISITA_REALIZADA',
  'PROPOSTA_ENVIADA',
  'CONTRATO_FECHADO',
  'ATIVIDADE_CONCLUIDA',
  'CONTRATO_ASSINADO',
  'CONTRATO_ENCERRADO',
  'CONTRATO_CANCELADO',
  'ONBOARDING_INICIADO',
  'RECEPCAO_ORIENTADA',
  'PRIMEIRO_ATENDIMENTO',
] as const;
export type HistoricoEvento = (typeof HISTORICO_EVENTOS)[number];
export const historicoEventoSchema = z.enum(HISTORICO_EVENTOS);

export const HISTORICO_EVENTO_TIPO: Readonly<Record<HistoricoEvento, HistoricoTipo>> = {
  LEAD_CRIADO: 'CRM',
  PRIMEIRO_CONTATO: 'CRM',
  VISITA_REALIZADA: 'CRM',
  PROPOSTA_ENVIADA: 'CRM',
  CONTRATO_FECHADO: 'CRM',
  ATIVIDADE_CONCLUIDA: 'CRM',
  CONTRATO_ASSINADO: 'CONTRATO',
  CONTRATO_ENCERRADO: 'CONTRATO',
  CONTRATO_CANCELADO: 'CONTRATO',
  ONBOARDING_INICIADO: 'ONBOARDING',
  RECEPCAO_ORIENTADA: 'ONBOARDING',
  PRIMEIRO_ATENDIMENTO: 'ATENDIMENTO',
};

/** Rótulos em português (API). A tela usa as traduções. */
export const HISTORICO_EVENTO_ROTULOS: Readonly<Record<HistoricoEvento, string>> = {
  LEAD_CRIADO: 'Lead criado',
  PRIMEIRO_CONTATO: 'Primeiro contato',
  VISITA_REALIZADA: 'Visita realizada',
  PROPOSTA_ENVIADA: 'Proposta enviada',
  CONTRATO_FECHADO: 'Contrato fechado no CRM',
  ATIVIDADE_CONCLUIDA: 'Atividade concluída',
  CONTRATO_ASSINADO: 'Contrato assinado',
  CONTRATO_ENCERRADO: 'Contrato encerrado',
  CONTRATO_CANCELADO: 'Contrato cancelado',
  ONBOARDING_INICIADO: 'Onboarding iniciado',
  RECEPCAO_ORIENTADA: 'Recepção orientada',
  PRIMEIRO_ATENDIMENTO: 'Primeiro atendimento',
};

/** Telas do sistema para onde o evento aponta (o "link" de cada evento). */
export const HISTORICO_LINKS = ['/negocios', '/atividades', '/salas'] as const;
export type HistoricoLink = (typeof HISTORICO_LINKS)[number];

export const profissionalHistoricoEventoSchema = z.object({
  /** Identificador estável do evento (origem + id da origem + código). */
  id: z.string(),
  tipo: historicoTipoSchema,
  evento: historicoEventoSchema,
  /** Instante do evento (ISO). Quando `somenteData`, vale só o dia (meia-noite UTC). */
  ocorridoEm: z.iso.datetime(),
  /** A fonte guarda só o dia (assinatura, encerramento, início do onboarding): a tela não mostra hora. */
  somenteData: z.boolean(),
  /** Complemento livre: título do negócio ou da atividade, sala, motivo. */
  detalhe: z.string().nullable(),
  /** Quem fez, quando a fonte registra. */
  autor: z.string().nullable(),
  /** Tela de origem do evento. */
  link: z.enum(HISTORICO_LINKS).nullable(),
});
export type ProfissionalHistoricoEvento = z.infer<typeof profissionalHistoricoEventoSchema>;

export const profissionalHistoricoQuerySchema = z.object({
  tipo: historicoTipoSchema.optional(),
  /** `asc` = do mais antigo ao mais recente (padrão, como a linha do tempo da R §24). */
  ordem: z.enum(['asc', 'desc']).default('asc'),
});
export type ProfissionalHistoricoQuery = z.infer<typeof profissionalHistoricoQuerySchema>;

export const profissionalHistoricoSchema = z.object({
  data: z.array(profissionalHistoricoEventoSchema),
});
export type ProfissionalHistorico = z.infer<typeof profissionalHistoricoSchema>;

/** Corpo do vínculo do negócio do CRM com o profissional (`null` desfaz o vínculo). */
export const negocioProfissionalInputSchema = z.object({
  profissionalId: z.uuid().nullable(),
});
export type NegocioProfissionalInput = z.infer<typeof negocioProfissionalInputSchema>;

/** Negócio do CRM na busca do "Vincular negócio" (a lista traz só abertos e ganhos). */
export const negocioVinculavelSchema = z.object({
  id: z.uuid(),
  titulo: z.string(),
  estagio: z.string(),
  status: z.enum(['ABERTO', 'GANHO', 'PERDIDO']),
  criadoEm: z.iso.datetime(),
});
export type NegocioVinculavel = z.infer<typeof negocioVinculavelSchema>;

/** Resposta do vínculo: o negócio e o profissional a que ficou ligado (nulo = desfeito). */
export const negocioVinculoSchema = negocioVinculavelSchema.extend({
  profissionalId: z.uuid().nullable(),
});
export type NegocioVinculo = z.infer<typeof negocioVinculoSchema>;

export const negocioVinculavelQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().max(200).optional(),
});
export type NegocioVinculavelQuery = z.infer<typeof negocioVinculavelQuerySchema>;
export const negocioVinculavelPageSchema = paginatedResponseSchema(negocioVinculavelSchema);
