import {
  agendaMatrizQuerySchema,
  MATRIZ_SITUACOES,
  MATRIZ_TURNOS,
  type AgendaMatrizFiltros,
} from '@torres/shared';

/** Parâmetros da URL que pertencem à matriz (o `modo=matriz` fica à parte). */
const CHAVES = [
  'visao',
  'data',
  'profissionalId',
  'especialidadeId',
  'salaId',
  'turno',
  'situacao',
] as const;

export type ChaveFiltroMatriz = (typeof CHAVES)[number];

/** Valor do parâmetro `modo` que abre a visão Matriz da Agenda. */
export const MODO_MATRIZ = 'matriz';

/** Filtros da URL; parâmetro inválido é descartado em vez de quebrar a tela. */
export function lerFiltrosMatriz(params: URLSearchParams): AgendaMatrizFiltros {
  const bruto: Record<string, string> = {};
  for (const chave of CHAVES) {
    const valor = params.get(chave);
    if (valor) bruto[chave] = valor;
  }
  if (agendaMatrizQuerySchema.safeParse(bruto).success) return bruto as AgendaMatrizFiltros;
  const validos: Record<string, string> = {};
  for (const [chave, valor] of Object.entries(bruto)) {
    if (agendaMatrizQuerySchema.safeParse({ [chave]: valor }).success) validos[chave] = valor;
  }
  return validos as AgendaMatrizFiltros;
}

/** Nova URL com os filtros alterados; valor vazio ou padrão (`semana`) sai da URL. */
export function gravarFiltrosMatriz(
  params: URLSearchParams,
  alteracoes: Partial<Record<ChaveFiltroMatriz, string | null>>,
): URLSearchParams {
  const proximo = new URLSearchParams(params);
  for (const [chave, valor] of Object.entries(alteracoes)) {
    if (!valor || (chave === 'visao' && valor === 'semana')) proximo.delete(chave);
    else proximo.set(chave, valor);
  }
  return proximo;
}

export const TURNOS = MATRIZ_TURNOS;
export const SITUACOES = MATRIZ_SITUACOES;
