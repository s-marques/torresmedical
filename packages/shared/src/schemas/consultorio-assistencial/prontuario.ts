import { z } from 'zod';
import { listQuerySchema } from '../common/list-query';
import { paginatedResponseSchema } from '../common/pagination';
import { pacienteSexoSchema } from '../comercial-atendimento/paciente';

const textoOpcional = (max: number, rotulo: string) =>
  z
    .string({ error: `${rotulo} inválido` })
    .trim()
    .max(max, { error: `${rotulo} deve ter no máximo ${max} caracteres` })
    .nullish()
    .transform((valor) => valor || null);

const TEXTO_CLINICO_MAX = 4000;

// --- Resumo do paciente (cabeçalho e lista) -------------------------------------------------

export const pacienteResumoProntuarioSchema = z.object({
  id: z.uuid(),
  nome: z.string(),
  email: z.string().nullable(),
  documento: z.string().nullable(),
  telefone: z.string().nullable(),
  celular: z.string().nullable(),
  dataNascimento: z.iso.date().nullable(),
  sexo: pacienteSexoSchema.nullable(),
});

export type PacienteResumoProntuario = z.infer<typeof pacienteResumoProntuarioSchema>;

export const pacienteComRegistrosSchema = pacienteResumoProntuarioSchema.extend({
  totalRegistros: z.number().int().min(0),
  ultimoRegistro: z.iso.datetime().nullable(),
});

export type PacienteComRegistros = z.infer<typeof pacienteComRegistrosSchema>;

export const PACIENTE_COM_REGISTROS_SORT_FIELDS = ['nome', 'ultimoRegistro'] as const;

/** `GET /api/consultorio-assistencial/prontuarios`: só pacientes com ao menos 1 registro. */
export const listPacientesComRegistrosQuerySchema = listQuerySchema({
  sortFields: PACIENTE_COM_REGISTROS_SORT_FIELDS,
  defaultSort: 'ultimoRegistro:desc',
  filters: {},
});

export type ListPacientesComRegistrosQuery = z.infer<typeof listPacientesComRegistrosQuerySchema>;

export const pacientesComRegistrosPageSchema = paginatedResponseSchema(pacienteComRegistrosSchema);
export type PacientesComRegistrosPage = z.infer<typeof pacientesComRegistrosPageSchema>;

// --- Prontuário (aba "Prontuário": alergias, medicamentos…) ---------------------------------

/**
 * Corpo de `PUT /api/consultorio-assistencial/prontuarios/:pacienteId` (botão "Salvar").
 * Cria o prontuário do paciente se ainda não existir.
 */
export const prontuarioInputSchema = z.strictObject({
  alergias: textoOpcional(TEXTO_CLINICO_MAX, 'Alergias'),
  medicamentosEmUso: textoOpcional(TEXTO_CLINICO_MAX, 'Medicamentos em uso'),
  doencasCronicas: textoOpcional(TEXTO_CLINICO_MAX, 'Doenças crônicas'),
  cirurgiasAnteriores: textoOpcional(TEXTO_CLINICO_MAX, 'Cirurgias anteriores'),
  historicoFamiliar: textoOpcional(TEXTO_CLINICO_MAX, 'Histórico familiar'),
  observacoes: textoOpcional(TEXTO_CLINICO_MAX, 'Observações'),
});

export type ProntuarioFormulario = z.input<typeof prontuarioInputSchema>;
export type UpsertProntuarioInput = z.output<typeof prontuarioInputSchema>;

export const prontuarioSchema = z.object({
  pacienteId: z.uuid(),
  alergias: z.string().nullable(),
  medicamentosEmUso: z.string().nullable(),
  doencasCronicas: z.string().nullable(),
  cirurgiasAnteriores: z.string().nullable(),
  historicoFamiliar: z.string().nullable(),
  observacoes: z.string().nullable(),
  /** `null`: ainda não salvo (nenhum campo foi preenchido até agora). */
  createdAt: z.iso.datetime().nullable(),
  updatedAt: z.iso.datetime().nullable(),
});

export type Prontuario = z.infer<typeof prontuarioSchema>;

// --- Atendimentos (aba "Atendimentos") -------------------------------------------------------

export const ATENDIMENTO_TIPOS = ['CONSULTA', 'RETORNO', 'PROCEDIMENTO', 'EXAME'] as const;
export const atendimentoTipoSchema = z.enum(ATENDIMENTO_TIPOS, { error: 'Tipo inválido' });
export type AtendimentoTipo = z.infer<typeof atendimentoTipoSchema>;

export const ATENDIMENTO_TIPO_ROTULOS: Record<AtendimentoTipo, string> = {
  CONSULTA: 'Consulta',
  RETORNO: 'Retorno',
  PROCEDIMENTO: 'Procedimento',
  EXAME: 'Exame',
};

export const ATENDIMENTO_STATUS = ['EM_ANDAMENTO', 'FINALIZADO'] as const;
export const atendimentoStatusSchema = z.enum(ATENDIMENTO_STATUS, { error: 'Status inválido' });
export type AtendimentoStatus = z.infer<typeof atendimentoStatusSchema>;

export const ATENDIMENTO_STATUS_ROTULOS: Record<AtendimentoStatus, string> = {
  EM_ANDAMENTO: 'Em andamento',
  FINALIZADO: 'Finalizado',
};

/** Corpo de `POST /api/consultorio-assistencial/prontuarios/:pacienteId/atendimentos`. */
const MSG_PROFISSIONAL = 'Selecione o profissional.';

export const atendimentoInputSchema = z.strictObject({
  profissionalId: z.uuid({ error: MSG_PROFISSIONAL }).min(1, { error: MSG_PROFISSIONAL }),
  tipo: atendimentoTipoSchema.nullish().transform((valor) => valor ?? null),
  queixa: textoOpcional(TEXTO_CLINICO_MAX, 'Queixa'),
  evolucao: textoOpcional(TEXTO_CLINICO_MAX, 'Evolução'),
  diagnostico: textoOpcional(TEXTO_CLINICO_MAX, 'Diagnóstico'),
  conduta: textoOpcional(TEXTO_CLINICO_MAX, 'Conduta'),
  observacoes: textoOpcional(TEXTO_CLINICO_MAX, 'Observações'),
  status: atendimentoStatusSchema.default('EM_ANDAMENTO'),
});

export type AtendimentoFormulario = z.input<typeof atendimentoInputSchema>;
export type CreateAtendimentoInput = z.output<typeof atendimentoInputSchema>;

export const atendimentoSchema = z.object({
  id: z.uuid(),
  pacienteId: z.uuid(),
  profissionalId: z.uuid(),
  profissionalNome: z.string().nullable(),
  tipo: atendimentoTipoSchema.nullable(),
  queixa: z.string().nullable(),
  evolucao: z.string().nullable(),
  diagnostico: z.string().nullable(),
  conduta: z.string().nullable(),
  observacoes: z.string().nullable(),
  status: atendimentoStatusSchema,
  /** Registro assinado não é editado: correções entram como adendo (issue #151). */
  assinadoEm: z.iso.datetime().nullable(),
  assinadoPorNome: z.string().nullable(),
  /** Quantidade de adendos depois da assinatura. */
  totalAdendos: z.number().int().min(0),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type Atendimento = z.infer<typeof atendimentoSchema>;

export const listRegistrosQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

export type ListRegistrosQuery = z.infer<typeof listRegistrosQuerySchema>;

export const atendimentoPageSchema = paginatedResponseSchema(atendimentoSchema);
export type AtendimentoPage = z.infer<typeof atendimentoPageSchema>;

// --- Anamneses (aba "Anamneses") -------------------------------------------------------------

/** Corpo de `POST /api/consultorio-assistencial/prontuarios/:pacienteId/anamneses`. */
export const anamneseInputSchema = z.strictObject({
  profissionalId: z
    .uuid({ error: 'Profissional inválido' })
    .nullish()
    .transform((valor) => valor ?? null),
  queixaPrincipal: textoOpcional(TEXTO_CLINICO_MAX, 'Queixa principal'),
  historiaDoencaAtual: textoOpcional(TEXTO_CLINICO_MAX, 'História da doença atual'),
  exameFisico: textoOpcional(TEXTO_CLINICO_MAX, 'Exame físico'),
  hipoteseDiagnostica: textoOpcional(TEXTO_CLINICO_MAX, 'Hipótese diagnóstica'),
  conduta: textoOpcional(TEXTO_CLINICO_MAX, 'Conduta'),
});

export type AnamneseFormulario = z.input<typeof anamneseInputSchema>;
export type CreateAnamneseInput = z.output<typeof anamneseInputSchema>;

export const anamneseSchema = z.object({
  id: z.uuid(),
  pacienteId: z.uuid(),
  profissionalId: z.uuid().nullable(),
  profissionalNome: z.string().nullable(),
  queixaPrincipal: z.string().nullable(),
  historiaDoencaAtual: z.string().nullable(),
  exameFisico: z.string().nullable(),
  hipoteseDiagnostica: z.string().nullable(),
  conduta: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type Anamnese = z.infer<typeof anamneseSchema>;

export const anamnesePageSchema = paginatedResponseSchema(anamneseSchema);
export type AnamnesePage = z.infer<typeof anamnesePageSchema>;

// --- Histórico Clínico (aba somente leitura: Atendimentos, Anamneses e Prescrições) -------

export const HISTORICO_CLINICO_TIPOS = ['ATENDIMENTO', 'ANAMNESE', 'PRESCRICAO'] as const;
export const historicoClinicoTipoSchema = z.enum(HISTORICO_CLINICO_TIPOS);
export type HistoricoClinicoTipo = z.infer<typeof historicoClinicoTipoSchema>;

export const historicoClinicoItemSchema = z.object({
  id: z.uuid(),
  tipo: historicoClinicoTipoSchema,
  /** Rótulo do selo: tipo do atendimento (ex.: "Consulta"), "Anamnese" ou o receituário. */
  rotulo: z.string(),
  data: z.iso.datetime(),
  profissionalNome: z.string().nullable(),
  /** Primeiro campo clínico não vazio do registro, para o resumo da linha. */
  resumo: z.string().nullable(),
});

export type HistoricoClinicoItem = z.infer<typeof historicoClinicoItemSchema>;

export const historicoClinicoPageSchema = paginatedResponseSchema(historicoClinicoItemSchema);
export type HistoricoClinicoPage = z.infer<typeof historicoClinicoPageSchema>;

// --- Log de acesso de leitura (issue #150) ---------------------------------------------------

/** O que foi aberto no prontuário. */
export const PRONTUARIO_ACESSO_RECURSOS = [
  'PRONTUARIO',
  'ATENDIMENTOS',
  'ANAMNESES',
  'RECEITAS',
  'HISTORICO_CLINICO',
  /** Exames e anexos, documentos e versões do atendimento (issue #151). */
  'ANEXOS',
  'DOCUMENTOS',
  'VERSOES',
] as const;

export const prontuarioAcessoRecursoSchema = z.enum(PRONTUARIO_ACESSO_RECURSOS, {
  error: 'Recurso inválido',
});

export type ProntuarioAcessoRecurso = z.infer<typeof prontuarioAcessoRecursoSchema>;

/** Filtros de `GET /api/consultorio-assistencial/prontuarios/acessos`. */
export const listProntuarioAcessosQuerySchema = listRegistrosQuerySchema.extend({
  pacienteId: z.uuid({ error: 'Paciente inválido' }).optional(),
  usuarioId: z.string().trim().min(1).max(100).optional(),
  recurso: prontuarioAcessoRecursoSchema.optional(),
});

export type ListProntuarioAcessosQuery = z.infer<typeof listProntuarioAcessosQuerySchema>;

/** Só ids: o log nunca guarda conteúdo clínico nem dado pessoal. */
export const prontuarioAcessoSchema = z.object({
  id: z.uuid(),
  usuarioId: z.string(),
  pacienteId: z.uuid(),
  recurso: prontuarioAcessoRecursoSchema,
  acessadoEm: z.iso.datetime(),
  requestId: z.string().nullable(),
  ip: z.string().nullable(),
});

export type ProntuarioAcesso = z.infer<typeof prontuarioAcessoSchema>;

export const prontuarioAcessoPageSchema = paginatedResponseSchema(prontuarioAcessoSchema);
export type ProntuarioAcessoPage = z.infer<typeof prontuarioAcessoPageSchema>;
