import { z } from 'zod';
import { exportQuerySchema, listQuerySchema, searchSchema } from '../common/list-query';
import { paginatedResponseSchema, paginationQuerySchema } from '../common/pagination';

export const VENDA_ITENS_MAX = 100;
export const VENDA_QUANTIDADE_MAX = 9999;
export const VENDA_PARCELAS_MAX = 120;
export const VENDA_DESCRICAO_MAX = 200;
/** Cabe em DECIMAL(12,2). */
export const VENDA_VALOR_MAX = 999_999_999;

export const MSG_VENDA_SEM_ITENS = 'Adicione ao menos um item.';

/** Chips da aba Vendas (PDV): Todas (ausente) / Orç. Aprovados / Finalizada / Cancelada. */
export const VENDA_STATUS_FILTRO = ['orcamento-aprovado', 'finalizada', 'cancelada'] as const;
export const vendaStatusFiltroSchema = z.enum(VENDA_STATUS_FILTRO, { error: 'Status inválido' });
export type VendaStatusFiltro = z.infer<typeof vendaStatusFiltroSchema>;

/** Valor do banco (igual ao `audit_log`). */
export const VENDA_STATUS = ['ORCAMENTO_APROVADO', 'FINALIZADA', 'CANCELADA'] as const;
export type VendaStatus = (typeof VENDA_STATUS)[number];

export const VENDA_ROTULO_STATUS: Readonly<Record<VendaStatus, string>> = {
  ORCAMENTO_APROVADO: 'Orç. Aprovado',
  FINALIZADA: 'Finalizada',
  CANCELADA: 'Cancelada',
};

/** Busca de itens do PDV: produto/serviço (campo de busca) ou protocolo (botão Protocolo). */
export const VENDA_ORIGENS = ['produto', 'protocolo'] as const;
export const vendaOrigemSchema = z.enum(VENDA_ORIGENS, { error: 'Origem inválida' });
export type VendaOrigem = z.infer<typeof vendaOrigemSchema>;

const dinheiro = (mensagem: string) =>
  z
    .number({ error: mensagem })
    .min(0, { error: mensagem })
    .max(VENDA_VALOR_MAX, { error: 'Valor muito alto' });

export const vendaItemInputSchema = z.strictObject({
  origem: vendaOrigemSchema,
  /** Produto/serviço ou protocolo de onde o item veio. */
  origemId: z.uuid({ error: 'Item inválido' }),
  descricao: z
    .string({ error: 'Informe a descrição do item' })
    .trim()
    .min(1, { error: 'Informe a descrição do item' })
    .max(VENDA_DESCRICAO_MAX, {
      error: `A descrição deve ter no máximo ${VENDA_DESCRICAO_MAX} caracteres`,
    }),
  quantidade: z
    .number({ error: 'Informe a quantidade' })
    .int({ error: 'A quantidade deve ser um número inteiro' })
    .min(1, { error: 'A quantidade deve ser de pelo menos 1' })
    .max(VENDA_QUANTIDADE_MAX, {
      error: `A quantidade deve ser de no máximo ${VENDA_QUANTIDADE_MAX}`,
    }),
  valorUnitario: dinheiro('Informe um valor válido'),
});
export type VendaItemInput = z.output<typeof vendaItemInputSchema>;

/**
 * `POST /api/comercial-atendimento/vendas`: modal "Ponto de Venda (PDV)". Cliente e forma de
 * pagamento seguem o print; os totais são calculados no servidor.
 */
export const criarVendaSchema = z.strictObject({
  pacienteId: z
    .uuid({ error: 'Cliente inválido' })
    .nullish()
    .transform((valor) => valor ?? null),
  formaPagamentoId: z
    .uuid({ error: 'Forma de pagamento inválida' })
    .nullish()
    .transform((valor) => valor ?? null),
  parcelas: z
    .number({ error: 'Informe as parcelas' })
    .int({ error: 'As parcelas devem ser um número inteiro' })
    .min(1, { error: 'As parcelas devem ser de pelo menos 1' })
    .max(VENDA_PARCELAS_MAX, { error: `As parcelas devem ser de no máximo ${VENDA_PARCELAS_MAX}` })
    .default(1),
  /** Campo "Desconto (R$)". */
  desconto: dinheiro('Informe um desconto válido').default(0),
  itens: z
    .array(vendaItemInputSchema, { error: MSG_VENDA_SEM_ITENS })
    .min(1, { error: MSG_VENDA_SEM_ITENS })
    .max(VENDA_ITENS_MAX, { error: `Informe no máximo ${VENDA_ITENS_MAX} itens` }),
});
export type CriarVendaInput = z.output<typeof criarVendaSchema>;
export type CriarVendaFormulario = z.input<typeof criarVendaSchema>;

export interface TotaisVenda {
  /** Total de cada item, na ordem recebida. */
  totaisItens: number[];
  subtotal: number;
  /** Desconto em R$, limitado ao subtotal. */
  desconto: number;
  total: number;
}

const arredondar = (valor: number) => Math.round((valor + Number.EPSILON) * 100) / 100;

/** Cálculo único usado pelo modal (prévia) e pela API (valor gravado). */
export function calcularTotaisVenda(
  itens: readonly Pick<VendaItemInput, 'quantidade' | 'valorUnitario'>[],
  desconto: number,
): TotaisVenda {
  const totaisItens = itens.map((i) => arredondar(i.quantidade * i.valorUnitario));
  const subtotal = arredondar(totaisItens.reduce((soma, t) => soma + t, 0));
  const descontoAplicado = arredondar(Math.min(Math.max(desconto, 0), subtotal));
  return {
    totaisItens,
    subtotal,
    desconto: descontoAplicado,
    total: arredondar(subtotal - descontoAplicado),
  };
}

export const VENDA_SORT_FIELDS = ['id', 'data', 'cliente', 'pagamento', 'total', 'status'] as const;

/** `GET /api/comercial-atendimento/vendas`. */
export const listVendasQuerySchema = listQuerySchema({
  sortFields: VENDA_SORT_FIELDS,
  defaultSort: 'data:desc',
  filters: { status: vendaStatusFiltroSchema.optional() },
});
export type ListVendasQuery = z.infer<typeof listVendasQuerySchema>;

export const VENDA_EXPORT_COLUMNS = VENDA_SORT_FIELDS;
export type VendaExportColumn = (typeof VENDA_EXPORT_COLUMNS)[number];

/** `GET /api/comercial-atendimento/vendas/export`. */
export const exportVendasQuerySchema = exportQuerySchema(
  listVendasQuerySchema,
  VENDA_EXPORT_COLUMNS,
);
export type ExportVendasQuery = z.infer<typeof exportVendasQuerySchema>;

/** Valores monetários chegam como texto decimal (ex.: `"150.00"`), exatos como no banco. */
const decimal = z.string();

export const vendaItemSchema = z.object({
  id: z.uuid(),
  origem: vendaOrigemSchema,
  origemId: z.uuid(),
  descricao: z.string(),
  quantidade: z.number().int(),
  valorUnitario: decimal,
  total: decimal,
});
export type VendaItem = z.infer<typeof vendaItemSchema>;

export const vendaSchema = z.object({
  id: z.uuid(),
  /** Número sequencial exibido na coluna "#". */
  numero: z.number().int(),
  /** Coluna "Data". */
  data: z.iso.datetime(),
  pacienteId: z.uuid().nullable(),
  /** Coluna "Cliente". */
  cliente: z.string().nullable(),
  formaPagamentoId: z.uuid().nullable(),
  /** Coluna "Pagamento". */
  formaPagamento: z.string().nullable(),
  parcelas: z.number().int(),
  desconto: decimal,
  subtotal: decimal,
  total: decimal,
  status: z.enum(VENDA_STATUS),
  itens: z.array(vendaItemSchema),
});
export type Venda = z.infer<typeof vendaSchema>;

export const vendaPageSchema = paginatedResponseSchema(vendaSchema);
export type VendaPage = z.infer<typeof vendaPageSchema>;

/** `GET /api/comercial-atendimento/vendas/catalogo`: busca de itens do PDV. */
export const catalogoVendaQuerySchema = paginationQuerySchema.extend({
  tipo: vendaOrigemSchema,
  search: searchSchema,
});
export type CatalogoVendaQuery = z.infer<typeof catalogoVendaQuerySchema>;

export const catalogoVendaItemSchema = z.object({
  id: z.uuid(),
  nome: z.string(),
  /** Categoria (produto/serviço) ou profissional/categoria (protocolo). */
  detalhe: z.string().nullable(),
  valor: z.number(),
});
export type CatalogoVendaItem = z.infer<typeof catalogoVendaItemSchema>;

export const catalogoVendaPageSchema = paginatedResponseSchema(catalogoVendaItemSchema);
export type CatalogoVendaPage = z.infer<typeof catalogoVendaPageSchema>;
