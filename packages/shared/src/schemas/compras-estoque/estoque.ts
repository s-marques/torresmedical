import { z } from 'zod';
import { exportQuerySchema, listQuerySchema } from '../common/list-query';
import { mensagemObrigatoria, textoObrigatorio } from '../common/obrigatorio';
import { paginatedResponseSchema } from '../common/pagination';

/** Cabe em DECIMAL(12,3). */
export const ESTOQUE_QUANTIDADE_MAX = 999_999_999;
/** Cabe em DECIMAL(12,2). */
export const ESTOQUE_VALOR_MAX = 999_999_999;
export const ESTOQUE_LOTE_MAX = 50;
export const ESTOQUE_DOCUMENTO_MAX = 100;
export const ESTOQUE_MOTIVO_AJUSTE_MAX = 500;

// --- Tipos e motivos de movimentação ---

export const TIPOS_MOVIMENTACAO = ['ENTRADA', 'SAIDA', 'AJUSTE'] as const;
export const tipoMovimentacaoSchema = z.enum(TIPOS_MOVIMENTACAO, { error: 'Tipo inválido' });
export type TipoMovimentacao = (typeof TIPOS_MOVIMENTACAO)[number];

export const ROTULO_TIPO_MOVIMENTACAO: Readonly<Record<TipoMovimentacao, string>> = {
  ENTRADA: 'Entrada',
  SAIDA: 'Saída',
  AJUSTE: 'Ajuste',
};

/**
 * Motivos do modal "Entrada Manual". O print só mostra "Compra"; a lista foi confirmada pelo dev
 * na issue #20.
 */
export const MOTIVOS_ENTRADA = ['COMPRA', 'DOACAO', 'DEVOLUCAO', 'BONIFICACAO', 'OUTRO'] as const;
export type MotivoEntrada = (typeof MOTIVOS_ENTRADA)[number];
export const ROTULO_MOTIVO_ENTRADA: Readonly<Record<MotivoEntrada, string>> = {
  COMPRA: 'Compra',
  DOACAO: 'Doação',
  DEVOLUCAO: 'Devolução',
  BONIFICACAO: 'Bonificação',
  OUTRO: 'Outro',
};

/**
 * Motivos do modal "Saída Manual". O print só mostra "Uso Interno"; a lista foi confirmada pelo
 * dev na issue #20.
 */
export const MOTIVOS_SAIDA = [
  'USO_INTERNO',
  'PERDA_AVARIA',
  'VENCIMENTO',
  'DEVOLUCAO_FORNECEDOR',
  'OUTRO',
] as const;
export type MotivoSaida = (typeof MOTIVOS_SAIDA)[number];
export const ROTULO_MOTIVO_SAIDA: Readonly<Record<MotivoSaida, string>> = {
  USO_INTERNO: 'Uso Interno',
  PERDA_AVARIA: 'Perda/Avaria',
  VENCIMENTO: 'Vencimento',
  DEVOLUCAO_FORNECEDOR: 'Devolução ao fornecedor',
  OUTRO: 'Outro',
};

// --- Status da posição ---

/** Chips da aba Posição: Todos (ausente) / OK / Baixo / Zerado. */
export const ESTOQUE_STATUS_FILTRO = ['OK', 'BAIXO', 'ZERADO'] as const;
export const ESTOQUE_STATUS = [...ESTOQUE_STATUS_FILTRO, 'SEM_CONTROLE'] as const;
export type EstoqueStatus = (typeof ESTOQUE_STATUS)[number];

export const ROTULO_ESTOQUE_STATUS: Readonly<Record<EstoqueStatus, string>> = {
  OK: 'OK',
  BAIXO: 'Baixo',
  ZERADO: 'Zerado',
  SEM_CONTROLE: 'Sem Controle',
};

export interface SaldoProduto {
  controlaEstoque: boolean;
  estoqueAtual: number;
  estoqueMinimo: number;
}

/**
 * Status da linha (regra confirmada pelo dev na issue #20): Sem Controle quando o produto não
 * controla estoque; Zerado com saldo ≤ 0; Baixo com mínimo definido e saldo ≤ mínimo; OK no resto.
 */
export function statusEstoque({
  controlaEstoque,
  estoqueAtual,
  estoqueMinimo,
}: SaldoProduto): EstoqueStatus {
  if (!controlaEstoque) return 'SEM_CONTROLE';
  if (estoqueAtual <= 0) return 'ZERADO';
  if (estoqueMinimo > 0 && estoqueAtual <= estoqueMinimo) return 'BAIXO';
  return 'OK';
}

/** Produto que entra em "Abaixo do Mínimo" (card e aba Alertas): mínimo definido e saldo ≤ mínimo. */
export function abaixoDoMinimo({ controlaEstoque, estoqueAtual, estoqueMinimo }: SaldoProduto) {
  return controlaEstoque && estoqueMinimo > 0 && estoqueAtual <= estoqueMinimo;
}

// --- Sugestão de compra ---

/** Janela do consumo médio: saídas dos últimos 90 dias. */
export const SUGESTAO_JANELA_DIAS = 90;
/** Cobertura desejada além do mínimo: 30 dias de consumo. */
export const SUGESTAO_COBERTURA_DIAS = 30;
/** Abaixo disso, prioridade Crítico. */
export const SUGESTAO_DIAS_CRITICO = 7;
/** Abaixo disso, prioridade Urgente. */
export const SUGESTAO_DIAS_URGENTE = 15;

export const PRIORIDADES_SUGESTAO = ['CRITICO', 'URGENTE', 'NORMAL'] as const;
export const prioridadeSugestaoSchema = z.enum(PRIORIDADES_SUGESTAO, {
  error: 'Prioridade inválida',
});
export type PrioridadeSugestao = (typeof PRIORIDADES_SUGESTAO)[number];

export const ROTULO_PRIORIDADE_SUGESTAO: Readonly<Record<PrioridadeSugestao, string>> = {
  CRITICO: 'Crítico',
  URGENTE: 'Urgente',
  NORMAL: 'Normal',
};

export interface CalculoSugestao {
  /** Consumo médio por dia na janela. */
  consumoDiario: number;
  /** `null` sem consumo na janela (não dá para prever). */
  diasParaAcabar: number | null;
  qtdSugerida: number;
  prioridade: PrioridadeSugestao;
}

/**
 * Sugestão de compra pelo consumo médio e pelo estoque mínimo (requisito do cliente, issue #20;
 * fórmula confirmada pelo dev):
 * - consumo diário = saídas na janela de 90 dias ÷ 90;
 * - dias para acabar = saldo ÷ consumo diário;
 * - quantidade sugerida = mínimo + 30 dias de consumo − saldo, arredondada para cima, nunca negativa;
 * - prioridade: Crítico se zerado ou acaba em menos de 7 dias; Urgente se abaixo do mínimo ou
 *   acaba em menos de 15 dias; Normal no resto.
 */
export function calcularSugestao(
  estoqueAtual: number,
  estoqueMinimo: number,
  saidasNaJanela: number,
): CalculoSugestao {
  const consumoDiario = Math.max(0, saidasNaJanela) / SUGESTAO_JANELA_DIAS;
  const diasParaAcabar =
    consumoDiario > 0 ? Math.max(0, Math.floor(estoqueAtual / consumoDiario)) : null;
  const necessidade = estoqueMinimo + SUGESTAO_COBERTURA_DIAS * consumoDiario - estoqueAtual;
  // Arredonda em milésimos antes do teto para não sugerir 1 a mais por erro de ponto flutuante.
  const qtdSugerida = Math.max(0, Math.ceil(Math.round(necessidade * 1000) / 1000));

  let prioridade: PrioridadeSugestao = 'NORMAL';
  if (estoqueAtual <= 0 || (diasParaAcabar !== null && diasParaAcabar < SUGESTAO_DIAS_CRITICO)) {
    prioridade = 'CRITICO';
  } else if (
    (estoqueMinimo > 0 && estoqueAtual <= estoqueMinimo) ||
    (diasParaAcabar !== null && diasParaAcabar < SUGESTAO_DIAS_URGENTE)
  ) {
    prioridade = 'URGENTE';
  }
  return { consumoDiario, diasParaAcabar, qtdSugerida, prioridade };
}

// --- Entradas (formulários) ---

const idObrigatorio = (rotulo: string) =>
  z
    .string({ error: mensagemObrigatoria(rotulo) })
    .min(1, { error: mensagemObrigatoria(rotulo) })
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

const quantidade = z
  .number({ error: mensagemObrigatoria('Quantidade', 'f') })
  .positive({ error: 'A quantidade deve ser maior que zero' })
  .max(ESTOQUE_QUANTIDADE_MAX, { error: 'Quantidade inválida' });

const motivo = <const T extends readonly [string, ...string[]]>(valores: T) =>
  z.enum(valores, { error: mensagemObrigatoria('Motivo') });

/** `POST /api/compras-estoque/estoque/entradas` (modal "Entrada Manual"). */
export const entradaEstoqueSchema = z.strictObject({
  produtoId: idObrigatorio('Produto'),
  quantidade,
  custoUnitario: z
    .number({ error: 'Custo unitário inválido' })
    .min(0, { error: 'O custo unitário não pode ser negativo' })
    .max(ESTOQUE_VALOR_MAX, { error: 'Custo unitário inválido' })
    .nullish()
    .transform((valor) => valor ?? null),
  motivo: motivo(MOTIVOS_ENTRADA),
  lote: textoOpcional('Lote', ESTOQUE_LOTE_MAX),
  validade: z
    .string({ error: 'Validade inválida' })
    .nullish()
    .transform((valor) => valor || null)
    .pipe(z.iso.date({ error: 'Validade inválida' }).nullable()),
  documento: textoOpcional('Documento', ESTOQUE_DOCUMENTO_MAX),
  /** Fornecedor (opcional), pedido no requisito do cliente e confirmado pelo dev na issue #20. */
  fornecedorId: idOpcional('Fornecedor'),
});
export type EntradaEstoqueFormulario = z.input<typeof entradaEstoqueSchema>;
export type EntradaEstoqueInput = z.output<typeof entradaEstoqueSchema>;

/** `POST /api/compras-estoque/estoque/saidas` (modal "Saída Manual"). */
export const saidaEstoqueSchema = z.strictObject({
  produtoId: idObrigatorio('Produto'),
  quantidade,
  motivo: motivo(MOTIVOS_SAIDA),
  documento: textoOpcional('Documento', ESTOQUE_DOCUMENTO_MAX),
});
export type SaidaEstoqueFormulario = z.input<typeof saidaEstoqueSchema>;
export type SaidaEstoqueInput = z.output<typeof saidaEstoqueSchema>;

/** `POST /api/compras-estoque/estoque/ajustes` (aba Ajustes, "Ajuste Individual"). */
export const ajusteEstoqueSchema = z.strictObject({
  produtoId: idObrigatorio('Produto'),
  quantidadeReal: z
    .number({ error: mensagemObrigatoria('Quantidade real', 'f') })
    .min(0, { error: 'A quantidade real não pode ser negativa' })
    .max(ESTOQUE_QUANTIDADE_MAX, { error: 'Quantidade real inválida' }),
  motivo: textoObrigatorio('Motivo', { max: ESTOQUE_MOTIVO_AJUSTE_MAX }),
});
export type AjusteEstoqueFormulario = z.input<typeof ajusteEstoqueSchema>;
export type AjusteEstoqueInput = z.output<typeof ajusteEstoqueSchema>;

// --- Consultas ---

const categoriaFiltro = z.uuid({ error: 'Categoria inválida' }).optional();

const dataFiltro = (rotulo: string) =>
  z
    .string()
    .optional()
    .transform((valor) => valor || undefined)
    .pipe(z.iso.date({ error: `${rotulo} inválida` }).optional());

export const POSICAO_SORT_FIELDS = [
  'produto',
  'sku',
  'categoria',
  'estoqueAtual',
  'estoqueMinimo',
] as const;

/** `GET /api/compras-estoque/estoque/posicao` (aba Posição). */
export const listPosicaoQuerySchema = listQuerySchema({
  sortFields: POSICAO_SORT_FIELDS,
  defaultSort: 'produto:asc',
  filters: {
    status: z.enum(ESTOQUE_STATUS_FILTRO, { error: 'Status inválido' }).optional(),
    categoriaId: categoriaFiltro,
  },
});
export type ListPosicaoQuery = z.infer<typeof listPosicaoQuerySchema>;

export const MOVIMENTACAO_SORT_FIELDS = ['data', 'produto', 'tipo', 'quantidade'] as const;

/** `GET /api/compras-estoque/estoque/movimentacoes` (aba Movimentações). */
export const listMovimentacoesQuerySchema = listQuerySchema({
  sortFields: MOVIMENTACAO_SORT_FIELDS,
  defaultSort: 'data:desc',
  filters: {
    tipo: tipoMovimentacaoSchema.optional(),
    de: dataFiltro('Data inicial'),
    ate: dataFiltro('Data final'),
  },
});
export type ListMovimentacoesQuery = z.infer<typeof listMovimentacoesQuerySchema>;

export const SUGESTAO_SORT_FIELDS = [
  'prioridade',
  'produto',
  'estoqueAtual',
  'qtdSugerida',
  'diasParaAcabar',
  'custoTotal',
] as const;

/** `GET /api/compras-estoque/estoque/sugestao` (aba Sugestão). */
export const listSugestaoQuerySchema = listQuerySchema({
  sortFields: SUGESTAO_SORT_FIELDS,
  defaultSort: 'prioridade:asc',
  filters: {
    prioridade: prioridadeSugestaoSchema.optional(),
    categoriaId: categoriaFiltro,
  },
});
export type ListSugestaoQuery = z.infer<typeof listSugestaoQuerySchema>;

export const SUGESTAO_EXPORT_COLUMNS = [
  'prioridade',
  'produto',
  'sku',
  'categoria',
  'estoqueAtual',
  'estoqueMinimo',
  'qtdSugerida',
  'diasParaAcabar',
  'custoUnitario',
  'custoTotal',
  'fornecedor',
] as const;
export type SugestaoExportColumn = (typeof SUGESTAO_EXPORT_COLUMNS)[number];

/** `GET /api/compras-estoque/estoque/sugestao/export` ("Exportar Excel"). */
export const exportSugestaoQuerySchema = exportQuerySchema(
  listSugestaoQuerySchema,
  SUGESTAO_EXPORT_COLUMNS,
);
export type ExportSugestaoQuery = z.infer<typeof exportSugestaoQuerySchema>;

// --- Respostas ---

/** Quantidades e valores chegam como texto decimal (ex.: `"12.5"`), exatos como no banco. */
const decimal = z.string();

export const posicaoEstoqueSchema = z.object({
  /** Id do produto. */
  id: z.uuid(),
  nome: z.string(),
  descricao: z.string().nullable(),
  sku: z.string().nullable(),
  categoriaNome: z.string().nullable(),
  controlaEstoque: z.boolean(),
  estoqueAtual: decimal,
  estoqueMinimo: decimal,
  status: z.enum(ESTOQUE_STATUS),
  /** Saldo × preço de custo do produto; `null` sem preço de custo. */
  valorEstoque: decimal.nullable(),
  ultimaMovimentacao: z.iso.datetime().nullable(),
});
export type PosicaoEstoque = z.infer<typeof posicaoEstoqueSchema>;

export const posicaoEstoquePageSchema = paginatedResponseSchema(posicaoEstoqueSchema);

export const movimentacaoEstoqueSchema = z.object({
  id: z.uuid(),
  data: z.iso.datetime(),
  tipo: tipoMovimentacaoSchema,
  produtoId: z.uuid(),
  produtoNome: z.string(),
  produtoSku: z.string().nullable(),
  /** Sempre positiva; no ajuste, a direção vem dos saldos anterior e posterior. */
  quantidade: decimal,
  /** `null` nas entradas de compras anteriores ao registro de movimentações. */
  saldoAnterior: decimal.nullable(),
  saldoPosterior: decimal.nullable(),
  motivo: z.string().nullable(),
  documento: z.string().nullable(),
  custoUnitario: decimal.nullable(),
  lote: z.string().nullable(),
  validade: z.iso.date().nullable(),
  fornecedorId: z.uuid().nullable(),
  fornecedorNome: z.string().nullable(),
  compraId: z.uuid().nullable(),
  /** Responsável (usuário que registrou). */
  usuarioId: z.uuid().nullable(),
});
export type MovimentacaoEstoque = z.infer<typeof movimentacaoEstoqueSchema>;

export const movimentacaoEstoquePageSchema = paginatedResponseSchema(movimentacaoEstoqueSchema);

/** Cards do topo da tela. */
export const resumoEstoqueSchema = z.object({
  totalProdutos: z.number().int(),
  controlados: z.number().int(),
  abaixoMinimo: z.number().int(),
  zerados: z.number().int(),
  valorEstoque: decimal,
  /** Dependem do controle de lotes (tela Lotes / Validade, #22): `null` até lá. */
  vencendo30d: z.number().int().nullable(),
  vencidos: z.number().int().nullable(),
  movimentacoes24h: z.number().int(),
});
export type ResumoEstoque = z.infer<typeof resumoEstoqueSchema>;

/** Aba Alertas. "Lotes Vencendo" depende do controle de lotes (#22). */
export const alertasEstoqueSchema = z.object({
  abaixoMinimo: z.array(posicaoEstoqueSchema),
});
export type AlertasEstoque = z.infer<typeof alertasEstoqueSchema>;

export const sugestaoCompraSchema = z.object({
  /** Id do produto. */
  id: z.uuid(),
  nome: z.string(),
  sku: z.string().nullable(),
  categoriaNome: z.string().nullable(),
  prioridade: prioridadeSugestaoSchema,
  estoqueAtual: decimal,
  estoqueMinimo: decimal,
  qtdSugerida: z.number(),
  diasParaAcabar: z.number().int().nullable(),
  /** Custo da última compra recebida ou, sem compra, o preço de custo do produto. */
  custoUnitario: decimal.nullable(),
  custoTotal: decimal.nullable(),
  /** Fornecedor da última compra recebida. */
  fornecedorNome: z.string().nullable(),
});
export type SugestaoCompra = z.infer<typeof sugestaoCompraSchema>;

export const sugestaoCompraPageSchema = paginatedResponseSchema(sugestaoCompraSchema);
