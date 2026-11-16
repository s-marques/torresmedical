import {
  ROTULO_ESTOQUE_STATUS,
  ROTULO_PRIORIDADE_SUGESTAO,
  ROTULO_TIPO_MOVIMENTACAO,
  type MovimentacaoEstoque,
  type PosicaoEstoque,
  type SugestaoCompra,
} from '@torres/shared';
import type { ColunaGrid } from '@/components/shared/data-grid/tipos';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { formatarData, formatarDataHora } from '@/lib/formatar';
import { CelulaProduto } from './CelulaProduto';
import { formatarQuantidade, formatarValor } from './formatar';
import { TOM_PRIORIDADE, TOM_STATUS_ESTOQUE, TOM_TIPO_MOVIMENTACAO } from './opcoes';

const NUMERO = 'text-right tabular-nums';

/** Aba Posição (print principal da tela). */
export const COLUNAS_POSICAO: ColunaGrid<PosicaoEstoque>[] = [
  {
    id: 'produto',
    titulo: 'Produto',
    ordenavel: true,
    ocultavel: false,
    celula: (p) => <span className="font-medium">{p.nome}</span>,
  },
  { id: 'descricao', titulo: 'Descrição' },
  { id: 'sku', titulo: 'SKU', ordenavel: true },
  { id: 'categoria', titulo: 'Categoria', ordenavel: true, celula: (p) => p.categoriaNome ?? '-' },
  {
    id: 'estoqueAtual',
    titulo: 'Estoque Atual',
    ordenavel: true,
    className: NUMERO,
    celula: (p) => formatarQuantidade(p.estoqueAtual),
  },
  {
    id: 'estoqueMinimo',
    titulo: 'Mínimo',
    ordenavel: true,
    className: NUMERO,
    celula: (p) => formatarQuantidade(p.estoqueMinimo),
  },
  {
    id: 'status',
    titulo: 'Status',
    celula: (p) => (
      <StatusBadge tom={TOM_STATUS_ESTOQUE[p.status]}>
        {ROTULO_ESTOQUE_STATUS[p.status]}
      </StatusBadge>
    ),
  },
  {
    id: 'valorEstoque',
    titulo: 'Valor Estoque',
    className: NUMERO,
    celula: (p) => formatarValor(p.valorEstoque),
  },
  {
    id: 'ultimaMovimentacao',
    titulo: 'Último Mov.',
    celula: (p) => formatarData(p.ultimaMovimentacao),
  },
];

/** Quantidade com sinal no ajuste (a direção vem dos saldos). */
function quantidadeMovimentacao(m: MovimentacaoEstoque): string {
  const qtd = formatarQuantidade(m.quantidade);
  if (m.tipo !== 'AJUSTE' || m.saldoAnterior === null || m.saldoPosterior === null) return qtd;
  return Number(m.saldoPosterior) >= Number(m.saldoAnterior) ? `+${qtd}` : `-${qtd}`;
}

/** Aba Movimentações (print `compras-estoque-estoque--movimentacoes.jpg`). */
export const COLUNAS_MOVIMENTACOES: ColunaGrid<MovimentacaoEstoque>[] = [
  { id: 'data', titulo: 'Data', ordenavel: true, celula: (m) => formatarDataHora(m.data) },
  {
    id: 'produto',
    titulo: 'Produto',
    ordenavel: true,
    ocultavel: false,
    celula: (m) => <CelulaProduto nome={m.produtoNome} sku={m.produtoSku} />,
  },
  {
    id: 'tipo',
    titulo: 'Tipo',
    ordenavel: true,
    celula: (m) => (
      <StatusBadge tom={TOM_TIPO_MOVIMENTACAO[m.tipo]}>
        {ROTULO_TIPO_MOVIMENTACAO[m.tipo]}
      </StatusBadge>
    ),
  },
  {
    id: 'quantidade',
    titulo: 'Quantidade',
    ordenavel: true,
    className: NUMERO,
    celula: quantidadeMovimentacao,
  },
  { id: 'motivo', titulo: 'Motivo' },
  { id: 'documento', titulo: 'Documento' },
  { id: 'lote', titulo: 'Lote', oculta: true },
  { id: 'validade', titulo: 'Validade', oculta: true, celula: (m) => formatarData(m.validade) },
  { id: 'fornecedor', titulo: 'Fornecedor', oculta: true, celula: (m) => m.fornecedorNome ?? '-' },
];

/** Aba Sugestão (print `compras-estoque-estoque--sugestao.jpg`), com o nome do produto (C7). */
export const COLUNAS_SUGESTAO: ColunaGrid<SugestaoCompra>[] = [
  {
    id: 'prioridade',
    titulo: 'Prioridade',
    ordenavel: true,
    exportavel: true,
    celula: (s) => (
      <StatusBadge tom={TOM_PRIORIDADE[s.prioridade]}>
        {ROTULO_PRIORIDADE_SUGESTAO[s.prioridade]}
      </StatusBadge>
    ),
  },
  {
    id: 'produto',
    titulo: 'Produto',
    ordenavel: true,
    exportavel: true,
    ocultavel: false,
    celula: (s) => <span className="font-medium">{s.nome}</span>,
  },
  { id: 'sku', titulo: 'SKU', exportavel: true },
  { id: 'categoria', titulo: 'Categoria', exportavel: true, celula: (s) => s.categoriaNome ?? '-' },
  {
    id: 'estoqueAtual',
    titulo: 'Atual',
    ordenavel: true,
    exportavel: true,
    className: NUMERO,
    celula: (s) => formatarQuantidade(s.estoqueAtual),
  },
  {
    id: 'estoqueMinimo',
    titulo: 'Mínimo',
    exportavel: true,
    className: NUMERO,
    celula: (s) => formatarQuantidade(s.estoqueMinimo),
  },
  {
    id: 'qtdSugerida',
    titulo: 'Qtd Sugerida',
    ordenavel: true,
    exportavel: true,
    className: NUMERO,
    celula: (s) => formatarQuantidade(s.qtdSugerida),
  },
  {
    id: 'diasParaAcabar',
    titulo: 'Dias p/ Acabar',
    ordenavel: true,
    exportavel: true,
    className: NUMERO,
    celula: (s) => (s.diasParaAcabar === null ? '-' : `${s.diasParaAcabar}d`),
  },
  {
    id: 'custoUnitario',
    titulo: 'Custo Unit.',
    exportavel: true,
    className: NUMERO,
    celula: (s) => formatarValor(s.custoUnitario),
  },
  {
    id: 'custoTotal',
    titulo: 'Custo Total',
    ordenavel: true,
    exportavel: true,
    className: NUMERO,
    celula: (s) => formatarValor(s.custoTotal),
  },
  {
    id: 'fornecedor',
    titulo: 'Fornecedor',
    exportavel: true,
    celula: (s) => s.fornecedorNome ?? '-',
  },
];
