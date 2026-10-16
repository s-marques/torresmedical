import { toLocalWallClock } from '../export/export-values';

const DIA_MS = 24 * 60 * 60 * 1000;

/** Instante das 00:00 do dia `AAAA-MM-DD` no fuso da clínica. */
export function inicioDoDia(data: string): Date {
  const [ano = 0, mes = 1, dia = 1] = data.split('-').map(Number);
  const meiaNoiteUtc = Date.UTC(ano, mes - 1, dia);
  // Diferença entre o relógio local e o UTC nesse instante (ex.: -3 h em São Paulo).
  const deslocamento = toLocalWallClock(new Date(meiaNoiteUtc)).getTime() - meiaNoiteUtc;
  return new Date(meiaNoiteUtc - deslocamento);
}

/** Período De/Até (dias inteiros, inclusive) como intervalo `[gte, lt)` para filtrar `timestamptz`. */
export function intervaloDoPeriodo(de: string, ate: string): { gte: Date; lt: Date } {
  const diaSeguinte = new Date(Date.parse(`${ate}T00:00:00Z`) + DIA_MS).toISOString().slice(0, 10);
  return { gte: inicioDoDia(de), lt: inicioDoDia(diaSeguinte) };
}

/** `2026-10-16` → `16/10/2026`. */
export function formatarDia(data: string): string {
  return data.split('-').reverse().join('/');
}
