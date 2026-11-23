import { z } from 'zod';
import { exportQuerySchema, listQuerySchema } from '../common/list-query';
import { paginatedResponseSchema } from '../common/pagination';
import { cnpjValido, cpfValido } from '../comercial-atendimento/paciente';
import { textoObrigatorio } from '../common/obrigatorio';

export const PROFISSIONAL_NOME_MAX = 200;
export const PROFISSIONAL_DURACAO_PADRAO = 30;
export const PROFISSIONAL_DURACAO_MAX = 1440;
export const PROFISSIONAL_COR_PADRAO = 'azul';

/** Cores do calendário. O rótulo é o do seletor "Cor no calendário"; `hex` pinta o círculo. */
export const PROFISSIONAL_CORES = {
  azul: { rotulo: 'Azul', hex: '#3b82f6' },
  rosa: { rotulo: 'Rosa', hex: '#ec4899' },
  verde: { rotulo: 'Verde', hex: '#22c55e' },
  vermelho: { rotulo: 'Vermelho', hex: '#ef4444' },
  laranja: { rotulo: 'Laranja', hex: '#f97316' },
  amarelo: { rotulo: 'Amarelo', hex: '#eab308' },
  roxo: { rotulo: 'Roxo', hex: '#a855f7' },
  turquesa: { rotulo: 'Turquesa', hex: '#14b8a6' },
  cinza: { rotulo: 'Cinza', hex: '#6b7280' },
} as const;

export type ProfissionalCor = keyof typeof PROFISSIONAL_CORES;
export const PROFISSIONAL_COR_KEYS = Object.keys(PROFISSIONAL_CORES) as [
  ProfissionalCor,
  ...ProfissionalCor[],
];
export const profissionalCorSchema = z.enum(PROFISSIONAL_COR_KEYS, { error: 'Cor inválida' });

export const PROFISSIONAL_ESTADOS_CIVIS = [
  'SOLTEIRO',
  'CASADO',
  'DIVORCIADO',
  'VIUVO',
  'UNIAO_ESTAVEL',
] as const;
export const profissionalEstadoCivilSchema = z.enum(PROFISSIONAL_ESTADOS_CIVIS, {
  error: 'Estado civil inválido',
});
export type ProfissionalEstadoCivil = z.infer<typeof profissionalEstadoCivilSchema>;

export const PROFISSIONAL_ESTADO_CIVIL_ROTULOS: Record<ProfissionalEstadoCivil, string> = {
  SOLTEIRO: 'Solteiro(a)',
  CASADO: 'Casado(a)',
  DIVORCIADO: 'Divorciado(a)',
  VIUVO: 'Viúvo(a)',
  UNIAO_ESTAVEL: 'União estável',
};

/** Rótulos do select "Layout da Receita" (inventário). */
export const PROFISSIONAL_LAYOUTS_RECEITA = [
  'PADRAO',
  'COMPACTO',
  'TIMBRADO',
  'PERSONALIZADO',
] as const;
export const profissionalLayoutReceitaSchema = z.enum(PROFISSIONAL_LAYOUTS_RECEITA, {
  error: 'Layout inválido',
});
export type ProfissionalLayoutReceita = z.infer<typeof profissionalLayoutReceitaSchema>;

export const PROFISSIONAL_LAYOUT_RECEITA_ROTULOS: Record<ProfissionalLayoutReceita, string> = {
  PADRAO: 'Padrao — Logo centralizada grande + barra azul',
  COMPACTO: 'Compacto — Logo pequena esquerda + nome/CRM direita',
  TIMBRADO: 'Timbrado — Sem logo, nome/CRM centralizado',
  PERSONALIZADO: 'Personalizado — Upload de cabecalho e rodape',
};

/** Profissão do cadastro (issue #140, requisito R §38). */
export const PROFISSIONAL_PROFISSOES = [
  'MEDICO',
  'PSICOLOGO',
  'NUTRICIONISTA',
  'FISIOTERAPEUTA',
  'BIOMEDICO',
  'OUTRA',
] as const;
export const profissionalProfissaoSchema = z.enum(PROFISSIONAL_PROFISSOES, {
  error: 'Profissão inválida',
});
export type ProfissionalProfissao = z.infer<typeof profissionalProfissaoSchema>;

export const PROFISSIONAL_PROFISSAO_ROTULOS: Record<ProfissionalProfissao, string> = {
  MEDICO: 'Médico(a)',
  PSICOLOGO: 'Psicólogo(a)',
  NUTRICIONISTA: 'Nutricionista',
  FISIOTERAPEUTA: 'Fisioterapeuta',
  BIOMEDICO: 'Biomédico(a)',
  OUTRA: 'Outra',
};

export const PROFISSIONAL_RQES_MAX = 10;
export const PROFISSIONAL_CONTATOS_MAX = 10;

function digitos(valor: string): string {
  return valor.replaceAll(/\D/g, '');
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

function telefoneOpcional(rotulo: string) {
  return z
    .string({ error: `${rotulo} inválido` })
    .nullish()
    .transform((valor) => (valor ? digitos(valor) : null))
    .refine((valor) => valor === null || valor.length === 10 || valor.length === 11, {
      error: `${rotulo} inválido`,
    });
}

const idOpcional = (rotulo: string) =>
  z
    .union([z.literal(''), z.uuid({ error: `${rotulo} inválido` })])
    .nullish()
    .transform((valor) => valor || null);

const numeroOpcional = (rotulo: string, min: number, max: number, mensagemMax: string) =>
  z
    .number({ error: `${rotulo} inválido` })
    .min(min, { error: `${rotulo} não pode ser negativo` })
    .max(max, { error: mensagemMax })
    .nullish()
    .transform((valor) => valor ?? null);

/** RQE (Registro de Qualificação de Especialista): um número por especialidade. */
export const profissionalRqeInputSchema = z.strictObject({
  numero: textoObrigatorio('Número do RQE', { max: 20 }),
  especialidadeId: z.uuid({ error: 'Especialidade do RQE inválida' }),
});
export type ProfissionalRqeInput = z.input<typeof profissionalRqeInputSchema>;

/** Contato administrativo (secretária, financeiro…): nome, função e telefone ou e-mail. */
export const profissionalContatoInputSchema = z
  .strictObject({
    nome: textoObrigatorio('Nome do contato', { max: 150 }),
    funcao: textoObrigatorio('Função do contato', { genero: 'f', max: 100 }),
    telefone: telefoneOpcional('Telefone do contato'),
    email: z
      .union([z.literal(''), z.email({ error: 'Email do contato inválido' })])
      .nullish()
      .transform((valor) => valor || null),
  })
  .refine((contato) => contato.telefone !== null || contato.email !== null, {
    error: 'Informe o telefone ou o e-mail do contato',
    path: ['telefone'],
  });
export type ProfissionalContatoInput = z.input<typeof profissionalContatoInputSchema>;

const nome = z
  .string({ error: 'O nome do profissional é obrigatório.' })
  .trim()
  .min(1, { error: 'O nome do profissional é obrigatório.' })
  .max(PROFISSIONAL_NOME_MAX, {
    error: `O nome deve ter no máximo ${PROFISSIONAL_NOME_MAX} caracteres`,
  });

/**
 * Corpo de `POST` e `PATCH /api/gestao-profissionais/profissionais`. O `PATCH` substitui os
 * campos do formulário. `memedSecretKey` em branco mantém a chave já gravada (ela nunca volta
 * da API). Foto e logo são enviados depois do cadastro ("Salve primeiro" no modal).
 */
export const profissionalInputSchema = z
  .strictObject({
    nome,
    profissao: z
      .union([z.literal(''), profissionalProfissaoSchema], { error: 'Profissão inválida' })
      .nullish()
      .transform((valor) => valor || null),
    subespecialidade: textoOpcional(150, 'Subespecialidade'),
    cnpj: z
      .string({ error: 'CNPJ inválido' })
      .nullish()
      .transform((valor) => (valor ? digitos(valor) : null))
      .refine((valor) => valor === null || cnpjValido(valor), { error: 'CNPJ inválido' }),
    rqes: z
      .array(profissionalRqeInputSchema, { error: 'RQEs inválidos' })
      .max(PROFISSIONAL_RQES_MAX, { error: `Informe no máximo ${PROFISSIONAL_RQES_MAX} RQEs` })
      .default([]),
    contatosAdministrativos: z
      .array(profissionalContatoInputSchema, { error: 'Contatos inválidos' })
      .max(PROFISSIONAL_CONTATOS_MAX, {
        error: `Informe no máximo ${PROFISSIONAL_CONTATOS_MAX} contatos`,
      })
      .default([]),
    especialidadeId: idOpcional('Especialidade'),
    registro: textoOpcional(50, 'Registro'),
    outrasEspecialidades: textoOpcional(300, 'Outras especialidades'),
    email: z
      .union([z.literal(''), z.email({ error: 'Email inválido' })])
      .nullish()
      .transform((valor) => valor || null),
    telefone: telefoneOpcional('Telefone'),
    duracaoPadrao: z
      .number({ error: 'Informe a duração em minutos' })
      .int({ error: 'A duração deve ser um número inteiro de minutos' })
      .min(1, { error: 'A duração deve ser de pelo menos 1 minuto' })
      .max(PROFISSIONAL_DURACAO_MAX, {
        error: `A duração deve ser de no máximo ${PROFISSIONAL_DURACAO_MAX} minutos`,
      })
      .default(PROFISSIONAL_DURACAO_PADRAO),
    valorConsulta: numeroOpcional(
      'Valor da consulta',
      0,
      9_999_999.99,
      'Valor da consulta inválido',
    ),
    comissao: numeroOpcional('Comissão', 0, 100, 'A comissão deve ser de no máximo 100%'),
    corCalendario: profissionalCorSchema.default(PROFISSIONAL_COR_PADRAO),
    cpf: z
      .string({ error: 'CPF inválido' })
      .nullish()
      .transform((valor) => (valor ? digitos(valor) : null))
      .refine((valor) => valor === null || cpfValido(valor), { error: 'CPF inválido' }),
    rg: textoOpcional(30, 'RG'),
    dataNascimento: z
      .union([z.literal(''), z.iso.date({ error: 'Data inválida' })])
      .nullish()
      .transform((valor) => valor || null),
    naturalidade: textoOpcional(100, 'Naturalidade'),
    estadoCivil: z
      .union([z.literal(''), profissionalEstadoCivilSchema])
      .nullish()
      .transform((valor) => valor || null),
    endereco: textoOpcional(300, 'Endereço'),
    enderecoConsultorio: textoOpcional(300, 'Endereço do consultório'),
    telefoneReceita: telefoneOpcional('Telefone para receita'),
    cnes: textoOpcional(20, 'CNES'),
    rodapeReceita: textoOpcional(500, 'Rodapé da receita'),
    layoutReceita: profissionalLayoutReceitaSchema.default('PADRAO'),
    memedApiToken: textoOpcional(200, 'API Token'),
    memedSecretKey: z
      .string({ error: 'Secret Key inválida' })
      .trim()
      .max(200, { error: 'Secret Key deve ter no máximo 200 caracteres' })
      .nullish()
      .transform((valor) => valor || null),
  })
  .refine(({ rqes }) => new Set(rqes.map((r) => r.especialidadeId)).size === rqes.length, {
    error: 'Há mais de um RQE para a mesma especialidade',
    path: ['rqes'],
  });

export type ProfissionalInput = z.input<typeof profissionalInputSchema>;
export type CreateProfissionalInput = z.output<typeof profissionalInputSchema>;
export type UpdateProfissionalInput = CreateProfissionalInput;
export const createProfissionalSchema = profissionalInputSchema;
export const updateProfissionalSchema = profissionalInputSchema;

/** `PATCH /api/gestao-profissionais/profissionais/:id/status`: Ativar / Desativar do menu da linha. */
export const profissionalStatusSchema = z.strictObject({
  ativo: z.boolean({ error: 'Informe se o profissional fica ativo' }),
});
export type ProfissionalStatusInput = z.infer<typeof profissionalStatusSchema>;

export const PROFISSIONAL_STATUS = ['ativo', 'inativo'] as const;
export const profissionalStatusFiltroSchema = z.enum(PROFISSIONAL_STATUS);

export const PROFISSIONAL_SORT_FIELDS = [
  'nome',
  'registro',
  'telefone',
  'email',
  'duracaoPadrao',
  'valorConsulta',
  'ativo',
] as const;

/** `GET /api/gestao-profissionais/profissionais`. */
export const listProfissionaisQuerySchema = listQuerySchema({
  sortFields: PROFISSIONAL_SORT_FIELDS,
  defaultSort: 'nome:asc',
  filters: { status: profissionalStatusFiltroSchema.optional() },
});

export type ListProfissionaisQuery = z.infer<typeof listProfissionaisQuerySchema>;

export const PROFISSIONAL_EXPORT_COLUMNS = [
  'nome',
  'registro',
  'telefone',
  'email',
  'duracaoPadrao',
  'valorConsulta',
  'ativo',
] as const;
export type ProfissionalExportColumn = (typeof PROFISSIONAL_EXPORT_COLUMNS)[number];

/** `GET /api/gestao-profissionais/profissionais/export`. */
export const exportProfissionaisQuerySchema = exportQuerySchema(
  listProfissionaisQuerySchema,
  PROFISSIONAL_EXPORT_COLUMNS,
);

export type ExportProfissionaisQuery = z.infer<typeof exportProfissionaisQuerySchema>;

const nullableText = z.string().nullable();

export const profissionalRqeSchema = z.object({
  id: z.uuid(),
  numero: z.string(),
  especialidadeId: z.uuid(),
  especialidadeNome: z.string(),
});
export type ProfissionalRqe = z.infer<typeof profissionalRqeSchema>;

export const profissionalContatoSchema = z.object({
  id: z.uuid(),
  nome: z.string(),
  funcao: z.string(),
  telefone: nullableText,
  email: nullableText,
});
export type ProfissionalContato = z.infer<typeof profissionalContatoSchema>;

export const profissionalSchema = z.object({
  id: z.uuid(),
  nome: z.string(),
  especialidadeId: z.uuid().nullable(),
  /** Nome da especialidade, para o detalhe. */
  especialidadeNome: nullableText,
  registro: nullableText,
  profissao: profissionalProfissaoSchema.nullable(),
  subespecialidade: nullableText,
  cnpj: nullableText,
  rqes: z.array(profissionalRqeSchema),
  contatosAdministrativos: z.array(profissionalContatoSchema),
  outrasEspecialidades: nullableText,
  email: nullableText,
  telefone: nullableText,
  duracaoPadrao: z.number().int(),
  valorConsulta: z.number().nullable(),
  comissao: z.number().nullable(),
  corCalendario: profissionalCorSchema,
  cpf: nullableText,
  rg: nullableText,
  dataNascimento: z.iso.date().nullable(),
  naturalidade: nullableText,
  estadoCivil: profissionalEstadoCivilSchema.nullable(),
  endereco: nullableText,
  enderecoConsultorio: nullableText,
  telefoneReceita: nullableText,
  cnes: nullableText,
  rodapeReceita: nullableText,
  layoutReceita: profissionalLayoutReceitaSchema,
  /** A Secret Key nunca é devolvida: o formulário só sabe se há uma gravada. */
  memedApiToken: nullableText,
  memedSecretKeyDefinida: z.boolean(),
  fotoArquivoId: z.uuid().nullable(),
  logoReceitaArquivoId: z.uuid().nullable(),
  ativo: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type Profissional = z.infer<typeof profissionalSchema>;

export const profissionalPageSchema = paginatedResponseSchema(profissionalSchema);

export type ProfissionalPage = z.infer<typeof profissionalPageSchema>;

/** `PUT /api/gestao-profissionais/profissionais/:id/arquivos/:campo` (foto e logo da receita, já enviados em `/api/arquivos`). */
export const PROFISSIONAL_ARQUIVO_CAMPOS = ['foto', 'logo-receita'] as const;
export const profissionalArquivoCampoSchema = z.enum(PROFISSIONAL_ARQUIVO_CAMPOS);
export type ProfissionalArquivoCampo = z.infer<typeof profissionalArquivoCampoSchema>;

export const profissionalArquivoInputSchema = z.strictObject({
  arquivoId: z.uuid({ error: 'Arquivo inválido' }).nullable(),
});
export type ProfissionalArquivoInput = z.infer<typeof profissionalArquivoInputSchema>;
