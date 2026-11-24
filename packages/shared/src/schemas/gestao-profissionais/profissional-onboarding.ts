import { z } from 'zod';
import { traduzirValidacao } from '../../i18n/validacao';
import { erroObrigatorio } from '../common/obrigatorio';
import { listQuerySchema } from '../common/list-query';
import { paginatedResponseSchema } from '../common/pagination';
import { contratoDiaSchema } from './contrato-sala';
import {
  tiposObrigatorios,
  type ProfissaoDocumento,
  type ProfissionalDocumentoTipo,
} from './profissional-documento';

/**
 * Onboarding do profissional (issue #142, R §6): checklist que nasce da assinatura do contrato de
 * sala e leva o profissional até "ativo".
 *
 * Decisões confirmadas pelo dev na #142: assinatura é só registro (data e PDF assinado, sem
 * assinatura eletrônica); só "Recepção orientada" é manual, as demais etapas são calculadas na
 * leitura pelo dado de origem; prazo de 7 dias a partir da assinatura; contratos já existentes não
 * ganham checklist retroativo.
 */

export const ONBOARDING_ETAPAS = [
  'CONTRATO_ASSINADO',
  'CADASTRO_COMPLETO',
  'DOCUMENTACAO_VALIDADA',
  'SALA_DEFINIDA',
  'AGENDA_CONFIGURADA',
  'ACESSO_CRIADO',
  'RECEPCAO_ORIENTADA',
  'PRIMEIRO_ATENDIMENTO',
  'PROFISSIONAL_ATIVO',
] as const;
export type OnboardingEtapa = (typeof ONBOARDING_ETAPAS)[number];
export const onboardingEtapaSchema = z.enum(ONBOARDING_ETAPAS, {
  error: () => traduzirValidacao('validacao.opcaoInvalida'),
});

/** Rótulos em português (API e exportação). A tela usa as traduções. */
export const ONBOARDING_ETAPA_ROTULOS: Readonly<Record<OnboardingEtapa, string>> = {
  CONTRATO_ASSINADO: 'Contrato assinado',
  CADASTRO_COMPLETO: 'Cadastro completo',
  DOCUMENTACAO_VALIDADA: 'Documentação validada',
  SALA_DEFINIDA: 'Sala definida',
  AGENDA_CONFIGURADA: 'Agenda configurada',
  ACESSO_CRIADO: 'Acesso ao sistema criado',
  RECEPCAO_ORIENTADA: 'Recepção orientada',
  PRIMEIRO_ATENDIMENTO: 'Primeiro atendimento',
  PROFISSIONAL_ATIVO: 'Profissional ativo',
};

/** Única etapa marcada por uma pessoa (com quem e quando). */
export const ONBOARDING_ETAPA_MANUAL: OnboardingEtapa = 'RECEPCAO_ORIENTADA';

/** Etapas que precisam estar concluídas para ativar o profissional (todas menos "ativo"). */
export const ONBOARDING_ETAPAS_OBRIGATORIAS: readonly OnboardingEtapa[] = ONBOARDING_ETAPAS.filter(
  (etapa) => etapa !== 'PROFISSIONAL_ATIVO',
);

/** Dias, a partir da assinatura do contrato, para uma etapa pendente passar a atrasada. */
export const ONBOARDING_PRAZO_DIAS = 7;

// --- Cadastro completo -----------------------------------------------------------------

/** Campos do profissional exigidos pela etapa "Cadastro completo" (essenciais + fiscais). */
export const ONBOARDING_CADASTRO_CAMPOS = [
  'nome',
  'profissao',
  'registro',
  'especialidade',
  'cpf',
  'rg',
  'dataNascimento',
  'endereco',
  'contato',
  'cnpj',
  'contatoAdministrativo',
] as const;
export type OnboardingCadastroCampo = (typeof ONBOARDING_CADASTRO_CAMPOS)[number];

export const ONBOARDING_CADASTRO_CAMPO_ROTULOS: Readonly<Record<OnboardingCadastroCampo, string>> =
  {
    nome: 'Nome',
    profissao: 'Profissão',
    registro: 'Registro no conselho',
    especialidade: 'Especialidade',
    cpf: 'CPF',
    rg: 'RG',
    dataNascimento: 'Data de nascimento',
    endereco: 'Endereço',
    contato: 'Telefone ou e-mail',
    cnpj: 'CNPJ',
    contatoAdministrativo: 'Contato administrativo',
  };

/** Dados do cadastro que a etapa avalia (subconjunto do profissional). */
export interface CadastroParaOnboarding {
  nome: string | null;
  profissao: string | null;
  registro: string | null;
  especialidadeId: string | null;
  cpf: string | null;
  rg: string | null;
  dataNascimento: unknown;
  endereco: string | null;
  telefone: string | null;
  email: string | null;
  cnpj: string | null;
  contatosAdministrativos: number;
}

const preenchido = (valor: string | null): boolean => (valor ?? '').trim() !== '';

/** Campos que ainda faltam para o cadastro ser considerado completo. */
export function camposCadastroPendentes(
  cadastro: CadastroParaOnboarding,
): OnboardingCadastroCampo[] {
  const ok: Record<OnboardingCadastroCampo, boolean> = {
    nome: preenchido(cadastro.nome),
    profissao: preenchido(cadastro.profissao),
    registro: preenchido(cadastro.registro),
    especialidade: cadastro.especialidadeId !== null,
    cpf: preenchido(cadastro.cpf),
    rg: preenchido(cadastro.rg),
    dataNascimento: cadastro.dataNascimento !== null && cadastro.dataNascimento !== undefined,
    endereco: preenchido(cadastro.endereco),
    contato: preenchido(cadastro.telefone) || preenchido(cadastro.email),
    cnpj: preenchido(cadastro.cnpj),
    contatoAdministrativo: cadastro.contatosAdministrativos > 0,
  };
  return ONBOARDING_CADASTRO_CAMPOS.filter((campo) => !ok[campo]);
}

// --- Documentação validada -------------------------------------------------------------

/**
 * Tipos de documento que a etapa "Documentação validada" exige: os obrigatórios da profissão
 * (contrato, documento pessoal, registro no conselho) mais licença e, havendo RQE no cadastro, o
 * RQE. Todos precisam estar validados e dentro da validade.
 */
export function tiposObrigatoriosOnboarding(
  profissao: ProfissaoDocumento | null | undefined,
  temRqe: boolean,
): ProfissionalDocumentoTipo[] {
  const tipos = new Set<ProfissionalDocumentoTipo>(tiposObrigatorios(profissao));
  tipos.add('LICENCA');
  if (temRqe) tipos.add('RQE');
  return [...tipos];
}

// --- Respostas -------------------------------------------------------------------------

export const onboardingEtapaItemSchema = z.object({
  etapa: onboardingEtapaSchema,
  concluida: z.boolean(),
  /** Calculada pelo dado de origem (`false` só em "Recepção orientada"). */
  automatica: z.boolean(),
  concluidaEm: z.iso.datetime().nullable(),
  concluidaPorId: z.uuid().nullable(),
  concluidaPorNome: z.string().nullable(),
  /** Pendente e com mais de `ONBOARDING_PRAZO_DIAS` dias desde a assinatura. */
  atrasada: z.boolean(),
  /** O que falta: campos do cadastro (`OnboardingCadastroCampo`) ou tipos de documento. */
  pendencias: z.array(z.string()),
});
export type OnboardingEtapaItem = z.infer<typeof onboardingEtapaItemSchema>;

export const onboardingSugestaoHorarioSchema = contratoDiaSchema;

/** O que o sistema sugere fazer depois da assinatura (o dev confirma na tela). */
export const onboardingSugestoesSchema = z.object({
  /** Dias e horários do contrato, quando o profissional ainda não tem horário de atendimento. */
  horarios: z.array(onboardingSugestaoHorarioSchema),
  /** Não há usuário vinculado ao profissional. */
  criarUsuario: z.boolean(),
});
export type OnboardingSugestoes = z.infer<typeof onboardingSugestoesSchema>;

export const onboardingSchema = z.object({
  id: z.uuid(),
  profissionalId: z.uuid(),
  profissionalNome: z.string(),
  contratoSalaId: z.uuid(),
  salaNome: z.string().nullable(),
  /** Data da assinatura do contrato (início do onboarding). */
  iniciadoEm: z.iso.date(),
  diasEmAndamento: z.number().int(),
  etapas: z.array(onboardingEtapaItemSchema),
  concluidas: z.number().int(),
  total: z.number().int(),
  /** Todas as etapas, inclusive "Profissional ativo". */
  completo: z.boolean(),
  /** Alguma etapa pendente passou do prazo. */
  atrasada: z.boolean(),
  /** As etapas obrigatórias estão concluídas: o profissional pode ser ativado. */
  podeAtivar: z.boolean(),
  sugestoes: onboardingSugestoesSchema,
});
export type Onboarding = z.infer<typeof onboardingSchema>;

/** `GET /api/gestao-profissionais/profissionais/:id/onboarding`: `onboarding` nulo = sem checklist. */
export const onboardingResponseSchema = z.object({ onboarding: onboardingSchema.nullable() });
export type OnboardingResponse = z.infer<typeof onboardingResponseSchema>;

/** Corpo de `PUT /api/gestao-profissionais/profissionais/:id/onboarding/recepcao`. */
export const onboardingRecepcaoInputSchema = z.strictObject({
  orientada: z.boolean({ error: () => traduzirValidacao('validacao.opcaoInvalida') }),
});
export type OnboardingRecepcaoInput = z.infer<typeof onboardingRecepcaoInputSchema>;

/** Corpo de `POST /api/gestao-profissionais/contratos-sala/:id/assinar`. */
export const assinarContratoSalaSchema = z.strictObject({
  assinadoEm: z
    .string({ error: erroObrigatorio('Data de assinatura', 'f') })
    .min(1, { error: erroObrigatorio('Data de assinatura', 'f') })
    .pipe(z.iso.date({ error: 'Data de assinatura inválida' })),
  /** PDF assinado, já enviado em `/api/arquivos` (uso `contrato-sala`). */
  pdfArquivoId: z
    .uuid({ error: 'Arquivo inválido' })
    .nullish()
    .transform((valor) => valor ?? null),
});
export type AssinarContratoSalaFormulario = z.input<typeof assinarContratoSalaSchema>;
export type AssinarContratoSalaInput = z.output<typeof assinarContratoSalaSchema>;

// --- Lista "Onboarding em andamento" ---------------------------------------------------

export const ONBOARDING_SITUACOES = ['EM_ANDAMENTO', 'ATRASADO'] as const;
export const onboardingSituacaoSchema = z.enum(ONBOARDING_SITUACOES);
export type OnboardingSituacao = z.infer<typeof onboardingSituacaoSchema>;

export const ONBOARDING_SORT_FIELDS = ['profissionalNome', 'iniciadoEm', 'concluidas'] as const;

/** `GET /api/gestao-profissionais/onboarding`. */
export const listOnboardingQuerySchema = listQuerySchema({
  sortFields: ONBOARDING_SORT_FIELDS,
  defaultSort: 'iniciadoEm:asc',
  filters: { situacao: onboardingSituacaoSchema.optional() },
});
export type ListOnboardingQuery = z.infer<typeof listOnboardingQuerySchema>;

export const onboardingPageSchema = paginatedResponseSchema(onboardingSchema);
export type OnboardingPage = z.infer<typeof onboardingPageSchema>;
