import { z } from 'zod';
import { erroObrigatorio } from '../common/obrigatorio';

/**
 * Consentimentos do paciente (LGPD, requisito R §8 e §41; issue #148). Cada registro é um fato:
 * revogar cria um novo registro `aceito: false`, o anterior fica no histórico. O consentimento
 * vigente de cada tipo é o registro mais recente.
 */
export const CONSENTIMENTO_TIPOS = ['TRATAMENTO_DADOS', 'COMUNICACAO', 'CAMPANHAS'] as const;
export const consentimentoTipoSchema = z.enum(CONSENTIMENTO_TIPOS, {
  error: erroObrigatorio('Tipo'),
});
export type ConsentimentoTipo = z.infer<typeof consentimentoTipoSchema>;

export const CONSENTIMENTO_TIPO_ROTULOS: Record<ConsentimentoTipo, string> = {
  TRATAMENTO_DADOS: 'Tratamento de dados',
  COMUNICACAO: 'Comunicação',
  CAMPANHAS: 'Campanhas',
};

/** Onde o paciente deu (ou retirou) o consentimento. */
export const CONSENTIMENTO_CANAIS = [
  'PRESENCIAL',
  'WHATSAPP',
  'TELEFONE',
  'EMAIL',
  'SITE',
  'OUTRO',
] as const;
export const consentimentoCanalSchema = z.enum(CONSENTIMENTO_CANAIS, {
  error: erroObrigatorio('Canal'),
});
export type ConsentimentoCanal = z.infer<typeof consentimentoCanalSchema>;

export const CONSENTIMENTO_CANAL_ROTULOS: Record<ConsentimentoCanal, string> = {
  PRESENCIAL: 'Presencial',
  WHATSAPP: 'WhatsApp',
  TELEFONE: 'Telefone',
  EMAIL: 'Email',
  SITE: 'Site',
  OUTRO: 'Outro',
};

/** Versão do termo de consentimento gravada em cada registro. */
export const CONSENTIMENTO_VERSAO_ATUAL = '1';

export const CONSENTIMENTO_OBSERVACAO_MAX = 500;

/** Corpo de `POST /api/comercial-atendimento/pacientes/:id/consentimentos`. */
export const createConsentimentoSchema = z.strictObject({
  tipo: consentimentoTipoSchema,
  aceito: z.boolean({ error: erroObrigatorio('Consentimento') }),
  canal: consentimentoCanalSchema,
  observacao: z
    .string()
    .trim()
    .max(CONSENTIMENTO_OBSERVACAO_MAX)
    .nullish()
    .transform((valor) => valor || null),
});

export type ConsentimentoInput = z.input<typeof createConsentimentoSchema>;
export type CreateConsentimentoInput = z.output<typeof createConsentimentoSchema>;

export const consentimentoSchema = z.object({
  id: z.uuid(),
  pacienteId: z.uuid(),
  tipo: consentimentoTipoSchema,
  aceito: z.boolean(),
  canal: consentimentoCanalSchema,
  versao: z.string(),
  observacao: z.string().nullable(),
  /** Usuário que registrou; `null` quando veio de rotina do sistema ou de migração. */
  registradoPorId: z.string().nullable(),
  registradoPorNome: z.string().nullable(),
  registradoEm: z.iso.datetime(),
});

export type Consentimento = z.infer<typeof consentimentoSchema>;

/** `GET .../pacientes/:id/consentimentos`: histórico, do mais recente para o mais antigo. */
export const consentimentosResponseSchema = z.object({ data: z.array(consentimentoSchema) });
export type ConsentimentosResponse = z.infer<typeof consentimentosResponseSchema>;
