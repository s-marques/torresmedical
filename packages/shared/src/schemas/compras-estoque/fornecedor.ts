import { z } from 'zod';
import { cnpjValido, cpfValido } from '../comercial-atendimento/paciente';
import { ativoStatusSchema, exportQuerySchema, listQuerySchema } from '../common/list-query';
import { textoObrigatorio } from '../common/obrigatorio';
import { paginatedResponseSchema } from '../common/pagination';

export const FORNECEDOR_NOME_MAX = 200;

/** Siglas do combobox UF do modal (as 27 unidades da federação). */
export const FORNECEDOR_UFS = [
  'AC',
  'AL',
  'AP',
  'AM',
  'BA',
  'CE',
  'DF',
  'ES',
  'GO',
  'MA',
  'MT',
  'MS',
  'MG',
  'PA',
  'PB',
  'PR',
  'PE',
  'PI',
  'RJ',
  'RN',
  'RS',
  'RO',
  'RR',
  'SC',
  'SP',
  'SE',
  'TO',
] as const;

/** Texto opcional: vazio vira `null`. */
const textoOpcional = (max: number, rotulo: string) =>
  z
    .string({ error: `${rotulo} inválido` })
    .trim()
    .max(max, { error: `${rotulo} deve ter no máximo ${max} caracteres` })
    .nullish()
    .transform((valor) => valor || null);

/** Campo só de dígitos (telefone, CEP…): aceita máscara e guarda só os dígitos. */
const digitosOpcional = (rotulo: string, tamanhos: readonly number[]) =>
  z
    .string({ error: `${rotulo} inválido` })
    .nullish()
    .transform((valor) => (valor ? valor.replaceAll(/\D/g, '') : null))
    .refine((valor) => valor === null || tamanhos.includes(valor.length), {
      error: `${rotulo} inválido`,
    });

/** Combobox UF: vazio ("Selecione") vira `null`. */
const uf = z
  .union([z.literal(''), z.enum(FORNECEDOR_UFS, { error: 'UF inválida' })])
  .nullish()
  .transform((valor) => valor || null);

/**
 * Corpo de `POST` e `PATCH /api/compras-estoque/fornecedores`. O `PATCH` substitui todos os
 * campos (o modal Editar envia o formulário inteiro). Só o Nome / Razão Social é obrigatório
 * (inventário e confirmação do dev na issue #21). O documento, quando preenchido, é CPF
 * (11 dígitos) ou CNPJ (14) válido.
 */
export const fornecedorInputSchema = z
  .strictObject({
    nome: textoObrigatorio('Nome / Razão Social', { max: FORNECEDOR_NOME_MAX }),
    nomeFantasia: textoOpcional(FORNECEDOR_NOME_MAX, 'Nome Fantasia'),
    documento: digitosOpcional('CNPJ/CPF', [11, 14]),
    email: z
      .union([z.literal(''), z.email({ error: 'Email inválido' })])
      .nullish()
      .transform((valor) => valor || null),
    contato: textoOpcional(120, 'Pessoa de Contato'),
    telefone: digitosOpcional('Telefone', [10, 11]),
    celular: digitosOpcional('Celular', [10, 11]),
    cep: digitosOpcional('CEP', [8]),
    logradouro: textoOpcional(200, 'Logradouro'),
    numero: textoOpcional(20, 'Número'),
    complemento: textoOpcional(100, 'Complemento'),
    bairro: textoOpcional(100, 'Bairro'),
    cidade: textoOpcional(100, 'Cidade'),
    uf,
    status: ativoStatusSchema.default('ativo'),
    observacoes: textoOpcional(2000, 'Observações'),
  })
  .superRefine((dados, ctx) => {
    const { documento } = dados;
    // Tamanho errado já foi apontado pelo campo.
    if (documento?.length !== 11 && documento?.length !== 14) return;
    const cpf = documento.length === 11;
    if (!(cpf ? cpfValido(documento) : cnpjValido(documento))) {
      ctx.addIssue({
        code: 'custom',
        path: ['documento'],
        message: cpf ? 'CPF inválido' : 'CNPJ inválido',
      });
    }
  });

export type FornecedorFormInput = z.input<typeof fornecedorInputSchema>;
export type CreateFornecedorInput = z.output<typeof fornecedorInputSchema>;
export type UpdateFornecedorInput = CreateFornecedorInput;
export const createFornecedorSchema = fornecedorInputSchema;
export const updateFornecedorSchema = fornecedorInputSchema;

export const FORNECEDOR_SORT_FIELDS = [
  'nome',
  'documento',
  'email',
  'telefone',
  'cidade',
  'status',
] as const;

/** `GET /api/compras-estoque/fornecedores`. Os chips Todos/Ativo/Inativo são o filtro `status`. */
export const listFornecedoresQuerySchema = listQuerySchema({
  sortFields: FORNECEDOR_SORT_FIELDS,
  defaultSort: 'nome:asc',
  filters: { status: ativoStatusSchema.optional() },
});

export type ListFornecedoresQuery = z.infer<typeof listFornecedoresQuerySchema>;

export const FORNECEDOR_EXPORT_COLUMNS = [
  'nome',
  'documento',
  'email',
  'telefone',
  'cidade',
  'status',
] as const;
export type FornecedorExportColumn = (typeof FORNECEDOR_EXPORT_COLUMNS)[number];

/** `GET /api/compras-estoque/fornecedores/export`. */
export const exportFornecedoresQuerySchema = exportQuerySchema(
  listFornecedoresQuerySchema,
  FORNECEDOR_EXPORT_COLUMNS,
);

export type ExportFornecedoresQuery = z.infer<typeof exportFornecedoresQuerySchema>;

const texto = z.string().nullable();

export const fornecedorSchema = z.object({
  id: z.uuid(),
  nome: z.string(),
  nomeFantasia: texto,
  /** CNPJ ou CPF, somente dígitos. */
  documento: texto,
  email: texto,
  contato: texto,
  telefone: texto,
  celular: texto,
  cep: texto,
  logradouro: texto,
  numero: texto,
  complemento: texto,
  bairro: texto,
  cidade: texto,
  uf: texto,
  ativo: z.boolean(),
  observacoes: texto,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type Fornecedor = z.infer<typeof fornecedorSchema>;

export const fornecedorPageSchema = paginatedResponseSchema(fornecedorSchema);

export type FornecedorPage = z.infer<typeof fornecedorPageSchema>;
