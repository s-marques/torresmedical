import { EXPORT_TIME_ZONE } from '../../../common/export/export-values';

const DIA = new Intl.DateTimeFormat('sv-SE', { timeZone: EXPORT_TIME_ZONE });

/** Hoje no fuso da clínica, como `AAAA-MM-DD`. */
export function hojeEmSaoPaulo(agora = new Date()): string {
  return DIA.format(agora);
}
