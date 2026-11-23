import type {
  AlertaPainel,
  ColunaPainel,
  FormatoPainel,
  KpiPainel,
  MetaVsAtualPainel,
  SecaoPainel,
  TabelaPainel,
  VisualizacaoPainel,
} from '@torres/shared';
import type { OcupacaoPainel } from '../ocupacao/ocupacao.service';
import type { ReceitasEDespesas } from '../../financeiro/indicadores/indicadores.service';

/** Dados reais já disponíveis para o painel. O que depende de módulos ainda não criados vem vazio. */
export interface DadosPainel {
  /** Profissionais ativos (módulo Gestão Profissionais). */
  profissionaisAtivos: number;
  /** Pacientes não excluídos (módulo Comercial / Atendimento). */
  totalPacientes: number;
  /** Receita e despesa do período (módulo Financeiro); só carregado para a aba Financeiro. */
  financeiro: ReceitasEDespesas | null;
  /** Ocupação efetiva (issue #139); só carregada para a aba Ocupação. */
  ocupacao: OcupacaoPainel | null;
}

export type ConstrutorAba = (dados: DadosPainel) => SecaoPainel[];

/** Indicador sem origem de dados ainda: `valor` nulo aparece como "—" na tela. */
export function kpi(
  id: string,
  rotulo: string,
  formato: FormatoPainel,
  valor: number | null = null,
  detalhe: string | null = null,
): KpiPainel {
  return { tipo: 'kpi', id, rotulo, valor, formato, detalhe };
}

export function coluna(
  chave: string,
  rotulo: string,
  formato: FormatoPainel = 'texto',
): ColunaPainel {
  return { chave, rotulo, formato };
}

interface OpcoesTabela {
  linhas?: TabelaPainel['linhas'];
  /** Visualizações oferecidas, além de "tabela" (sempre presente). Padrão: só a tabela. */
  graficos?: Exclude<VisualizacaoPainel, 'tabela'>[];
  padrao?: VisualizacaoPainel;
  largura?: TabelaPainel['largura'];
}

export function tabela(
  id: string,
  titulo: string,
  colunas: ColunaPainel[],
  { linhas = [], graficos = [], padrao = 'tabela', largura = 'cheia' }: OpcoesTabela = {},
): TabelaPainel {
  return {
    tipo: 'tabela',
    id,
    titulo,
    colunas,
    linhas,
    visualizacoes: ['tabela', ...graficos],
    padrao,
    largura,
  };
}

export const TODOS_OS_GRAFICOS: Exclude<VisualizacaoPainel, 'tabela'>[] = [
  'barras',
  'pizza',
  'linha',
];

/** Alerta com lista; só entra na aba quando há itens. */
export function alerta(
  id: string,
  titulo: string,
  descricao: string,
  itens: AlertaPainel['itens'],
): AlertaPainel[] {
  return itens.length > 0 ? [{ tipo: 'alerta', id, titulo, descricao, itens }] : [];
}

export function metaVsAtual(
  id: string,
  titulo: string,
  indicadores: MetaVsAtualPainel['indicadores'],
): MetaVsAtualPainel {
  return { tipo: 'meta-vs-atual', id, titulo, indicadores };
}

export function secao(
  id: string,
  titulo: string | null,
  blocos: SecaoPainel['blocos'],
): SecaoPainel {
  return { id, titulo, blocos };
}
