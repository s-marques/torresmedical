import { z } from 'zod';
import { exportQuerySchema, listQuerySchema } from '../common/list-query';
import { paginatedResponseSchema } from '../common/pagination';

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
    aceitaCampanhasWhatsapp: z.boolean().default(true),
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
    if (!dados.documento) return;
    const pf = dados.tipo === 'PF';
    if (pf ? !cpfValido(dados.documento) : !cnpjValido(dados.documento)) {
      ctx.addIssue({
        code: 'custom',
        path: ['documento'],
        message: pf ? 'CPF inválido' : 'CNPJ inválido',
      });
    }
  })
  .transform((dados) =>
    dados.tipo === 'PF'
      ? {
          ...dados,
          razaoSocial: null,
          nomeFantasia: null,
          inscricaoEstadual: null,
          representanteNome: null,
          representanteCelular: null,
        }
      : { ...dados, rg: null, sexo: null, menorIdade: false },
  );

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
  filters: { status: pacienteStatusSchema.optional() },
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
  aceitaCampanhasWhatsapp: z.boolean(),
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

export const pacientePageSchema = paginatedResponseSchema(pacienteSchema);

export type PacientePage = z.infer<typeof pacientePageSchema>;
