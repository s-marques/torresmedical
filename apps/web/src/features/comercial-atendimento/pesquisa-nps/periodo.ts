import { NPS_PERIODO_PADRAO_DIAS } from '@torres/shared';

/** Data local como `AAAA-MM-DD` (valor do `<input type="date">`). */
export function diaIso(data: Date): string {
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  const dia = String(data.getDate()).padStart(2, '0');
  return `${data.getFullYear()}-${mes}-${dia}`;
}

/** Período inicial: De = hoje menos 30 dias, Até = hoje. */
export function periodoPadrao(agora = new Date()): { de: string; ate: string } {
  const de = new Date(agora);
  de.setDate(de.getDate() - NPS_PERIODO_PADRAO_DIAS);
  return { de: diaIso(de), ate: diaIso(agora) };
}

const DATA_HORA = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export function formatarDataHora(valor: string): string {
  return DATA_HORA.format(new Date(valor)).replace(',', '');
}
