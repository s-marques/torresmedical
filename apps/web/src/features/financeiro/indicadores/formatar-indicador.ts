import type { FormatoIndicador } from '@torres/shared';
import { formatarMoeda } from '@/lib/forms/mascaras';
import { formatoNumero } from '@/lib/i18n';

/** `33.6` → `33,6%` (em português): uma casa decimal, no idioma do usuário. */
export function formatarPercentual(valor: number): string {
  return `${formatoNumero({ minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(valor)}%`;
}

/** Valor com o formato do card; `null` (sem fonte de dados ainda) aparece como "—". */
export function formatarIndicador(valor: number | null, formato: FormatoIndicador): string {
  if (valor === null) return '—';
  if (formato === 'moeda') return formatarMoeda(valor);
  if (formato === 'percentual') return formatarPercentual(valor);
  return formatoNumero({ maximumFractionDigits: 0 }).format(valor);
}
