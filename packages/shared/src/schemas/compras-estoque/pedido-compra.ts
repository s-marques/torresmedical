import { z } from 'zod';
import { exportQuerySchema, listQuerySchema } from '../common/list-query';
import { mensagemObrigatoria } from '../common/obrigatorio';
import { paginatedResponseSchema } from '../common/pagination';

export const PEDIDO_COMPRA_NF_MAX = 20;
export const PEDIDO_COMPRA_OBSERVACOES_MAX = 2000;
/** Cabe em DECIMAL(12,2). */
export const PEDIDO_COMPRA_VALOR_MAX = 999_999_999;
/** Cabe em DECIMAL(12,3). */
export const PEDIDO_COMPRA_QUANTIDADE_MAX = 999_999_999;

/** Chips do grid: Todos (ausente) / Em Transito / Recebido / Cancelado. */
export const PEDIDO_COMPRA_STATUS = ['EM_TRANSITO', 'RECEBIDO', 'CANCELADO'] as const;
export const pedidoCompraStatusSchema = z.enum(PEDIDO_COMPRA_STATUS, { error: 'Status inválido' });
export type PedidoCompraStatus = (typeof PEDIDO_COMPRA_STATUS)[number];

/** Rótulos como no inventário (chips "Em Transito", "Recebido", "Cancelado"). */
export const PEDIDO_COMPRA_ROTULO_STATUS: Readonly<Record<PedidoCompraStatus, string>> = {
  EM_TRANSITO: 'Em Transito',
  RECEBIDO: 'Recebido',
  CANCELADO: 'Cancelado',
};

const idObrigatorio = (rotulo: string) =>
  z
    .string({ error: mensagemObrigatoria(rotulo) })
    .min(1, { error: mensagemObrigatoria(rotulo) })
    .pipe(z.uuid({ error: `${rotulo} inválido` }));

const textoOpcional = (rotulo: string, max: number) =>
  z
    .string({ error: `${rotulo} inválido` })
    .trim()
    .max(max, { error: `${rotulo} deve ter no máximo ${max} caracteres` })
    .nullish()
    .transform((valor) => valor || null);

const dataOpcional = (rotulo: string) =>
  z
    .string({ error: `${rotulo} inválida` })
    .nullish()
    .transform((valor) => valor || null)
    .pipe(z.iso.date({ error: `${rotulo} inválida` }).nullable());

/** Linha de "Itens do Pedido": Produto, Qtd e Unitário. O total da linha é calculado. */
export const pedidoCompraItemInputSchema = z.strictObject({
  produtoId: idObrigatorio('Produto'),
  quantidade: z
    .number({ error: mensagemObrigatoria('Quantidade', 'f') })
    .positive({ error: 'A quantidade deve ser maior que zero' })
    .max(PEDIDO_COMPRA_QUANTIDADE_MAX, { error: 'Quantidade inválida' }),
  valorUnitario: z
    .number({ error: mensagemObrigatoria('Valor unitário') })
    .min(0, { error: 'O valor unitário não pode ser negativo' })
    .max(PEDIDO_COMPRA_VALOR_MAX, { error: 'Valor unitário inválido' }),
});
export type PedidoCompraItemFormulario = z.input<typeof pedidoCompraItemInputSchema>;
export type PedidoCompraItemInput = z.output<typeof pedidoCompraItemInputSchema>;

interface ItemParaTotal {
  quantidade: number;
  valorUnitario: number;
}

/** Total de uma linha (Qtd × Unitário), arredondado em centavos. */
export function totalItemPedido(item: ItemParaTotal): number {
  return Math.round((Number(item.quantidade) || 0) * (Number(item.valorUnitario) || 0) * 100) / 100;
}

/** Subtotal dos itens, arredondado em centavos. */
export function subtotalPedidoCompra(itens: readonly ItemParaTotal[]): number {
  const centavos = itens.reduce((total, i) => total + Math.round(totalItemPedido(i) * 100), 0);
  return centavos / 100;
}

/**
 * Valor Total do pedido. O campo "Valor Total (R$)" mostra "Auto": vazio, vale a soma dos itens;
 * preenchido, vale o valor digitado (confirmado pelo dev na issue #23).
 */
export function valorTotalPedidoCompra(
  itens: readonly ItemParaTotal[],
  valorInformado: number | null | undefined,
): number {
  return valorInformado ?? subtotalPedidoCompra(itens);
}

/**
 * `POST`/`PATCH /api/compras-estoque/pedidos-compra` (modal "Novo Pedido de Compra"). Só o
 * fornecedor é obrigatório; o pedido pode ser criado sem itens (confirmado pelo dev na issue #23).
 */
export const pedidoCompraInputSchema = z.strictObject({
  fornecedorId: idObrigatorio('Fornecedor'),
  numeroNf: textoOpcional('Número NF', PEDIDO_COMPRA_NF_MAX),
  /** Vazio: o servidor grava a data de hoje (o modal já abre com hoje). */
  dataPedido: dataOpcional('Data do pedido'),
  dataPrevisao: dataOpcional('Previsão de entrega'),
  /** Vazio ("Auto"): soma dos itens. */
  valorTotal: z
    .number({ error: 'Valor total inválido' })
    .min(0, { error: 'O valor total não pode ser negativo' })
    .max(PEDIDO_COMPRA_VALOR_MAX, { error: 'Valor total inválido' })
    .nullish()
    .transform((valor) => valor ?? null),
  observacoes: textoOpcional('Observações', PEDIDO_COMPRA_OBSERVACOES_MAX),
  itens: z
    .array(pedidoCompraItemInputSchema, { error: 'Itens inválidos' })
    .nullish()
    .transform((itens) => itens ?? []),
});

export type PedidoCompraFormulario = z.input<typeof pedidoCompraInputSchema>;
export type CreatePedidoCompraInput = z.output<typeof pedidoCompraInputSchema>;
export type UpdatePedidoCompraInput = CreatePedidoCompraInput;
export const createPedidoCompraSchema = pedidoCompraInputSchema;
export const updatePedidoCompraSchema = pedidoCompraInputSchema;

/** Colunas do grid: NF, Fornecedor, Data Pedido, Previsao, Valor, Itens e Status. */
export const PEDIDO_COMPRA_SORT_FIELDS = [
  'numeroNf',
  'fornecedor',
  'dataPedido',
  'dataPrevisao',
  'valorTotal',
  'qtdItens',
  'status',
] as const;

/** `GET /api/compras-estoque/pedidos-compra`. */
export const listPedidosCompraQuerySchema = listQuerySchema({
  sortFields: PEDIDO_COMPRA_SORT_FIELDS,
  defaultSort: 'dataPedido:desc',
  filters: { status: pedidoCompraStatusSchema.optional() },
});
export type ListPedidosCompraQuery = z.infer<typeof listPedidosCompraQuerySchema>;

export const PEDIDO_COMPRA_EXPORT_COLUMNS = PEDIDO_COMPRA_SORT_FIELDS;
export type PedidoCompraExportColumn = (typeof PEDIDO_COMPRA_EXPORT_COLUMNS)[number];

/** `GET /api/compras-estoque/pedidos-compra/export`. */
export const exportPedidosCompraQuerySchema = exportQuerySchema(
  listPedidosCompraQuerySchema,
  PEDIDO_COMPRA_EXPORT_COLUMNS,
);
export type ExportPedidosCompraQuery = z.infer<typeof exportPedidosCompraQuerySchema>;

/** Valores monetários chegam como texto decimal (ex.: `"150.00"`), exatos como no banco. */
const decimal = z.string();

export const pedidoCompraItemSchema = z.object({
  id: z.uuid(),
  produtoId: z.uuid(),
  produtoNome: z.string().nullable(),
  quantidade: decimal,
  valorUnitario: decimal,
  valorTotal: decimal,
});
export type PedidoCompraItem = z.infer<typeof pedidoCompraItemSchema>;

export const pedidoCompraSchema = z.object({
  id: z.uuid(),
  fornecedorId: z.uuid(),
  fornecedorNome: z.string().nullable(),
  numeroNf: z.string().nullable(),
  dataPedido: z.iso.date(),
  dataPrevisao: z.iso.date().nullable(),
  valorTotal: decimal,
  /** `true` quando o Valor Total foi digitado; `false` quando é a soma dos itens ("Auto"). */
  valorTotalInformado: z.boolean(),
  qtdItens: z.number().int(),
  status: pedidoCompraStatusSchema,
  observacoes: z.string().nullable(),
  itens: z.array(pedidoCompraItemSchema),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type PedidoCompra = z.infer<typeof pedidoCompraSchema>;

export const pedidoCompraPageSchema = paginatedResponseSchema(pedidoCompraSchema);
export type PedidoCompraPage = z.infer<typeof pedidoCompraPageSchema>;
