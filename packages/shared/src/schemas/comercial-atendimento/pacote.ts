import { z } from 'zod';
import { exportQuerySchema, listQuerySchema, searchSchema } from '../common/list-query';
import { erroObrigatorio, mensagemObrigatoria, textoObrigatorio } from '../common/obrigatorio';
import { paginatedResponseSchema, paginationQuerySchema } from '../common/pagination';

export const PACOTE_NOME_MAX = 200;
export const PACOTE_TEXTO_MAX = 2000;
export const PACOTE_ITENS_MAX = 100;
export const PACOTE_QUANTIDADE_MAX = 9999;
/** Cabe em DECIMAL(12,2). */
export const PACOTE_VALOR_MAX = 999_999_999;

export const MSG_PACOTE_SEM_ITENS = mensagemObrigatoria('Itens / Procedimentos');

/** Valor do banco (igual ao `audit_log`) para o status gravado. */
export const PACOTE_STATUS_GRAVADO = ['ATIVO', 'CANCELADO'] as const;

/** Status exibido no grid: Finalizado (saldo zerado) e Vencido (passou a data) são calculados. */
export const PACOTE_STATUS = ['ATIVO', 'FINALIZADO', 'VENCIDO', 'CANCELADO'] as const;
export type PacoteStatus = (typeof PACOTE_STATUS)[number];

export const PACOTE_ROTULO_STATUS: Readonly<Record<PacoteStatus, string>> = {
  ATIVO: 'Ativo',
  FINALIZADO: 'Finalizado',
  VENCIDO: 'Vencido',
  CANCELADO: 'Cancelado',
};

/** Chips do grid: Todos (ausente) / Ativo / Finalizado / Vencido / Cancelado. */
export const PACOTE_STATUS_FILTRO = ['ativo', 'finalizado', 'vencido', 'cancelado'] as const;
export const pacoteStatusFiltroSchema = z.enum(PACOTE_STATUS_FILTRO, {
  error: 'Status inválido',
});
export type PacoteStatusFiltro = z.infer<typeof pacoteStatusFiltroSchema>;

/** Status exibido de um pacote já carregado. `hoje` no formato `AAAA-MM-DD`. */
export function statusExibicaoPacote(
  pacote: { gravado: 'ATIVO' | 'CANCELADO'; saldo: number; dataVencimento: string | null },
  hoje: string,
): PacoteStatus {
  if (pacote.gravado === 'CANCELADO') return 'CANCELADO';
  if (pacote.saldo <= 0) return 'FINALIZADO';
  if (pacote.dataVencimento !== null && pacote.dataVencimento < hoje) return 'VENCIDO';
  return 'ATIVO';
}

const dataIso = (mensagem: string) =>
  z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, { error: mensagem })
    .refine((valor) => !Number.isNaN(Date.parse(`${valor}T00:00:00Z`)), { error: mensagem });

const dataOpcional = (mensagem: string) =>
  z
    .union([dataIso(mensagem), z.literal(''), z.null()])
    .optional()
    .transform((valor) => valor || null);

const textoOpcional = (rotulo: string) =>
  z
    .string()
    .trim()
    .max(PACOTE_TEXTO_MAX, {
      error: `${rotulo} deve ter no máximo ${PACOTE_TEXTO_MAX} caracteres`,
    })
    .nullish()
    .transform((valor) => valor || null);

/**
 * Item do pacote: só o produto/procedimento e a quantidade (= número de sessões). Nome e preço
 * unitário são copiados do cadastro pelo servidor.
 */
export const pacoteItemInputSchema = z.strictObject({
  produtoId: z.uuid({ error: 'Item inválido' }),
  quantidade: z
    .number({ error: 'Informe a quantidade' })
    .int({ error: 'A quantidade deve ser um número inteiro' })
    .min(1, { error: 'A quantidade deve ser de pelo menos 1' })
    .max(PACOTE_QUANTIDADE_MAX, {
      error: `A quantidade deve ser de no máximo ${PACOTE_QUANTIDADE_MAX}`,
    }),
});
export type PacoteItemInput = z.output<typeof pacoteItemInputSchema>;

/**
 * `POST /api/comercial-atendimento/pacotes` e `PATCH /:id`: modal "Novo Pacote". Cliente, Nome e
 * Itens são obrigatórios. O valor total é opcional e, quando informado, sobrescreve a soma dos
 * itens.
 */
export const pacoteInputSchema = z
  .strictObject({
    pacienteId: z.uuid({ error: erroObrigatorio('Cliente') }),
    nome: textoObrigatorio('Nome do Pacote', { max: PACOTE_NOME_MAX }),
    descricao: textoOpcional('A descrição'),
    itens: z
      .array(pacoteItemInputSchema, { error: erroObrigatorio('Itens / Procedimentos') })
      .min(1, { error: erroObrigatorio('Itens / Procedimentos') })
      .max(PACOTE_ITENS_MAX, { error: `Informe no máximo ${PACOTE_ITENS_MAX} itens` }),
    valorTotal: z
      .number({ error: 'Informe um valor válido' })
      .min(0, { error: 'Informe um valor válido' })
      .max(PACOTE_VALOR_MAX, { error: 'Valor muito alto' })
      .nullish()
      .transform((valor) => valor ?? null),
    dataInicio: dataOpcional('Data de início inválida'),
    dataVencimento: dataOpcional('Data de vencimento inválida'),
    profissionalId: z
      .uuid({ error: 'Profissional inválido' })
      .nullish()
      .transform((valor) => valor ?? null),
    observacoes: textoOpcional('As observações'),
  })
  .refine((p) => !p.dataInicio || !p.dataVencimento || p.dataVencimento >= p.dataInicio, {
    error: 'O vencimento não pode ser anterior ao início',
    path: ['dataVencimento'],
  });
export type PacoteInput = z.output<typeof pacoteInputSchema>;
export type PacoteFormulario = z.input<typeof pacoteInputSchema>;

/** Soma dos itens, usada pelo modal (prévia) e pela API quando não há valor total informado. */
export function somarItensPacote(
  itens: readonly { quantidade: number; valorUnitario: number }[],
): number {
  const soma = itens.reduce((total, i) => total + i.quantidade * i.valorUnitario, 0);
  return Math.round((soma + Number.EPSILON) * 100) / 100;
}

/** `POST /api/comercial-atendimento/pacotes/:id/usos`: modal "Registrar Uso de Sessão". */
export const registrarUsoPacoteSchema = z.strictObject({
  profissionalId: z.uuid({ error: erroObrigatorio('Profissional') }),
  quantidade: z
    .number({ error: 'Informe a quantidade' })
    .int({ error: 'A quantidade deve ser um número inteiro' })
    .min(1, { error: 'A quantidade deve ser de pelo menos 1' })
    .max(PACOTE_QUANTIDADE_MAX, {
      error: `A quantidade deve ser de no máximo ${PACOTE_QUANTIDADE_MAX}`,
    })
    .default(1),
  observacoes: textoOpcional('As observações'),
});
export type RegistrarUsoPacoteInput = z.output<typeof registrarUsoPacoteSchema>;
export type RegistrarUsoPacoteFormulario = z.input<typeof registrarUsoPacoteSchema>;

/** Campos de `sort=`. `cliente_nome`, `nome`, `valor_total`, `data_vencimento` e `status`, como no menu "Colunas". */
export const PACOTE_SORT_FIELDS = [
  'cliente',
  'nome',
  'valor',
  'vencimento',
  'status',
  'criacao',
] as const;

/** `GET /api/comercial-atendimento/pacotes`. */
export const listPacotesQuerySchema = listQuerySchema({
  sortFields: PACOTE_SORT_FIELDS,
  defaultSort: 'criacao:desc',
  filters: { status: pacoteStatusFiltroSchema.optional() },
});
export type ListPacotesQuery = z.infer<typeof listPacotesQuerySchema>;

export const PACOTE_EXPORT_COLUMNS = [
  'cliente',
  'nome',
  'sessoes',
  'saldo',
  'valor',
  'vencimento',
  'status',
] as const;
export type PacoteExportColumn = (typeof PACOTE_EXPORT_COLUMNS)[number];

/** `GET /api/comercial-atendimento/pacotes/export`. */
export const exportPacotesQuerySchema = exportQuerySchema(
  listPacotesQuerySchema,
  PACOTE_EXPORT_COLUMNS,
);
export type ExportPacotesQuery = z.infer<typeof exportPacotesQuerySchema>;

/** Valores monetários chegam como texto decimal (ex.: `"150.00"`), exatos como no banco. */
const decimal = z.string();

export const pacoteItemSchema = z.object({
  id: z.uuid(),
  produtoId: z.uuid(),
  descricao: z.string(),
  quantidade: z.number().int(),
  valorUnitario: decimal,
  /** Sessões deste item já usadas (os usos abatem os itens na ordem em que foram cadastrados). */
  usadas: z.number().int(),
});
export type PacoteItem = z.infer<typeof pacoteItemSchema>;

export const pacoteUsoSchema = z.object({
  id: z.uuid(),
  profissionalId: z.uuid(),
  profissional: z.string(),
  quantidade: z.number().int(),
  observacoes: z.string().nullable(),
  /** Data e hora do registro. */
  data: z.iso.datetime(),
});
export type PacoteUso = z.infer<typeof pacoteUsoSchema>;

export const pacoteSchema = z.object({
  id: z.uuid(),
  pacienteId: z.uuid(),
  /** Coluna "Cliente". */
  cliente: z.string(),
  /** Coluna "Pacote". */
  nome: z.string(),
  descricao: z.string().nullable(),
  /** Coluna "Valor". */
  valorTotal: decimal,
  /** `AAAA-MM-DD`. */
  dataInicio: z.string().nullable(),
  /** Coluna "Vencimento", `AAAA-MM-DD`. */
  dataVencimento: z.string().nullable(),
  profissionalId: z.uuid().nullable(),
  profissional: z.string().nullable(),
  observacoes: z.string().nullable(),
  /** Coluna "Sessões": total do pacote. */
  sessoesTotal: z.number().int(),
  sessoesUsadas: z.number().int(),
  /** Coluna "Saldo". */
  saldo: z.number().int(),
  status: z.enum(PACOTE_STATUS),
  itens: z.array(pacoteItemSchema),
  usos: z.array(pacoteUsoSchema),
});
export type Pacote = z.infer<typeof pacoteSchema>;

export const pacotePageSchema = paginatedResponseSchema(pacoteSchema);
export type PacotePage = z.infer<typeof pacotePageSchema>;

/** `GET /api/comercial-atendimento/pacotes/catalogo`: busca de produto/procedimento do modal. */
export const catalogoPacoteQuerySchema = paginationQuerySchema.extend({
  search: searchSchema,
});
export type CatalogoPacoteQuery = z.infer<typeof catalogoPacoteQuerySchema>;

export const catalogoPacoteItemSchema = z.object({
  id: z.uuid(),
  nome: z.string(),
  categoria: z.string().nullable(),
  valor: z.number(),
});
export type CatalogoPacoteItem = z.infer<typeof catalogoPacoteItemSchema>;

export const catalogoPacotePageSchema = paginatedResponseSchema(catalogoPacoteItemSchema);
export type CatalogoPacotePage = z.infer<typeof catalogoPacotePageSchema>;
