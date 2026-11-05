import { z } from 'zod';
import { exportQuerySchema, listQuerySchema } from '../common/list-query';
import { mensagemObrigatoria, textoObrigatorio } from '../common/obrigatorio';
import { paginatedResponseSchema } from '../common/pagination';

export const COMPRA_DESCRICAO_MAX = 200;
export const COMPRA_NF_MAX = 20;
export const COMPRA_OBSERVACOES_MAX = 2000;
/** Cabe em DECIMAL(12,2). */
export const COMPRA_VALOR_MAX = 999_999_999;
/** Cabe em DECIMAL(12,3). */
export const COMPRA_QUANTIDADE_MAX = 999_999_999;

export const MSG_COMPRA_SEM_ITENS = 'Adicione pelo menos um produto.';

/** Chips do grid: Todas (ausente) / Pendente / Recebida / Cancelada. */
export const COMPRA_STATUS = ['PENDENTE', 'RECEBIDA', 'CANCELADA'] as const;
export const compraStatusSchema = z.enum(COMPRA_STATUS, { error: 'Status inválido' });
export type CompraStatus = (typeof COMPRA_STATUS)[number];

export const COMPRA_ROTULO_STATUS: Readonly<Record<CompraStatus, string>> = {
  PENDENTE: 'Pendente',
  RECEBIDA: 'Recebida',
  CANCELADA: 'Cancelada',
};

const idObrigatorio = (rotulo: string, genero: 'm' | 'f' = 'm') =>
  z
    .string({ error: mensagemObrigatoria(rotulo, genero) })
    .min(1, { error: mensagemObrigatoria(rotulo, genero) })
    .pipe(z.uuid({ error: `${rotulo} inválido` }));

const idOpcional = (rotulo: string) =>
  z
    .uuid({ error: `${rotulo} inválido` })
    .nullish()
    .transform((valor) => valor ?? null);

const textoOpcional = (rotulo: string, max: number) =>
  z
    .string({ error: `${rotulo} inválido` })
    .trim()
    .max(max, { error: `${rotulo} deve ter no máximo ${max} caracteres` })
    .nullish()
    .transform((valor) => valor || null);

const dataObrigatoria = (rotulo: string) =>
  z
    .string({ error: mensagemObrigatoria(rotulo, 'f') })
    .min(1, { error: mensagemObrigatoria(rotulo, 'f') })
    .pipe(z.iso.date({ error: `${rotulo} inválida` }));

const dataEmissao = z
  .string({ error: 'Data de emissão inválida' })
  .nullish()
  .transform((valor) => valor || null)
  .pipe(z.iso.date({ error: 'Data de emissão inválida' }).nullable());

const valorAdicional = (rotulo: string) =>
  z
    .number({ error: `${rotulo} inválido` })
    .min(0, { error: `${rotulo} não pode ser negativo` })
    .max(COMPRA_VALOR_MAX, { error: `${rotulo} inválido` })
    .nullish()
    .transform((valor) => valor ?? 0);

/** Linha da tabela de itens da compra. O produto é obrigatório. */
export const compraItemInputSchema = z.strictObject({
  produtoId: idObrigatorio('Produto'),
  descricao: textoObrigatorio('Descrição', { genero: 'f', max: COMPRA_DESCRICAO_MAX }),
  quantidade: z
    .number({ error: mensagemObrigatoria('Quantidade', 'f') })
    .positive({ error: 'A quantidade deve ser maior que zero' })
    .max(COMPRA_QUANTIDADE_MAX, { error: 'Quantidade inválida' }),
  valorUnitario: z
    .number({ error: mensagemObrigatoria('Valor unitário') })
    .min(0, { error: 'O valor unitário não pode ser negativo' })
    .max(COMPRA_VALOR_MAX, { error: 'Valor unitário inválido' }),
  /** "Conta contábil (opcional)": conta do Plano de Contas. */
  planoContaId: idOpcional('Conta contábil'),
});
export type CompraItemFormulario = z.input<typeof compraItemInputSchema>;
export type CompraItemInput = z.output<typeof compraItemInputSchema>;

interface ItemParaTotal {
  quantidade: number;
  valorUnitario: number;
}

/** Subtotal dos itens, arredondado em centavos. */
export function subtotalCompra(itens: readonly ItemParaTotal[]): number {
  const centavos = itens.reduce(
    (total, i) =>
      total + Math.round((Number(i.quantidade) || 0) * (Number(i.valorUnitario) || 0) * 100),
    0,
  );
  return centavos / 100;
}

/** Total da compra: itens + frete - desconto. */
export function totalCompra(
  itens: readonly ItemParaTotal[],
  frete: number | null | undefined,
  desconto: number | null | undefined,
): number {
  const centavos = Math.round(
    (subtotalCompra(itens) + (Number(frete) || 0) - (Number(desconto) || 0)) * 100,
  );
  return centavos / 100;
}

/**
 * `POST`/`PATCH /api/compras-estoque/compras` (modal "Nova Compra (Entrada)"). Fornecedor e
 * pelo menos um produto são obrigatórios (confirmado pelo dev na issue #19).
 */
export const compraInputSchema = z
  .strictObject({
    fornecedorId: idObrigatorio('Fornecedor'),
    numeroNf: textoOpcional('Número da NF', COMPRA_NF_MAX),
    serieNf: textoOpcional('Série da NF', COMPRA_NF_MAX),
    dataEmissao,
    dataEntrada: dataObrigatoria('Data de entrada'),
    itens: z
      .array(compraItemInputSchema, { error: MSG_COMPRA_SEM_ITENS })
      .min(1, { error: MSG_COMPRA_SEM_ITENS }),
    frete: valorAdicional('Frete'),
    desconto: valorAdicional('Desconto'),
    observacoes: textoOpcional('Observações', COMPRA_OBSERVACOES_MAX),
    arquivoNfId: idOpcional('Arquivo da NF'),
  })
  .refine((c) => totalCompra(c.itens, c.frete, c.desconto) >= 0, {
    path: ['desconto'],
    error: 'O desconto não pode ser maior que o total da compra',
  });

export type CompraFormulario = z.input<typeof compraInputSchema>;
export type CreateCompraInput = z.output<typeof compraInputSchema>;
export type UpdateCompraInput = CreateCompraInput;
export const createCompraSchema = compraInputSchema;
export const updateCompraSchema = compraInputSchema;

export const COMPRA_SORT_FIELDS = [
  'id',
  'dataEntrada',
  'fornecedor',
  'numeroNf',
  'valorTotal',
  'status',
] as const;

/** `GET /api/compras-estoque/compras`. */
export const listComprasQuerySchema = listQuerySchema({
  sortFields: COMPRA_SORT_FIELDS,
  defaultSort: 'id:desc',
  filters: { status: compraStatusSchema.optional() },
});
export type ListComprasQuery = z.infer<typeof listComprasQuerySchema>;

export const COMPRA_EXPORT_COLUMNS = [
  'id',
  'dataEntrada',
  'fornecedor',
  'numeroNf',
  'valorTotal',
  'status',
] as const;
export type CompraExportColumn = (typeof COMPRA_EXPORT_COLUMNS)[number];

/** `GET /api/compras-estoque/compras/export`. */
export const exportComprasQuerySchema = exportQuerySchema(
  listComprasQuerySchema,
  COMPRA_EXPORT_COLUMNS,
);
export type ExportComprasQuery = z.infer<typeof exportComprasQuerySchema>;

/** Valores monetários chegam como texto decimal (ex.: `"150.00"`), exatos como no banco. */
const decimal = z.string();

export const compraItemSchema = z.object({
  id: z.uuid(),
  produtoId: z.uuid(),
  produtoNome: z.string().nullable(),
  descricao: z.string(),
  quantidade: decimal,
  valorUnitario: decimal,
  valorTotal: decimal,
  planoContaId: z.uuid().nullable(),
  planoContaNome: z.string().nullable(),
});
export type CompraItem = z.infer<typeof compraItemSchema>;

export const compraSchema = z.object({
  id: z.uuid(),
  /** Número exibido na coluna "#". */
  numero: z.number().int(),
  fornecedorId: z.uuid(),
  fornecedorNome: z.string().nullable(),
  numeroNf: z.string().nullable(),
  serieNf: z.string().nullable(),
  dataEmissao: z.iso.date().nullable(),
  dataEntrada: z.iso.date(),
  frete: decimal,
  desconto: decimal,
  valorTotal: decimal,
  status: compraStatusSchema,
  observacoes: z.string().nullable(),
  arquivoNfId: z.uuid().nullable(),
  itens: z.array(compraItemSchema),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type Compra = z.infer<typeof compraSchema>;

export const compraPageSchema = paginatedResponseSchema(compraSchema);
export type CompraPage = z.infer<typeof compraPageSchema>;

// --- Importar XML de NF-e ---

export const COMPRA_XML_MAX_CARACTERES = 5_000_000;

/** `POST /api/compras-estoque/compras/importar-xml` (modal "Importar XML de NF-e"). */
export const importarXmlCompraSchema = z.strictObject({
  xml: z
    .string({ error: 'Selecione o arquivo XML da nota fiscal.' })
    .min(1, { error: 'Selecione o arquivo XML da nota fiscal.' })
    .max(COMPRA_XML_MAX_CARACTERES, { error: 'O arquivo XML é grande demais' }),
});
export type ImportarXmlCompraInput = z.output<typeof importarXmlCompraSchema>;

export const compraXmlItemSchema = z.object({
  codigo: z.string().nullable(),
  descricao: z.string(),
  quantidade: z.number(),
  valorUnitario: z.number(),
  /** Produto já cadastrado com o mesmo código (SKU) ou código de barras; `null` se não achou. */
  produtoId: z.uuid().nullable(),
});

/**
 * Prévia da nota: nada é gravado. O front abre "Nova Compra" já preenchida; o produto de cada
 * item ainda precisa ser vinculado quando `produtoId` vem `null`.
 */
export const compraXmlPreviaSchema = z.object({
  numeroNf: z.string().nullable(),
  serieNf: z.string().nullable(),
  dataEmissao: z.iso.date().nullable(),
  fornecedorNome: z.string().nullable(),
  fornecedorDocumento: z.string().nullable(),
  /** Fornecedor cadastrado com o mesmo CNPJ/CPF; `null` se não achou. */
  fornecedorId: z.uuid().nullable(),
  frete: z.number(),
  desconto: z.number(),
  itens: z.array(compraXmlItemSchema),
});
export type CompraXmlPrevia = z.infer<typeof compraXmlPreviaSchema>;
