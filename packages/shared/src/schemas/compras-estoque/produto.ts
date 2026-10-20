import { z } from 'zod';
import { exportQuerySchema, listQuerySchema } from '../common/list-query';
import { paginatedResponseSchema } from '../common/pagination';
import { TIPOS_ITEM } from '../lookups/lookup';

export const PRODUTO_NOME_MAX = 200;
export const PRODUTO_TEXTO_MAX = 120;
export const PRODUTO_NCM_MAX = 20;
export const PRODUTO_DESCRICAO_MAX = 1000;
/** Maior valor aceito nos preços e no estoque mínimo (cabe em DECIMAL(12,2) e DECIMAL(12,3)). */
export const PRODUTO_VALOR_MAX = 999_999_999;

/** Campo Tipo do modal Novo/Editar Produto/Serviço. Só `servico` é serviço; os demais são produtos. */
export const PRODUTO_TIPOS = ['produto', 'revenda', 'uso-consumo', 'servico'] as const;
export type ProdutoTipo = (typeof PRODUTO_TIPOS)[number];

export const PRODUTO_TIPO_ROTULOS: Readonly<Record<ProdutoTipo, string>> = {
  produto: 'Produto',
  revenda: 'Revenda',
  'uso-consumo': 'Uso e Consumo',
  servico: 'Serviço',
};

/** Valor do banco (igual ao `audit_log`) de cada tipo. */
export const PRODUTO_TIPOS_BANCO = ['PRODUTO', 'REVENDA', 'USO_CONSUMO', 'SERVICO'] as const;
export type ProdutoTipoBanco = (typeof PRODUTO_TIPOS_BANCO)[number];

export const MSG_NOME_OBRIGATORIO = 'Nome é obrigatório.';
export const MSG_PRECO_VENDA_OBRIGATORIO = 'Preço de venda é obrigatório.';

const nome = z
  .string({ error: MSG_NOME_OBRIGATORIO })
  .trim()
  .min(1, { error: MSG_NOME_OBRIGATORIO })
  .max(PRODUTO_NOME_MAX, { error: `O nome deve ter no máximo ${PRODUTO_NOME_MAX} caracteres` });

const tipo = z.enum(PRODUTO_TIPOS, { error: 'Tipo inválido' });

/** Combobox (Categoria, Unidade de Medida): vazio ("Selecione", "Sem unidade") vira `null`. */
const idOpcional = (mensagem: string) =>
  z
    .uuid({ error: mensagem })
    .nullish()
    .transform((valor) => valor ?? null);

/** Texto opcional: vazio vira `null`. */
const textoOpcional = (max: number, mensagem: string) =>
  z
    .string()
    .trim()
    .max(max, { error: mensagem })
    .nullish()
    .transform((valor) => valor || null);

const valorMonetario = (mensagem: string) =>
  z
    .number({ error: mensagem })
    .min(0, { error: 'O valor não pode ser negativo' })
    .max(PRODUTO_VALOR_MAX, { error: 'Valor muito alto' });

/** `POST /api/compras-estoque/produtos`: modal "Novo Produto/Serviço". */
export const createProdutoSchema = z.strictObject({
  nome,
  tipo: tipo.default('produto'),
  categoriaId: idOpcional('Categoria inválida'),
  unidadeMedidaId: idOpcional('Unidade de medida inválida'),
  marca: textoOpcional(
    PRODUTO_TEXTO_MAX,
    `A marca deve ter no máximo ${PRODUTO_TEXTO_MAX} caracteres`,
  ),
  codigoBarras: textoOpcional(
    PRODUTO_TEXTO_MAX,
    `O código de barras deve ter no máximo ${PRODUTO_TEXTO_MAX} caracteres`,
  ),
  sku: textoOpcional(PRODUTO_TEXTO_MAX, `O SKU deve ter no máximo ${PRODUTO_TEXTO_MAX} caracteres`),
  precoCusto: valorMonetario('Preço de custo inválido')
    .nullish()
    .transform((valor) => valor ?? null),
  precoVenda: valorMonetario(MSG_PRECO_VENDA_OBRIGATORIO),
  estoqueMinimo: valorMonetario('Estoque mínimo inválido').default(0),
  controlaEstoque: z.boolean({ error: 'Controla estoque inválido' }).default(true),
  ncm: textoOpcional(PRODUTO_NCM_MAX, `O NCM deve ter no máximo ${PRODUTO_NCM_MAX} caracteres`),
  descricao: textoOpcional(
    PRODUTO_DESCRICAO_MAX,
    `A descrição deve ter no máximo ${PRODUTO_DESCRICAO_MAX} caracteres`,
  ),
});

export type CreateProdutoInput = z.infer<typeof createProdutoSchema>;
export type ProdutoFormInput = z.input<typeof createProdutoSchema>;

/** `PATCH /api/compras-estoque/produtos/:id`: modal "Editar Produto" (mesmos campos). */
export const updateProdutoSchema = createProdutoSchema;

export type UpdateProdutoInput = z.infer<typeof updateProdutoSchema>;

/** Colunas ordenáveis do grid. `codigo` ordena pelo SKU. */
export const PRODUTO_SORT_FIELDS = [
  'nome',
  'codigo',
  'precoVenda',
  'precoCusto',
  'estoqueAtual',
  'ativo',
] as const;

/** `GET /api/compras-estoque/produtos`. Os chips Todos/Produtos/Serviços são o filtro `tipo`. */
export const listProdutosQuerySchema = listQuerySchema({
  sortFields: PRODUTO_SORT_FIELDS,
  defaultSort: 'nome:asc',
  filters: { tipo: z.enum(TIPOS_ITEM, { error: 'Tipo deve ser produto ou servico' }).optional() },
});

export type ListProdutosQuery = z.infer<typeof listProdutosQuerySchema>;

export const PRODUTO_EXPORT_COLUMNS = [
  'nome',
  'tipo',
  'codigo',
  'precoVenda',
  'precoCusto',
  'estoqueAtual',
  'ativo',
] as const;
export type ProdutoExportColumn = (typeof PRODUTO_EXPORT_COLUMNS)[number];

/** `GET /api/compras-estoque/produtos/export`. */
export const exportProdutosQuerySchema = exportQuerySchema(
  listProdutosQuerySchema,
  PRODUTO_EXPORT_COLUMNS,
);

export type ExportProdutosQuery = z.infer<typeof exportProdutosQuerySchema>;

/** Valores numéricos chegam como texto decimal (ex.: `"2274.35"`), exatos como no banco. */
const decimal = z.string();

export const produtoSchema = z.object({
  id: z.uuid(),
  nome: z.string(),
  tipo: z.enum(PRODUTO_TIPOS_BANCO),
  categoriaId: z.uuid().nullable(),
  unidadeMedidaId: z.uuid().nullable(),
  marca: z.string().nullable(),
  codigoBarras: z.string().nullable(),
  sku: z.string().nullable(),
  precoCusto: decimal.nullable(),
  precoVenda: decimal,
  estoqueMinimo: decimal,
  controlaEstoque: z.boolean(),
  estoqueAtual: decimal,
  ncm: z.string().nullable(),
  descricao: z.string().nullable(),
  ativo: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type Produto = z.infer<typeof produtoSchema>;

export const produtoPageSchema = paginatedResponseSchema(produtoSchema);

export type ProdutoPage = z.infer<typeof produtoPageSchema>;

/** Margem (%) = (venda − custo) / venda. `null` sem custo ou sem preço de venda. */
export function calcularMargem(custo: number | null, venda: number | null): number | null {
  if (custo === null || venda === null || venda <= 0) return null;
  return ((venda - custo) / venda) * 100;
}
