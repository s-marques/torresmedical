import type { LinhaRelatorio, RelatorioResumo, TipoColunaRelatorio } from '@torres/shared';
import type { ReactNode } from 'react';
import { formatarData, formatarDataHora } from '@/lib/formatar';
import { formatarMoeda } from '@/lib/forms/mascaras';
import { formatoNumero, i18next } from '@/lib/i18n';
import type { ColunaGrid, DataGridProps, FiltroGrid } from '../data-grid/tipos';

const FORMATOS: Readonly<Record<TipoColunaRelatorio, (valor: unknown) => string>> = {
  text: String,
  number: (valor) => formatoNumero().format(Number(valor)),
  // Valores decimais chegam como texto (ex.: "1234.50").
  currency: (valor) => formatarMoeda(Number(valor)),
  date: (valor) => formatarData(String(valor)),
  datetime: (valor) => formatarDataHora(String(valor)),
  boolean: (valor) => i18next.t(valor ? 'comum.sim' : 'comum.nao'),
};

const NUMERICOS: ReadonlySet<TipoColunaRelatorio> = new Set(['number', 'currency']);

/** Valor da célula formatado pelo tipo da coluna, como na exportação. "-" quando vazio. */
export function formatarValorRelatorio(tipo: TipoColunaRelatorio, valor: unknown): string {
  if (valor === null || valor === undefined || valor === '') return '-';
  return FORMATOS[tipo](valor);
}

/** Colunas do `DataGrid` a partir do catálogo da API: todas exportáveis; ordenáveis conforme o relatório. */
export function colunasDoRelatorio(relatorio: RelatorioResumo): ColunaGrid<LinhaRelatorio>[] {
  return relatorio.colunas.map((coluna) => ({
    id: coluna.id,
    titulo: coluna.titulo,
    ordenavel: coluna.ordenavel,
    exportavel: true,
    celula: (linha) => formatarValorRelatorio(coluna.tipo, linha[coluna.id]),
    className: NUMERICOS.has(coluna.tipo) ? 'text-right tabular-nums' : undefined,
  }));
}

/** Filtros extras do `DataGrid` a partir do catálogo; `rotuloTodos` é o texto da opção sem filtro. */
export function filtrosDoRelatorio(relatorio: RelatorioResumo, rotuloTodos: string): FiltroGrid[] {
  return relatorio.filtros.map((filtro) =>
    filtro.tipo === 'entidade' ? { ...filtro, rotuloTodos } : filtro,
  );
}

/** Rodapé de totais: só relatórios que têm colunas somadas mandam `totais` na resposta. */
export function rodapeDoRelatorio(
  relatorio: RelatorioResumo,
  rotulo: string,
): DataGridProps<LinhaRelatorio>['rodape'] {
  const tipos = new Map(relatorio.colunas.map((coluna) => [coluna.id, coluna.tipo]));
  return {
    rotulo,
    celulas: (totais) =>
      Object.fromEntries(
        Object.entries(totais).map(([id, valor]): [string, ReactNode] => [
          id,
          formatarValorRelatorio(tipos.get(id) ?? 'text', valor),
        ]),
      ),
  };
}
