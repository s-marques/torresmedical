import type { LinhaRelatorio, RelatorioResumo, TipoColunaRelatorio } from '@torres/shared';
import { formatarData, formatarDataHora } from '@/lib/formatar';
import { formatarMoeda } from '@/lib/forms/mascaras';
import { formatoNumero, i18next } from '@/lib/i18n';
import type { ColunaGrid } from '../data-grid/tipos';

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
