import { formatarMoeda } from '@/lib/forms/mascaras';

const QUANTIDADE = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 });

/** Quantidade decimal da API (ex.: `"12.500"`) como `12,5`. */
export function formatarQuantidade(valor: string | number | null | undefined): string {
  if (valor === null || valor === undefined || valor === '') return '-';
  return QUANTIDADE.format(Number(valor));
}

/** Valor decimal da API (ex.: `"150.00"`) como moeda; vazio vira "-". */
export function formatarValor(valor: string | null | undefined): string {
  return valor === null || valor === undefined ? '-' : formatarMoeda(Number(valor));
}
