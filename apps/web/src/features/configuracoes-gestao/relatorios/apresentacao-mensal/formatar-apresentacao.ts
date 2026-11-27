import type { FormatoIndicadorApresentacao } from '@torres/shared';
import { formatarMoeda } from '@/lib/forms/mascaras';
import { formatoData, formatoNumero } from '@/lib/i18n';

const MES = /^(\d{4})-(0[1-9]|1[0-2])$/;

/** Valor com o formato do indicador; `null` (dado indisponível) fica por conta de quem chama. */
export function formatarValorIndicador(
  formato: FormatoIndicadorApresentacao,
  valor: number,
): string {
  if (formato === 'moeda') return formatarMoeda(valor);
  if (formato === 'percentual') {
    return `${formatoNumero({ maximumFractionDigits: 1 }).format(valor)}%`;
  }
  const casas = formato === 'nps' ? 1 : 3;
  return formatoNumero({ maximumFractionDigits: casas }).format(valor);
}

/**
 * Variação com sinal: percentual em moeda e número, diferença em pontos em percentual e NPS.
 * `unidadePontos` é o texto da unidade ("p.p.") no idioma do usuário.
 */
export function formatarVariacao(
  formato: FormatoIndicadorApresentacao,
  variacao: number,
  unidadePontos: string,
): string {
  const numero = formatoNumero({ maximumFractionDigits: 1, signDisplay: 'exceptZero' }).format(
    variacao,
  );
  return formato === 'moeda' || formato === 'numero' ? `${numero}%` : `${numero} ${unidadePontos}`;
}

function dataDoMes(mes: string): Date {
  const [ano = 0, numero = 1] = mes.split('-').map(Number);
  return new Date(Date.UTC(ano, numero - 1, 1));
}

/** `2026-10` → `outubro de 2026`, no idioma do usuário. */
export function mesPorExtenso(mes: string): string {
  return formatoData({ month: 'long', year: 'numeric', timeZone: 'UTC' }).format(dataDoMes(mes));
}

/** `2026-10` → `out. de 26`, para o eixo dos gráficos. */
export function mesCurto(mes: string): string {
  return formatoData({ month: 'short', year: '2-digit', timeZone: 'UTC' }).format(dataDoMes(mes));
}

export const mesValido = (mes: string | null | undefined): mes is string =>
  mes !== null && mes !== undefined && MES.test(mes);

/** Mês anterior ao de hoje (`AAAA-MM`): a reunião mensal revisa o mês já fechado. */
export function mesPadrao(hoje = new Date()): string {
  const anterior = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
  return `${anterior.getFullYear()}-${String(anterior.getMonth() + 1).padStart(2, '0')}`;
}
