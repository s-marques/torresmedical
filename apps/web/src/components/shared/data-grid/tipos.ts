import type { LookupEntidade, PaginationMeta, Permissao } from '@torres/shared';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import type { ValidadorResposta } from '@/lib/api/client';
import type { FiltrosLookup } from '@/lib/api/lookups';

/** Coluna do `DataGrid`. Defina o array fora do componente (ou com `useMemo`). */
export interface ColunaGrid<T> {
  /** Identificador da coluna; por padrão também é o campo lido da linha. */
  id: string;
  /** Texto do cabeçalho e do menu "Colunas". */
  titulo: string;
  /** Conteúdo da célula. Padrão: `linha[id]`, com "-" quando vazio. */
  celula?: (linha: T) => ReactNode;
  /** Campo do `sort=campo:asc` (whitelist do schema da listagem). `true` usa o `id`. */
  ordenavel?: boolean | string;
  /** Chave da coluna no `columns=` da exportação. `true` usa o `id`. Padrão: não exporta. */
  exportavel?: boolean | string;
  /** Pode ser ocultada no menu "Colunas". Padrão: `true`. */
  ocultavel?: boolean;
  /** Começa oculta. */
  oculta?: boolean;
  /**
   * No celular cada linha vira um cartão (issue #161). Esta coluna vira o título do cartão; sem
   * nenhuma marcada, vale a primeira coluna visível.
   */
  tituloCartao?: boolean;
  className?: string;
}

export interface OpcaoFiltro {
  valor: string;
  rotulo: string;
}

/** Chips de status (Todos/Ativo/Inativo…). "Todos" é sempre o primeiro e omite o parâmetro. */
export interface FiltroStatus {
  /** Parâmetro da query string. Padrão: `status`. */
  parametro?: string;
  /** Texto do primeiro chip. Padrão: "Todos" (ex.: "Todas" em listas no feminino). */
  rotuloTodos?: string;
  opcoes: readonly OpcaoFiltro[];
}

/**
 * Filtros extras: select (com "Todos"), período De/Até (date inputs), entidade (combobox com busca
 * na API, para listas grandes como produtos) e checkbox (envia `parametro=true` quando marcado).
 */
export type FiltroGrid =
  | {
      tipo: 'select';
      parametro: string;
      rotulo: string;
      opcoes: readonly OpcaoFiltro[];
      /** Texto da opção sem filtro. Padrão: "Todos". */
      rotuloTodos?: string;
    }
  | { tipo: 'periodo'; rotulo: string; parametroDe: string; parametroAte: string }
  | {
      tipo: 'entidade';
      parametro: string;
      /** Rótulo para leitores de tela. */
      rotulo: string;
      entidade: LookupEntidade;
      filtros?: FiltrosLookup;
      /** Texto exibido sem seleção, ex.: "Todos os produtos". */
      rotuloTodos: string;
    }
  | { tipo: 'checkbox'; parametro: string; rotulo: string }
  /** Texto livre com atraso, como a busca, num parâmetro próprio (ex.: só o nome). */
  | { tipo: 'texto'; parametro: string; rotulo: string; placeholder: string };

/** Ação do menu "⋯" de cada linha. Ações destrutivas devem abrir um `ConfirmDialog`. */
export interface AcaoLinha {
  rotulo: string;
  onSelect: () => void;
  icone?: LucideIcon;
  /** Aparece em vermelho. */
  destrutiva?: boolean;
  /** Só aparece com a permissão. */
  permissao?: Permissao;
  /** Aparece, mas não pode ser escolhida (ex.: funcionalidade de outra tela ainda não pronta). */
  desabilitada?: boolean;
}

export interface ExportacaoGrid {
  /** Ex.: `configuracoes-gestao.minha-empresa.exportar`. Sem ela, o botão não aparece. */
  permissao: Permissao;
  /** Padrão: `<url da listagem>/export`. */
  url?: string;
  /** Nome usado se a API não mandar `Content-Disposition`. Padrão: `exportacao`. */
  nomeArquivo?: string;
  /** Valida a query antes de enviar, ex.: `exportUnidadesQuerySchema` (`exportQuerySchema`). */
  schema?: ValidadorConsulta;
}

/** O que o grid usa de um schema Zod de query (`listQuerySchema`/`exportQuerySchema`). */
export interface ValidadorConsulta {
  safeParse(
    dados: unknown,
  ): { success: true } | { success: false; error: { issues: readonly IssueConsulta[] } };
}

interface IssueConsulta {
  path: readonly PropertyKey[];
  message: string;
}

export type RespostaPaginada<T> = {
  data: T[];
  meta: PaginationMeta;
  /** Totais do conjunto inteiro (não só da página), pelo id da coluna. Usados pelo `rodape`. */
  totais?: Readonly<Record<string, unknown>>;
};

export interface DataGridProps<T> {
  /** Listagem no contrato padrão, ex.: `/api/configuracoes-gestao/unidades`. */
  url: string;
  /** Schema da resposta, ex.: `unidadePageSchema` (`paginatedResponseSchema(item)`). */
  schema: ValidadorResposta<RespostaPaginada<T>>;
  /**
   * Schema da query da listagem (`listQuerySchema`), ex.: `listUnidadesQuerySchema`. Parâmetros
   * inválidos na URL (ordenação ou filtro fora da whitelist) são descartados antes da chamada.
   */
  querySchema?: ValidadorConsulta;
  colunas: readonly ColunaGrid<T>[];
  /** Id da linha. Padrão: `linha.id`. Sem id próprio (ex.: relatórios), use o `indice` na página. */
  idLinha?: (linha: T, indice: number) => string;
  /**
   * Parâmetros enviados em toda consulta e exportação, sem controle no grid (ex.: o período
   * De/Até da `ReportPage`). Mudar o valor refaz a consulta.
   */
  consultaFixa?: Readonly<Record<string, string>>;
  /**
   * Refaz a consulta sozinha a cada tantos milissegundos (ex.: a lista do dia da Recepção, que
   * recebe agendamentos de outras estações). Sem valor, só consulta ao mudar o estado do grid.
   */
  atualizacaoMs?: number;
  /** Placeholder da busca textual, ex.: "Buscar usuarios...". `false` esconde a busca. */
  busca?: string | false;
  status?: FiltroStatus;
  filtros?: readonly FiltroGrid[];
  exportacao?: ExportacaoGrid;
  /** Ações do menu "⋯" de cada linha. */
  acoes?: (linha: T) => AcaoLinha[];
  /**
   * Clique (ou Enter) na linha, ex.: abrir o detalhe. Cliques em botões, links e menus dentro da
   * linha não disparam.
   */
  aoClicarLinha?: (linha: T) => void;
  /** Estado vazio, ex.: "Nenhum veiculo encontrado.". Padrão: "Nenhum resultado.". */
  mensagemVazio?: string;
  /** Opções de "Linhas por página". A primeira é o padrão. */
  tamanhosPagina?: readonly number[];
  /**
   * Resumo à direita da barra, com o `meta` da última consulta, ex.:
   * `(meta) => \`${meta.total} atendimento(s)\``.
   */
  resumo?: (meta: PaginationMeta) => ReactNode;
  /**
   * Linha de totais no fim da tabela, a partir de `totais` da resposta (ex.: relatórios). `celulas`
   * devolve o conteúdo por id de coluna; `rotulo` aparece na primeira coluna visível.
   */
  rodape?: {
    rotulo: string;
    celulas: (totais: Readonly<Record<string, unknown>>) => Readonly<Record<string, ReactNode>>;
  };
}
