import type { FiltroGrid, FiltroStatus, ValidadorConsulta } from './tipos';

/** Opções de "Linhas por página" (padrão do data-table do shadcn/ui, igual ao rodapé dos prints). */
export const TAMANHOS_PAGINA = [10, 20, 30, 40, 50] as const;

/** Atraso da busca ao digitar, para não consultar a API a cada tecla. */
export const BUSCA_DEBOUNCE_MS = 300;

export const PARAMETRO_STATUS = 'status';

/** Estado do grid lido da query string da URL. */
export interface EstadoGrid {
  page: number;
  pageSize: number;
  sort?: string;
  search?: string;
  /** Filtros (chips, selects e períodos) com valor. */
  filtros: Record<string, string>;
}

/** Parâmetros dos filtros do grid, na ordem em que aparecem. */
export function parametrosDosFiltros(
  status: FiltroStatus | undefined,
  filtros: readonly FiltroGrid[] = [],
): string[] {
  const parametros = status ? [status.parametro ?? PARAMETRO_STATUS] : [];
  for (const filtro of filtros) {
    if (filtro.tipo === 'periodo') parametros.push(filtro.parametroDe, filtro.parametroAte);
    else parametros.push(filtro.parametro);
  }
  return parametros;
}

function inteiroPositivo(valor: string | null): number | null {
  if (!valor || !/^\d+$/.test(valor)) return null;
  const numero = Number(valor);
  return numero >= 1 ? numero : null;
}

/**
 * Lê o estado da URL. Página e tamanho inválidos voltam ao padrão; com `querySchema`, os
 * demais parâmetros que ele rejeita (ex.: `sort` fora da whitelist) são descartados.
 */
export function lerEstadoGrid(
  params: URLSearchParams,
  {
    parametros,
    tamanhos,
    querySchema,
  }: {
    parametros: readonly string[];
    tamanhos: readonly number[];
    querySchema?: ValidadorConsulta;
  },
): EstadoGrid {
  const pageSize = inteiroPositivo(params.get('pageSize'));
  const valores: Record<string, string> = {};
  for (const chave of ['sort', 'search', ...parametros]) {
    const valor = params.get(chave)?.trim();
    if (valor) valores[chave] = valor;
  }

  const estado = {
    page: inteiroPositivo(params.get('page')) ?? 1,
    pageSize: pageSize && tamanhos.includes(pageSize) ? pageSize : (tamanhos[0] ?? 10),
  };
  const validacao = querySchema?.safeParse({ ...estado, ...valores });
  if (validacao && !validacao.success) {
    for (const issue of validacao.error.issues) delete valores[String(issue.path[0])];
  }

  const { sort, search, ...filtros } = valores;
  return { ...estado, sort, search, filtros };
}

/** Query da listagem: `page`, `pageSize`, `sort`, `search` e filtros. */
export function consultaDaListagem(estado: EstadoGrid): Record<string, string | number> {
  const { filtros, sort, search, page, pageSize } = estado;
  return {
    page,
    pageSize,
    ...(sort && { sort }),
    ...(search && { search }),
    ...filtros,
  };
}

/** Próxima ordenação ao clicar no cabeçalho: asc → desc → padrão do servidor. */
export function proximaOrdenacao(atual: string | undefined, campo: string): string | undefined {
  if (atual === `${campo}:asc`) return `${campo}:desc`;
  if (atual === `${campo}:desc`) return undefined;
  return `${campo}:asc`;
}

export type DirecaoOrdenacao = 'ascending' | 'descending' | 'none';

export function direcaoOrdenacao(atual: string | undefined, campo: string): DirecaoOrdenacao {
  if (atual === `${campo}:asc`) return 'ascending';
  if (atual === `${campo}:desc`) return 'descending';
  return 'none';
}

/**
 * Aplica mudanças na query string: vazio remove o parâmetro, e qualquer mudança que não seja
 * de página volta para a página 1. Os valores padrão (`page=1`, tamanho padrão) não aparecem.
 */
export function aplicarMudancas(
  params: URLSearchParams,
  mudancas: Readonly<Record<string, string | number | undefined>>,
  tamanhoPadrao: number,
): URLSearchParams {
  const proximo = new URLSearchParams(params);
  if (!('page' in mudancas)) proximo.delete('page');
  for (const [chave, valor] of Object.entries(mudancas)) {
    const texto = valor === undefined ? '' : String(valor).trim();
    const padrao =
      (chave === 'page' && texto === '1') ||
      (chave === 'pageSize' && texto === String(tamanhoPadrao));
    if (texto && !padrao) proximo.set(chave, texto);
    else proximo.delete(chave);
  }
  return proximo;
}
