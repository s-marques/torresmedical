import { inicioDoDia } from '../../../common/relatorios/periodo';
import { toLocalWallClock } from '../../../common/export/export-values';

export const MINUTO_MS = 60_000;

/** Instante de início a partir do dia e da hora ("HH:MM") no fuso da clínica. */
export function instanteDeInicio(data: string, hora: string): Date {
  const [h = 0, m = 0] = hora.split(':').map(Number);
  return new Date(inicioDoDia(data).getTime() + (h * 60 + m) * MINUTO_MS);
}

/** Dia (`AAAA-MM-DD`) e hora (`HH:MM`) de um instante no fuso da clínica. */
export function dataHoraLocal(instante: Date): { data: string; hora: string } {
  const iso = toLocalWallClock(instante).toISOString();
  return { data: iso.slice(0, 10), hora: iso.slice(11, 16) };
}

/** Minutos desde as 00:00 → "HH:MM" (1440 vira "24:00"). */
export function horaDeMinutos(minutos: number): string {
  const h = String(Math.floor(minutos / 60)).padStart(2, '0');
  const m = String(minutos % 60).padStart(2, '0');
  return `${h}:${m}`;
}
