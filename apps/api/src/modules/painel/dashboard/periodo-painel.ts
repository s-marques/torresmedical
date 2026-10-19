import type { FiltrosPainel } from '@torres/shared';
import { EXPORT_TIME_ZONE } from '../../../common/export/export-values';

const DIA = new Intl.DateTimeFormat('en-CA', {
  timeZone: EXPORT_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Dia de hoje (`AAAA-MM-DD`) no fuso da clínica. */
export function hojeNaClinica(agora: Date = new Date()): string {
  return DIA.format(agora);
}

/** Período De/Até (`AAAA-MM-DD`) dos filtros: o mês escolhido (padrão: o atual) ou o De/Até. */
export function periodoDoPainel(
  filtros: FiltrosPainel,
  agora: Date = new Date(),
): { de: string; ate: string } {
  if (filtros.modo === 'periodo' && filtros.de && filtros.ate) {
    return { de: filtros.de, ate: filtros.ate };
  }
  const mes = filtros.mes ?? hojeNaClinica(agora).slice(0, 7);
  const [ano = 0, numero = 1] = mes.split('-').map(Number);
  const ultimoDia = new Date(Date.UTC(ano, numero, 0)).getUTCDate();
  return { de: `${mes}-01`, ate: `${mes}-${String(ultimoDia).padStart(2, '0')}` };
}
