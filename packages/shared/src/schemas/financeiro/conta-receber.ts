import { z } from 'zod';
import { exportQuerySchema, listQuerySchema } from '../common/list-query';
import { paginatedResponseSchema } from '../common/pagination';
import {
  camposEntradaContaFinanceira,
  camposSaidaContaFinanceira,
  filtrosContaFinanceira,
  idOpcional,
  statusExibicaoContaFinanceira,
} from './conta-financeira';

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
  return statusExibicaoContaFinanceira(conta);
}

/**
 * `POST`/`PATCH /api/financeiro/contas-receber` (modais "Nova Conta a Receber" e "Editar Conta a
 * Receber"). Cliente, Forma de Pagamento, Plano de Contas e Documento são opcionais.
 */
export const contaReceberInputSchema = z.strictObject({
  ...camposEntradaContaFinanceira,
  pacienteId: idOpcional('Cliente'),
  status: contaReceberStatusSchema.default('PENDENTE'),
  /**
   * Conta bancária e data do recebimento (decisão do dev na #46, para a Conciliação): só valem
   * com status Recebido. Sem data, o back usa a data de hoje; fora de Recebido, os dois são
   * limpos.
   */
  contaBancariaId: z
    .uuid({ error: 'Conta bancária inválida' })
    .nullish()
    .or(z.literal(''))
    .transform((valor) => valor || null),
  dataRecebimento: z.iso
    .date({ error: 'Data de recebimento inválida' })
    .nullish()
    .or(z.literal(''))
    .transform((valor) => valor || null),
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
  filters: filtrosContaFinanceira(contaReceberFiltroStatusSchema),
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

export const contaReceberSchema = z.object({
  ...camposSaidaContaFinanceira,
  pacienteId: z.uuid().nullable(),
  pacienteNome: z.string().nullable(),
  status: contaReceberStatusSchema,
  contaBancariaId: z.uuid().nullable(),
  contaBancariaNome: z.string().nullable(),
  dataRecebimento: z.iso.date().nullable(),
});
export type ContaReceber = z.infer<typeof contaReceberSchema>;

export const contaReceberPageSchema = paginatedResponseSchema(contaReceberSchema);
export type ContaReceberPage = z.infer<typeof contaReceberPageSchema>;
