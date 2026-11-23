import { adicionarDias, type ModoPeriodo } from '@torres/shared';

const DIA_MS = 24 * 60 * 60 * 1000;

function quantidadeDeDias(de: string, ate: string): number {
  return Math.round((Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / DIA_MS) + 1;
}

/** Dias de `de` a `ate` (`AAAA-MM-DD`), inclusive. */
export function diasDoPeriodo(de: string, ate: string): string[] {
  const dias: string[] = [];
  for (let d = de; d <= ate; d = adicionarDias(d, 1)) dias.push(d);
  return dias;
}

/**
 * Período usado na comparação: o mês anterior quando o filtro é "Por mês"; em "Por período", a
 * janela de mesmo tamanho logo antes do período.
 */
export function periodoAnterior(
  de: string,
  ate: string,
  modo: ModoPeriodo,
): { de: string; ate: string } {
  const fimAnterior = adicionarDias(de, -1);
  if (modo === 'mes') return { de: `${fimAnterior.slice(0, 7)}-01`, ate: fimAnterior };
  return { de: adicionarDias(fimAnterior, -(quantidadeDeDias(de, ate) - 1)), ate: fimAnterior };
}
