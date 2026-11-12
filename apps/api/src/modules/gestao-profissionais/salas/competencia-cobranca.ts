import { EXPORT_TIME_ZONE } from '../../../common/export/export-values';

const DIA_NA_CLINICA = new Intl.DateTimeFormat('en-CA', {
  timeZone: EXPORT_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Mês de competência (`AAAA-MM`) atual no fuso da clínica. */
export function competenciaAtual(agora: Date = new Date()): string {
  return DIA_NA_CLINICA.format(agora).slice(0, 7);
}

/** Último dia do mês de competência (`AAAA-MM`), de 28 a 31. */
function ultimoDiaDoMes(competencia: string): number {
  const [ano = 0, numero = 1] = competencia.split('-').map(Number);
  return new Date(Date.UTC(ano, numero, 0)).getUTCDate();
}

/** Primeiro e último dia (`AAAA-MM-DD`) do mês de competência. */
export function limitesCompetencia(competencia: string): { de: string; ate: string } {
  return { de: `${competencia}-01`, ate: `${competencia}-${String(ultimoDiaDoMes(competencia)).padStart(2, '0')}` };
}

/** Vencimento (`AAAA-MM-DD`) no mês de competência, no dia do contrato (ajustado se o mês for menor). */
export function dataVencimentoDoMes(competencia: string, diaVencimento: number): string {
  const dia = Math.min(diaVencimento, ultimoDiaDoMes(competencia));
  return `${competencia}-${String(dia).padStart(2, '0')}`;
}
