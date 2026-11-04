import { z } from 'zod';
import { exportQuerySchema, listQuerySchema } from '../common/list-query';
import { mensagemObrigatoria, textoObrigatorio } from '../common/obrigatorio';
import { paginatedResponseSchema } from '../common/pagination';

export const CONTA_RECEBER_DESCRICAO_MAX = 200;
export const CONTA_RECEBER_DOCUMENTO_MAX = 60;
export const CONTA_RECEBER_OBSERVACOES_MAX = 2000;
/** Cabe em DECIMAL(12,2). */
export const CONTA_RECEBER_VALOR_MAX = 999_999_999;
export const CONTA_RECEBER_TOTAL_PARCELAS_MAX = 360;

/** Combobox "Status" do modal (print do dev, issue #48): Pendente / Recebido / Cancelado. */
export const CONTA_RECEBER_STATUS = ['PENDENTE', 'RECEBIDO', 'CANCELADO'] as const;
export const contaReceberStatusSchema = z.enum(CONTA_RECEBER_STATUS, { error: 'Status inválido' });
export type ContaReceberStatus = (typeof CONTA_RECEBER_STATUS)[number];

export const CONTA_RECEBER_ROTULO_STATUS: Readonly<Record<ContaReceberStatus, string>> = {
  PENDENTE: 'Pendente',
  RECEBIDO: 'Recebido',
  CANCELADO: 'Cancelado',
};

/**
 * Chips do grid (inventário): Todos (ausente) / Pendente / Recebido / Vencido. "Vencido" não é
 * gravado: é calculado (PENDENTE com `dataVencimento` no passado), por isso não entra no
 * combobox "Status" do modal nem no `ContaReceberStatus` gravado no banco.
 */
export const CONTA_RECEBER_FILTRO_STATUS = ['PENDENTE', 'RECEBIDO', 'VENCIDO'] as const;
export const contaReceberFiltroStatusSchema = z.enum(CONTA_RECEBER_FILTRO_STATUS, {
  error: 'Status inválido',
});
export type ContaReceberFiltroStatus = (typeof CONTA_RECEBER_FILTRO_STATUS)[number];

export const CONTA_RECEBER_ROTULO_FILTRO_STATUS: Readonly<
  Record<ContaReceberFiltroStatus, string>
> = {
  PENDENTE: 'Pendente',
  RECEBIDO: 'Recebido',
  VENCIDO: 'Vencido',
};

/** Status gravado, mais "Vencido" calculado: o que a coluna "Status" do grid exibe. */
export type ContaReceberStatusExibicao = ContaReceberStatus | 'VENCIDO';

export const CONTA_RECEBER_ROTULO_STATUS_EXIBICAO: Readonly<
  Record<ContaReceberStatusExibicao, string>
> = {
  ...CONTA_RECEBER_ROTULO_STATUS,
  VENCIDO: 'Vencido',
};

/** Status exibido na linha: "Vencido" quando pendente e com vencimento no passado. */
export function statusExibicaoContaReceber(
  conta: Pick<ContaReceber, 'status' | 'dataVencimento'>,
): ContaReceberStatusExibicao {
  const hoje = new Date().toISOString().slice(0, 10);
  if (conta.status === 'PENDENTE' && conta.dataVencimento < hoje) return 'VENCIDO';
  return conta.status;
}

const descricao = textoObrigatorio('Descrição', { max: CONTA_RECEBER_DESCRICAO_MAX });

const valor = z
  .number({ error: mensagemObrigatoria('Valor') })
  .positive({ error: 'O valor deve ser maior que zero' })
  .max(CONTA_RECEBER_VALOR_MAX, { error: 'Valor inválido' });

const dataVencimento = z
  .string({ error: mensagemObrigatoria('Data de vencimento', 'f') })
  .min(1, { error: mensagemObrigatoria('Data de vencimento', 'f') })
  .pipe(z.iso.date({ error: 'Data de vencimento inválida' }));

const idOpcional = (rotulo: string) =>
  z
    .uuid({ error: `${rotulo} inválido` })
    .nullish()
    .transform((valor) => valor ?? null);

const documento = z
  .string({ error: 'Documento inválido' })
  .trim()
  .max(CONTA_RECEBER_DOCUMENTO_MAX, {
    error: `Documento deve ter no máximo ${CONTA_RECEBER_DOCUMENTO_MAX} caracteres`,
  })
  .nullish()
  .transform((valor) => valor || null);

const totalParcelas = z
  .number({ error: 'Total de parcelas inválido' })
  .int({ error: 'Total de parcelas deve ser um número inteiro' })
  .min(1, { error: 'Total de parcelas deve ser de 1 a 360' })
  .max(CONTA_RECEBER_TOTAL_PARCELAS_MAX, { error: 'Total de parcelas deve ser de 1 a 360' })
  .default(1);

const observacoes = z
  .string({ error: 'Observações inválidas' })
  .trim()
  .max(CONTA_RECEBER_OBSERVACOES_MAX, {
    error: `Observações devem ter no máximo ${CONTA_RECEBER_OBSERVACOES_MAX} caracteres`,
  })
  .nullish()
  .transform((valor) => valor || null);

/**
 * `POST`/`PATCH /api/financeiro/contas-receber` (modais "Nova Conta a Receber" e "Editar Conta a
 * Receber"). Cliente, Forma de Pagamento, Plano de Contas e Documento são opcionais.
 */
export const contaReceberInputSchema = z.strictObject({
  descricao,
  pacienteId: idOpcional('Cliente'),
  valor,
  dataVencimento,
  formaPagamentoId: idOpcional('Forma de pagamento'),
  planoContaId: idOpcional('Plano de contas'),
  documento,
  totalParcelas,
  status: contaReceberStatusSchema.default('PENDENTE'),
  observacoes,
});

export type ContaReceberFormulario = z.input<typeof contaReceberInputSchema>;
export type CreateContaReceberInput = z.output<typeof contaReceberInputSchema>;
export type UpdateContaReceberInput = CreateContaReceberInput;
export const createContaReceberSchema = contaReceberInputSchema;
export const updateContaReceberSchema = contaReceberInputSchema;

export const CONTA_RECEBER_SORT_FIELDS = [
  'id',
  'descricao',
  'cliente',
  'valor',
  'dataVencimento',
  'status',
] as const;

/** `GET /api/financeiro/contas-receber`. */
export const listContasReceberQuerySchema = listQuerySchema({
  sortFields: CONTA_RECEBER_SORT_FIELDS,
  defaultSort: 'dataVencimento:asc',
  filters: {
    status: contaReceberFiltroStatusSchema.optional(),
    vencimentoDe: z.iso.date({ error: 'Data inválida' }).optional(),
    vencimentoAte: z.iso.date({ error: 'Data inválida' }).optional(),
  },
});
export type ListContasReceberQuery = z.infer<typeof listContasReceberQuerySchema>;

export const CONTA_RECEBER_EXPORT_COLUMNS = [
  'id',
  'descricao',
  'cliente',
  'valor',
  'dataVencimento',
  'status',
] as const;
export type ContaReceberExportColumn = (typeof CONTA_RECEBER_EXPORT_COLUMNS)[number];

/** `GET /api/financeiro/contas-receber/export`. */
export const exportContasReceberQuerySchema = exportQuerySchema(
  listContasReceberQuerySchema,
  CONTA_RECEBER_EXPORT_COLUMNS,
);
export type ExportContasReceberQuery = z.infer<typeof exportContasReceberQuerySchema>;

/** Valores monetários chegam como texto decimal (ex.: `"150.00"`), exatos como no banco. */
const decimal = z.string();

export const contaReceberSchema = z.object({
  id: z.uuid(),
  /** Número exibido na coluna "#". */
  numero: z.number().int(),
  descricao: z.string(),
  pacienteId: z.uuid().nullable(),
  pacienteNome: z.string().nullable(),
  valor: decimal,
  dataVencimento: z.iso.date(),
  formaPagamentoId: z.uuid().nullable(),
  formaPagamentoNome: z.string().nullable(),
  planoContaId: z.uuid().nullable(),
  planoContaNome: z.string().nullable(),
  documento: z.string().nullable(),
  totalParcelas: z.number().int(),
  status: contaReceberStatusSchema,
  observacoes: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type ContaReceber = z.infer<typeof contaReceberSchema>;

export const contaReceberPageSchema = paginatedResponseSchema(contaReceberSchema);
export type ContaReceberPage = z.infer<typeof contaReceberPageSchema>;
