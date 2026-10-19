import type { FormatoPainel } from '@torres/shared';
import { formatarData } from '@/lib/formatar';

const VAZIO = '—';

const INTEIRO = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
const DECIMAL = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
});
const MOEDA = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

/** Formatos cujo valor é número (os que viram série nos gráficos). */
export function formatoNumerico(formato: FormatoPainel): boolean {
  return ['inteiro', 'decimal', 'moeda', 'percentual', 'dias'].includes(formato);
}

/** Valor da API para exibição. Sem valor (`null`), mostra "—". */
export function formatarValor(
  valor: string | number | null | undefined,
  formato: FormatoPainel,
): string {
  if (valor === null || valor === undefined || valor === '') return VAZIO;
  if (formato === 'data') return formatarData(String(valor));
  if (typeof valor === 'string') return valor;
  switch (formato) {
    case 'moeda':
      return MOEDA.format(valor).replaceAll(' ', ' ');
    case 'percentual':
      return `${DECIMAL.format(valor)}%`;
    case 'decimal':
      return DECIMAL.format(valor);
    case 'dias':
      return `${INTEIRO.format(valor)} ${valor === 1 ? 'dia' : 'dias'}`;
    default:
      return INTEIRO.format(valor);
  }
}
