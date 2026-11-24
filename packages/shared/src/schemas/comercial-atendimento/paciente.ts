import { z } from 'zod';
import { exportQuerySchema, listQuerySchema } from '../common/list-query';
import { mensagemObrigatoria } from '../common/obrigatorio';
import { paginatedResponseSchema } from '../common/pagination';
import { createConsentimentoSchema } from './consentimento-paciente';

export const PACIENTE_TIPOS = ['PF', 'PJ'] as const;
export const pacienteTipoSchema = z.enum(PACIENTE_TIPOS, { error: 'Tipo de pessoa inválido' });
export type PacienteTipo = z.infer<typeof pacienteTipoSchema>;

export const PACIENTE_TIPO_ROTULOS: Record<PacienteTipo, string> = {
  PF: 'Pessoa Física',
  PJ: 'Pessoa Jurídica',
};

/** Novo é o status de quem acabou de ser cadastrado (badge "Novo" do grid). */
export const PACIENTE_STATUS = ['NOVO', 'ATIVO', 'INATIVO'] as const;
export const pacienteStatusSchema = z.enum(PACIENTE_STATUS, { error: 'Status inválido' });
export type PacienteStatus = z.infer<typeof pacienteStatusSchema>;

export const PACIENTE_STATUS_ROTULOS: Record<PacienteStatus, string> = {
  NOVO: 'Novo',
  ATIVO: 'Ativo',
  INATIVO: 'Inativo',
};

export const PACIENTE_SEXOS = ['FEMININO', 'MASCULINO', 'OUTRO'] as const;
export const pacienteSexoSchema = z.enum(PACIENTE_SEXOS, { error: 'Sexo inválido' });
export type PacienteSexo = z.infer<typeof pacienteSexoSchema>;

export const PACIENTE_SEXO_ROTULOS: Record<PacienteSexo, string> = {
  FEMININO: 'Feminino',
  MASCULINO: 'Masculino',
  OUTRO: 'Outro / não informado',
};

/** Como o paciente chegou à clínica (diferente da origem: Indicação, Instagram…). */
export const PACIENTE_CANAIS_ORIGEM = [
  'WHATSAPP',
  'TELEFONE',
  'SITE',
  'PRESENCIAL',
  'REDES_SOCIAIS',
  'OUTRO',
] as const;
export const pacienteCanalOrigemSchema = z.enum(PACIENTE_CANAIS_ORIGEM, {
  error: 'Canal de origem inválido',
});
export type PacienteCanalOrigem = z.infer<typeof pacienteCanalOrigemSchema>;

export const PACIENTE_CANAL_ORIGEM_ROTULOS: Record<PacienteCanalOrigem, string> = {
  WHATSAPP: 'WhatsApp',
  TELEFONE: 'Telefone',
  SITE: 'Site',
  PRESENCIAL: 'Presencial',
  REDES_SOCIAIS: 'Redes sociais',
  OUTRO: 'Outro',
};

export const PACIENTE_PREFERENCIAS_COMUNICACAO = [
  'WHATSAPP',
  'TELEFONE',
  'EMAIL',
  'SEM_PREFERENCIA',
] as const;
export const pacientePreferenciaComunicacaoSchema = z.enum(PACIENTE_PREFERENCIAS_COMUNICACAO, {
  error: 'Preferência de comunicação inválida',
});
export type PacientePreferenciaComunicacao = z.infer<typeof pacientePreferenciaComunicacaoSchema>;

export const PACIENTE_PREFERENCIA_COMUNICACAO_ROTULOS: Record<
  PacientePreferenciaComunicacao,
  string
> = {
  WHATSAPP: 'WhatsApp',
  TELEFONE: 'Telefone',
  EMAIL: 'Email',
  SEM_PREFERENCIA: 'Sem preferência',
};

/** Quem indicou o paciente: outro paciente, um profissional do Torres ou texto livre. */
export const PACIENTE_INDICACAO_TIPOS = ['PACIENTE', 'PROFISSIONAL', 'TEXTO'] as const;
export const pacienteIndicacaoTipoSchema = z.enum(PACIENTE_INDICACAO_TIPOS, {
  error: 'Tipo de indicação inválido',
});
export type PacienteIndicacaoTipo = z.infer<typeof pacienteIndicacaoTipoSchema>;

export const PACIENTE_INDICACAO_TIPO_ROTULOS: Record<PacienteIndicacaoTipo, string> = {
  PACIENTE: 'Paciente',
  PROFISSIONAL: 'Profissional do Torres',
  TEXTO: 'Outra pessoa (texto livre)',
};

export const PACIENTE_NOME_MAX = 200;

/** Só os dígitos de um texto (`052.228.731-02` → `05222873102`). */
function digitos(valor: string): string {
  return valor.replaceAll(/\D/g, '');
}

/** CPF válido: 11 dígitos, não todos iguais, com os dois dígitos verificadores corretos. */
export function cpfValido(valor: string): boolean {
  const cpf = digitos(valor);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  return [9, 10].every((tamanho) => {
    const soma = [...cpf.slice(0, tamanho)].reduce(
      (total, d, i) => total + Number(d) * (tamanho + 1 - i),
      0,
    );
    const resto = (soma * 10) % 11;
    return (resto === 10 ? 0 : resto) === Number(cpf[tamanho]);
  });
}

/** CNPJ válido: 14 dígitos, não todos iguais, com os dois dígitos verificadores corretos. */
export function cnpjValido(valor: string): boolean {
  const cnpj = digitos(valor);
  if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false;
  return [12, 13].every((tamanho) => {
    const pesos =
      tamanho === 12
        ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
        : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const soma = [...cnpj.slice(0, tamanho)].reduce(
      (total, d, i) => total + Number(d) * (pesos[i] ?? 0),
      0,
    );
    const resto = soma % 11;
    return (resto < 2 ? 0 : 11 - resto) === Number(cnpj[tamanho]);
  });
}

/** Texto opcional: vazio, `null` ou ausente viram `null`. */
function textoOpcional(max: number, rotulo: string) {
  return z
    .string({ error: `${rotulo} inválido` })
    .trim()
    .max(max, { error: `${rotulo} deve ter no máximo ${max} caracteres` })
    .nullish()
    .transform((valor) => valor || null);
}

/** Campo só de dígitos (telefone, CEP…): aceita máscara e guarda só os dígitos. */
function digitosOpcional(rotulo: string, tamanhos: readonly number[]) {
  return z
    .string({ error: `${rotulo} inválido` })
    .nullish()
    .transform((valor) => (valor ? digitos(valor) : null))
    .refine((valor) => valor === null || tamanhos.includes(valor.length), {
      error: `${rotulo} inválido`,
    });
}

const dataOpcional = (rotulo: string) =>
  z
    .union([z.literal(''), z.iso.date({ error: `${rotulo} inválida` })])
    .nullish()
    .transform((valor) => valor || null);

/** Id opcional: vazio, `null` ou ausente viram `null`. */
const idOpcional = (mensagem: string) =>
  z
    .union([z.literal(''), z.uuid({ error: mensagem })])
    .nullish()
    .transform((valor) => valor || null);

/** Enum opcional: vazio, `null` ou ausente viram `null`. */
function enumOpcional<T extends z.ZodType<string>>(schema: T) {
  return z
    .union([z.literal(''), schema])
    .nullish()
    .transform((valor) => valor || null);
}

const nome = z
  .string({ error: 'O nome do paciente é obrigatório.' })
  .trim()
  .min(1, { error: 'O nome do paciente é obrigatório.' })
  .max(PACIENTE_NOME_MAX, { error: `O nome deve ter no máximo ${PACIENTE_NOME_MAX} caracteres` });

/**
 * Corpo de `POST` e `PATCH /api/comercial-atendimento/pacientes`. O `PATCH` substitui todos os
 * campos (o modal Editar envia o formulário inteiro). Só o nome é obrigatório (inventário e
 * comentário do card). Os campos do outro tipo de pessoa são descartados: PF não guarda
 * razão social etc., PJ não guarda RG, sexo etc.
 */
export const pacienteInputSchema = z
  .strictObject({
    tipo: pacienteTipoSchema.default('PF'),
    nome,
    nomeSocial: textoOpcional(PACIENTE_NOME_MAX, 'Nome social'),
    email: z
      .union([z.literal(''), z.email({ error: 'Email inválido' })])
      .nullish()
      .transform((valor) => valor || null),
    /** CPF (PF) ou CNPJ (PJ), conforme o `tipo`. */
    documento: digitosOpcional('Documento', [11, 14]),
    rg: textoOpcional(30, 'RG'),
    menorIdade: z.boolean().default(false),
    telefone: digitosOpcional('Telefone', [10, 11]),
    celular: digitosOpcional('Celular', [10, 11]),
    /** Data de nascimento (PF) ou de fundação (PJ). */
    dataNascimento: dataOpcional('Data'),
    sexo: z
      .union([z.literal(''), pacienteSexoSchema])
      .nullish()
      .transform((valor) => valor || null),
    profissao: textoOpcional(100, 'Profissão'),
    origemClienteId: z
      .union([z.literal(''), z.uuid({ error: 'Origem inválida' })])
      .nullish()
      .transform((valor) => valor || null),
    status: pacienteStatusSchema.default('ATIVO'),
    observacoes: textoOpcional(2000, 'Observações'),
    /**
     * Atalho do consentimento de campanhas (LGPD): quando muda, grava um registro de
     * consentimento. Ausente = não altera. O histórico completo vem de `/consentimentos`.
     */
    aceitaCampanhasWhatsapp: z.boolean().optional(),
    /** Consentimentos informados no cadastro: cada um vira um registro com data e autor. */
    consentimentos: z.array(createConsentimentoSchema).max(3).optional(),
    canalOrigem: enumOpcional(pacienteCanalOrigemSchema),
    /** WhatsApp, quando diferente do celular. */
    whatsapp: digitosOpcional('WhatsApp', [10, 11]),
    preferenciaComunicacao: enumOpcional(pacientePreferenciaComunicacaoSchema),
    indicacaoTipo: enumOpcional(pacienteIndicacaoTipoSchema),
    /** Paciente ou profissional que indicou, conforme `indicacaoTipo`. */
    indicacaoReferenciaId: idOpcional('Quem indicou é inválido'),
    /** Texto livre de quem indicou (`indicacaoTipo = TEXTO`). */
    indicacaoTexto: textoOpcional(PACIENTE_NOME_MAX, 'Quem indicou'),
    /** Profissional e especialidade principais do paciente. */
    profissionalVinculoId: idOpcional('Profissional inválido'),
    especialidadeVinculoId: idOpcional('Especialidade inválida'),
    razaoSocial: textoOpcional(200, 'Razão social'),
    nomeFantasia: textoOpcional(200, 'Nome fantasia'),
    inscricaoEstadual: textoOpcional(30, 'Inscrição estadual'),
    representanteNome: textoOpcional(PACIENTE_NOME_MAX, 'Nome do representante'),
    representanteCelular: digitosOpcional('Celular do representante', [10, 11]),
    cep: digitosOpcional('CEP', [8]),
    logradouro: textoOpcional(200, 'Logradouro'),
    numero: textoOpcional(20, 'Número'),
    complemento: textoOpcional(100, 'Complemento'),
    bairro: textoOpcional(100, 'Bairro'),
    cidade: textoOpcional(100, 'Cidade'),
    uf: z
      .string({ error: 'UF inválida' })
      .trim()
      .toUpperCase()
      .nullish()
      .transform((valor) => valor || null)
      .refine((valor) => valor === null || /^[A-Z]{2}$/.test(valor), { error: 'UF inválida' }),
    /**
     * O usuário viu o alerta de possível duplicado (issue #149) e escolheu continuar. Não é gravado
     * no paciente: vira um registro de auditoria.
     */
    duplicidadeConfirmada: z.boolean().optional(),
    codigoIbge: z
      .string({ error: 'Código IBGE inválido' })
      .trim()
      .nullish()
      .transform((valor) => valor || null)
      .refine((valor) => valor === null || /^\d{7}$/.test(valor), {
        error: 'Código IBGE inválido',
      }),
  })
  .superRefine((dados, ctx) => {
    if (dados.documento) {
      const pf = dados.tipo === 'PF';
      if (pf ? !cpfValido(dados.documento) : !cnpjValido(dados.documento)) {
        ctx.addIssue({
          code: 'custom',
          path: ['documento'],
          message: pf ? 'CPF inválido' : 'CNPJ inválido',
        });
      }
    }
    if (dados.indicacaoTipo === 'TEXTO' && !dados.indicacaoTexto) {
      ctx.addIssue({
        code: 'custom',
        path: ['indicacaoTexto'],
        message: mensagemObrigatoria('Quem indicou'),
      });
    } else if (
      (dados.indicacaoTipo === 'PACIENTE' || dados.indicacaoTipo === 'PROFISSIONAL') &&
      !dados.indicacaoReferenciaId
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['indicacaoReferenciaId'],
        message: mensagemObrigatoria('Quem indicou'),
      });
    }
  })
  .transform((dados) => {
    // Só o dado do tipo escolhido fica: trocar de PACIENTE para TEXTO não deixa o id antigo.
    const texto = dados.indicacaoTipo === 'TEXTO';
    const indicacao = {
      indicacaoReferenciaId: dados.indicacaoTipo && !texto ? dados.indicacaoReferenciaId : null,
      indicacaoTexto: texto ? dados.indicacaoTexto : null,
    };
    return dados.tipo === 'PF'
      ? {
          ...dados,
          ...indicacao,
          razaoSocial: null,
          nomeFantasia: null,
          inscricaoEstadual: null,
          representanteNome: null,
          representanteCelular: null,
        }
      : { ...dados, ...indicacao, rg: null, sexo: null, menorIdade: false };
  });

export type PacienteInput = z.input<typeof pacienteInputSchema>;
export type CreatePacienteInput = z.output<typeof pacienteInputSchema>;
export type UpdatePacienteInput = CreatePacienteInput;
export const createPacienteSchema = pacienteInputSchema;
export const updatePacienteSchema = pacienteInputSchema;

export const PACIENTE_SORT_FIELDS = ['nome', 'telefone', 'email', 'origem', 'status'] as const;

/** `GET /api/comercial-atendimento/pacientes`. */
export const listPacientesQuerySchema = listQuerySchema({
  sortFields: PACIENTE_SORT_FIELDS,
  defaultSort: 'nome:asc',
  filters: {
    status: pacienteStatusSchema.optional(),
    origemClienteId: z.uuid().optional(),
    canalOrigem: pacienteCanalOrigemSchema.optional(),
    /** Com ao menos um atendimento, o último há mais de N dias e nada agendado à frente. */
    semRetornoDias: z.coerce.number().int().min(1).max(3650).optional(),
    /** Só quem tem ao menos uma falta. */
    comFaltas: z
      .enum(['true', 'false'])
      .transform((valor) => valor === 'true')
      .optional(),
    /** Pacientes cadastrados no período (dias inteiros, no fuso da clínica). */
    novosDe: z.iso.date().optional(),
    novosAte: z.iso.date().optional(),
  },
});

export type ListPacientesQuery = z.infer<typeof listPacientesQuerySchema>;

export const PACIENTE_EXPORT_COLUMNS = [
  'nome',
  'documento',
  'telefone',
  'email',
  'origem',
  'status',
] as const;
export type PacienteExportColumn = (typeof PACIENTE_EXPORT_COLUMNS)[number];

/** `GET /api/comercial-atendimento/pacientes/export`. */
export const exportPacientesQuerySchema = exportQuerySchema(
  listPacientesQuerySchema,
  PACIENTE_EXPORT_COLUMNS,
);

export type ExportPacientesQuery = z.infer<typeof exportPacientesQuerySchema>;

const nullableText = z.string().nullable();

export const pacienteSchema = z.object({
  id: z.uuid(),
  tipo: pacienteTipoSchema,
  nome: z.string(),
  nomeSocial: nullableText,
  email: nullableText,
  documento: nullableText,
  rg: nullableText,
  menorIdade: z.boolean(),
  telefone: nullableText,
  celular: nullableText,
  dataNascimento: z.iso.date().nullable(),
  sexo: pacienteSexoSchema.nullable(),
  profissao: nullableText,
  origemClienteId: z.uuid().nullable(),
  /** Nome da origem, para o grid e o detalhe. */
  origemNome: nullableText,
  status: pacienteStatusSchema,
  observacoes: nullableText,
  /** Consentimento vigente de campanhas (derivado do histórico de consentimentos). */
  aceitaCampanhasWhatsapp: z.boolean(),
  /** Consentimento vigente de comunicação (confirmações, lembretes, pesquisas). */
  aceitaComunicacao: z.boolean(),
  canalOrigem: pacienteCanalOrigemSchema.nullable(),
  whatsapp: nullableText,
  preferenciaComunicacao: pacientePreferenciaComunicacaoSchema.nullable(),
  indicacaoTipo: pacienteIndicacaoTipoSchema.nullable(),
  indicacaoReferenciaId: z.uuid().nullable(),
  indicacaoTexto: nullableText,
  /** Nome de quem indicou (paciente, profissional ou o texto livre), para a tela. */
  indicacaoNome: nullableText,
  profissionalVinculoId: z.uuid().nullable(),
  profissionalVinculoNome: nullableText,
  especialidadeVinculoId: z.uuid().nullable(),
  especialidadeVinculoNome: nullableText,
  razaoSocial: nullableText,
  nomeFantasia: nullableText,
  inscricaoEstadual: nullableText,
  representanteNome: nullableText,
  representanteCelular: nullableText,
  cep: nullableText,
  logradouro: nullableText,
  numero: nullableText,
  complemento: nullableText,
  bairro: nullableText,
  cidade: nullableText,
  uf: nullableText,
  codigoIbge: nullableText,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type Paciente = z.infer<typeof pacienteSchema>;

/**
 * Cadastro com os dados de relacionamento calculados (somente leitura), vindos dos
 * agendamentos: listagem e detalhe da tela. As respostas de escrita trazem só o cadastro.
 */
export const pacienteResumoSchema = pacienteSchema.extend({
  /** Primeiro atendimento realizado (`ATENDIDO`). */
  primeiroAtendimento: z.iso.datetime().nullable(),
  ultimoAtendimento: z.iso.datetime().nullable(),
  /** Próximo agendamento ainda por acontecer (sem cancelados, faltas e reagendar). */
  proximoRetorno: z.iso.datetime().nullable(),
  /** Agendamentos com status `FALTOU`. */
  faltas: z.number().int().nonnegative(),
});

export type PacienteResumo = z.infer<typeof pacienteResumoSchema>;

export const pacientePageSchema = paginatedResponseSchema(pacienteResumoSchema);

export type PacientePage = z.infer<typeof pacientePageSchema>;
