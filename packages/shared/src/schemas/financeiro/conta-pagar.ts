import { z } from 'zod';
import { exportQuerySchema, listQuerySchema } from '../common/list-query';
import { erroObrigatorio } from '../common/obrigatorio';
import { paginatedResponseSchema } from '../common/pagination';
import {
  camposEntradaContaFinanceira,
  camposSaidaContaFinanceira,
  CONTA_FINANCEIRA_VALOR_MAX,
  decimal,
  documentoContaFinanceira,
  filtrosContaFinanceira,
  idOpcional,
  observacoesContaFinanceira,
  statusExibicaoContaFinanceira,
} from './conta-financeira';

/** Checkbox "Funcionário" do modal: desmarcado = Fornecedor (padrão), marcado = Funcionário. */
export const CONTA_PAGAR_BENEFICIARIO_TIPOS = ['FORNECEDOR', 'FUNCIONARIO'] as const;
export const contaPagarBeneficiarioTipoSchema = z.enum(CONTA_PAGAR_BENEFICIARIO_TIPOS, {
  error: 'Tipo de beneficiário inválido',
});
export type ContaPagarBeneficiarioTipo = (typeof CONTA_PAGAR_BENEFICIARIO_TIPOS)[number];

/** Combobox "Status" do modal (mesmo padrão de Contas a Receber): Pendente / Pago / Cancelado. */
export const CONTA_PAGAR_STATUS = ['PENDENTE', 'PAGO', 'CANCELADO'] as const;
export const contaPagarStatusSchema = z.enum(CONTA_PAGAR_STATUS, { error: 'Status inválido' });
export type ContaPagarStatus = (typeof CONTA_PAGAR_STATUS)[number];

export const CONTA_PAGAR_ROTULO_STATUS: Readonly<Record<ContaPagarStatus, string>> = {
  PENDENTE: 'Pendente',
  PAGO: 'Pago',
  CANCELADO: 'Cancelado',
};

/**
 * Chips do grid (inventário): Todos (ausente) / Pendente / Pago / Vencido. "Vencido" não é
 * gravado: é calculado (PENDENTE com `dataVencimento` no passado).
 */
export const CONTA_PAGAR_FILTRO_STATUS = ['PENDENTE', 'PAGO', 'VENCIDO'] as const;
export const contaPagarFiltroStatusSchema = z.enum(CONTA_PAGAR_FILTRO_STATUS, {
  error: 'Status inválido',
});
export type ContaPagarFiltroStatus = (typeof CONTA_PAGAR_FILTRO_STATUS)[number];

export const CONTA_PAGAR_ROTULO_FILTRO_STATUS: Readonly<Record<ContaPagarFiltroStatus, string>> = {
  PENDENTE: 'Pendente',
  PAGO: 'Pago',
  VENCIDO: 'Vencido',
};

/** Status gravado, mais "Vencido" calculado: o que a coluna "Status" do grid exibe. */
export type ContaPagarStatusExibicao = ContaPagarStatus | 'VENCIDO';

export const CONTA_PAGAR_ROTULO_STATUS_EXIBICAO: Readonly<
  Record<ContaPagarStatusExibicao, string>
> = {
  ...CONTA_PAGAR_ROTULO_STATUS,
  VENCIDO: 'Vencido',
};

/** Status exibido na linha: "Vencido" quando pendente e com vencimento no passado. */
export function statusExibicaoContaPagar(
  conta: Pick<ContaPagar, 'status' | 'dataVencimento'>,
): ContaPagarStatusExibicao {
  return statusExibicaoContaFinanceira(conta);
}

/**
 * `POST`/`PATCH /api/financeiro/contas-pagar` (modais "Nova Conta a Pagar" e "Editar Conta a
 * Pagar"). `beneficiarioId` é o fornecedor ou o funcionário, conforme `beneficiarioTipo` (o
 * checkbox "Funcionário" do modal); ambos opcionais, como o Cliente em Contas a Receber.
 */
export const contaPagarInputSchema = z.strictObject({
  ...camposEntradaContaFinanceira,
  beneficiarioTipo: contaPagarBeneficiarioTipoSchema.default('FORNECEDOR'),
  beneficiarioId: idOpcional('Beneficiário'),
  status: contaPagarStatusSchema.default('PENDENTE'),
});

export type ContaPagarFormulario = z.input<typeof contaPagarInputSchema>;
export type CreateContaPagarInput = z.output<typeof contaPagarInputSchema>;
export type UpdateContaPagarInput = CreateContaPagarInput;
export const createContaPagarSchema = contaPagarInputSchema;
export const updateContaPagarSchema = contaPagarInputSchema;

export const CONTA_PAGAR_SORT_FIELDS = [
  'id',
  'descricao',
  'beneficiario',
  'valor',
  'dataVencimento',
  'status',
] as const;

/** `GET /api/financeiro/contas-pagar`. */
export const listContasPagarQuerySchema = listQuerySchema({
  sortFields: CONTA_PAGAR_SORT_FIELDS,
  defaultSort: 'dataVencimento:asc',
  filters: filtrosContaFinanceira(contaPagarFiltroStatusSchema),
});
export type ListContasPagarQuery = z.infer<typeof listContasPagarQuerySchema>;

export const CONTA_PAGAR_EXPORT_COLUMNS = [
  'id',
  'descricao',
  'beneficiario',
  'valor',
  'dataVencimento',
  'status',
] as const;
export type ContaPagarExportColumn = (typeof CONTA_PAGAR_EXPORT_COLUMNS)[number];

/** `GET /api/financeiro/contas-pagar/export`. */
export const exportContasPagarQuerySchema = exportQuerySchema(
  listContasPagarQuerySchema,
  CONTA_PAGAR_EXPORT_COLUMNS,
);
export type ExportContasPagarQuery = z.infer<typeof exportContasPagarQuerySchema>;

export const contaPagarSchema = z.object({
  ...camposSaidaContaFinanceira,
  beneficiarioTipo: contaPagarBeneficiarioTipoSchema,
  beneficiarioId: z.uuid().nullable(),
  beneficiarioNome: z.string().nullable(),
  status: contaPagarStatusSchema,
  /** Soma das baixas não canceladas. */
  valorPago: decimal,
});
export type ContaPagar = z.infer<typeof contaPagarSchema>;

export const contaPagarPageSchema = paginatedResponseSchema(contaPagarSchema);
export type ContaPagarPage = z.infer<typeof contaPagarPageSchema>;

// --- Baixa (modal "Baixar Conta a Pagar") ---

const valorPago = z
  .number({ error: erroObrigatorio('Valor pago') })
  .positive({ error: 'O valor pago deve ser maior que zero' })
  .max(CONTA_FINANCEIRA_VALOR_MAX, { error: 'Valor inválido' });

const dataPagamento = z
  .string({ error: erroObrigatorio('Data de pagamento', 'f') })
  .min(1, { error: erroObrigatorio('Data de pagamento', 'f') })
  .pipe(z.iso.date({ error: 'Data de pagamento inválida' }));

const valorAdicional = (rotulo: string) =>
  z
    .number({ error: `${rotulo} inválido` })
    .min(0, { error: `${rotulo} não pode ser negativo` })
    .max(CONTA_FINANCEIRA_VALOR_MAX, { error: `${rotulo} inválido` })
    .default(0);

/**
 * `POST /api/financeiro/contas-pagar/:id/baixar` (modal "Baixar Conta a Pagar"). O checkbox
 * "Pagamento parcial" só controla se `valorPago` fica editável no front: a API sempre aceita o
 * valor informado e soma às baixas anteriores para saber se a conta ficou quitada.
 */
export const baixarContaPagarSchema = z.strictObject({
  dataPagamento,
  valorPago,
  juros: valorAdicional('Juros'),
  desconto: valorAdicional('Desconto'),
  formaPagamentoId: idOpcional('Forma de pagamento'),
  contaBancariaId: idOpcional('Conta bancária'),
  documento: documentoContaFinanceira,
  observacoes: observacoesContaFinanceira,
  comprovanteArquivoId: idOpcional('Comprovante'),
});
export type BaixarContaPagarFormulario = z.input<typeof baixarContaPagarSchema>;
export type BaixarContaPagarInput = z.output<typeof baixarContaPagarSchema>;

export const contaPagarBaixaSchema = z.object({
  id: z.uuid(),
  contaPagarId: z.uuid(),
  dataPagamento: z.iso.date(),
  valorPago: decimal,
  juros: decimal,
  desconto: decimal,
  formaPagamentoId: z.uuid().nullable(),
  formaPagamentoNome: z.string().nullable(),
  contaBancariaId: z.uuid().nullable(),
  contaBancariaNome: z.string().nullable(),
  documento: z.string().nullable(),
  observacoes: z.string().nullable(),
  comprovanteArquivoId: z.uuid().nullable(),
  createdAt: z.iso.datetime(),
});
export type ContaPagarBaixa = z.infer<typeof contaPagarBaixaSchema>;
