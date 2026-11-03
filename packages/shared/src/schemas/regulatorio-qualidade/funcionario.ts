import { z } from 'zod';
import { cpfValido } from '../comercial-atendimento/paciente';
import { ativoStatusSchema, exportQuerySchema, listQuerySchema } from '../common/list-query';
import { textoObrigatorio } from '../common/obrigatorio';
import { paginatedResponseSchema } from '../common/pagination';

export const FUNCIONARIO_NOME_MAX = 200;

/**
 * Opções do combobox "Tipo de Contrato" do modal (print do dev mostra "CLT" selecionado).
 * Demais tipos comuns de contratação no Brasil: inferência da IA, sem confirmação do dev.
 */
export const FUNCIONARIO_TIPOS_CONTRATO = [
  'CLT',
  'PJ',
  'ESTAGIO',
  'TEMPORARIO',
  'AUTONOMO',
] as const;

export const FUNCIONARIO_TIPO_CONTRATO_ROTULOS: Record<
  (typeof FUNCIONARIO_TIPOS_CONTRATO)[number],
  string
> = {
  CLT: 'CLT',
  PJ: 'PJ',
  ESTAGIO: 'Estágio',
  TEMPORARIO: 'Temporário',
  AUTONOMO: 'Autônomo',
};

const textoOpcional = (max: number, rotulo: string) =>
  z
    .string({ error: `${rotulo} inválido` })
    .trim()
    .max(max, { error: `${rotulo} deve ter no máximo ${max} caracteres` })
    .nullish()
    .transform((valor) => valor || null);

const digitosOpcional = (rotulo: string, tamanhos: readonly number[]) =>
  z
    .string({ error: `${rotulo} inválido` })
    .nullish()
    .transform((valor) => (valor ? valor.replaceAll(/\D/g, '') : null))
    .refine((valor) => valor === null || tamanhos.includes(valor.length), {
      error: `${rotulo} inválido`,
    });

const dataOpcional = (rotulo: string) =>
  z
    .union([z.literal(''), z.iso.date({ error: `${rotulo} inválida` })])
    .nullish()
    .transform((valor) => valor || null);

/** Combobox "Tipo de Contrato": vazio ("Selecione") vira `null`. */
const tipoContratoOpcional = z
  .union([
    z.literal(''),
    z.enum(FUNCIONARIO_TIPOS_CONTRATO, { error: 'Tipo de Contrato inválido' }),
  ])
  .nullish()
  .transform((valor) => valor || null);

/**
 * Corpo de `POST` e `PATCH /api/regulatorio-qualidade/funcionarios` (modal "Novo Funcionario" /
 * "Editar Funcionario"). Só o Nome é obrigatório (único campo com `*` no print do dev).
 * Departamento não é campo próprio: vem do Cargo selecionado (confirmado pelo dev na issue #67).
 */
export const funcionarioInputSchema = z.strictObject({
  nome: textoObrigatorio('Nome', { max: FUNCIONARIO_NOME_MAX }),
  cpf: digitosOpcional('CPF', [11]).refine((valor) => valor === null || cpfValido(valor), {
    error: 'CPF inválido',
  }),
  rg: textoOpcional(20, 'RG'),
  dataNascimento: dataOpcional('Data de Nascimento'),
  dataAdmissao: dataOpcional('Data de Admissão'),
  telefone: digitosOpcional('Telefone', [10, 11]),
  email: z
    .union([z.literal(''), z.email({ error: 'Email inválido' })])
    .nullish()
    .transform((valor) => valor || null),
  endereco: textoOpcional(200, 'Endereço'),
  cargoId: z.uuid({ error: 'Cargo inválido' }).nullish().default(null),
  salario: z.number().nonnegative({ error: 'Salário inválido' }).nullish(),
  tipoContrato: tipoContratoOpcional,
  cargaHoraria: z.number().int().nonnegative({ error: 'Carga Horária inválida' }).nullish(),
  pis: textoOpcional(20, 'PIS'),
  ctps: textoOpcional(20, 'CTPS'),
  banco: textoOpcional(100, 'Banco'),
  agencia: textoOpcional(20, 'Agência'),
  conta: textoOpcional(20, 'Conta'),
  status: ativoStatusSchema.default('ativo'),
  observacoes: textoOpcional(2000, 'Observações'),
});

export type FuncionarioFormInput = z.input<typeof funcionarioInputSchema>;
export type CreateFuncionarioInput = z.output<typeof funcionarioInputSchema>;
export type UpdateFuncionarioInput = CreateFuncionarioInput;
export const createFuncionarioSchema = funcionarioInputSchema;
export const updateFuncionarioSchema = funcionarioInputSchema;

/**
 * Cargo e Departamento não entram: são lidos por relação (join com Cargo), sem coluna própria
 * para ordenar (mesmo padrão da tela Profissionais/Especialidade).
 */
export const FUNCIONARIO_SORT_FIELDS = [
  'nome',
  'telefone',
  'tipoContrato',
  'salario',
  'status',
] as const;

/** Chip Todos/Ativo/Inativo é o filtro `status`. */
export const listFuncionariosQuerySchema = listQuerySchema({
  sortFields: FUNCIONARIO_SORT_FIELDS,
  defaultSort: 'nome:asc',
  filters: { status: ativoStatusSchema.optional() },
});

export type ListFuncionariosQuery = z.infer<typeof listFuncionariosQuerySchema>;

export const FUNCIONARIO_EXPORT_COLUMNS = [
  'nome',
  'cargo',
  'departamento',
  'telefone',
  'tipoContrato',
  'salario',
  'status',
] as const;
export type FuncionarioExportColumn = (typeof FUNCIONARIO_EXPORT_COLUMNS)[number];

export const exportFuncionariosQuerySchema = exportQuerySchema(
  listFuncionariosQuerySchema,
  FUNCIONARIO_EXPORT_COLUMNS,
);
export type ExportFuncionariosQuery = z.infer<typeof exportFuncionariosQuerySchema>;

const texto = z.string().nullable();

export const funcionarioSchema = z.object({
  id: z.uuid(),
  nome: z.string(),
  cpf: texto,
  rg: texto,
  dataNascimento: texto,
  dataAdmissao: texto,
  telefone: texto,
  email: texto,
  endereco: texto,
  cargoId: z.uuid().nullable(),
  /** Nome do cargo, para a coluna "Cargo" do grid. */
  cargoNome: texto,
  /** Departamento do cargo selecionado, para a coluna "Departamento" do grid. */
  departamento: texto,
  /** Valor decimal exato como texto (ex.: `"8000.00"`), como no banco. */
  salario: texto,
  tipoContrato: z.enum(FUNCIONARIO_TIPOS_CONTRATO).nullable(),
  cargaHoraria: z.number().nullable(),
  pis: texto,
  ctps: texto,
  banco: texto,
  agencia: texto,
  conta: texto,
  ativo: z.boolean(),
  observacoes: texto,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type Funcionario = z.infer<typeof funcionarioSchema>;

export const funcionarioPageSchema = paginatedResponseSchema(funcionarioSchema);
export type FuncionarioPage = z.infer<typeof funcionarioPageSchema>;
// MARCA_TESTE_UNICA
