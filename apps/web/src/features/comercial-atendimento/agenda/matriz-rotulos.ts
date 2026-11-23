import type { AgendaMatrizColuna, MatrizStatus } from '@torres/shared';
import type { TFunction } from 'i18next';

/** Rótulo traduzido do status; os tipos de bloqueio usam os textos da tela Salas (#138). */
export function rotuloStatusMatriz(t: TFunction, status: MatrizStatus): string {
  switch (status) {
    case 'DISPONIVEL':
    case 'CONTRATADO':
    case 'AGENDADO':
      return t(`agenda.matriz.status.${status}`);
    default:
      return t(`salasBloqueios.tipos.${status}`);
  }
}

/** Hora sugerida ao agendar numa célula de turno (a hora cheia na visão Dia). */
const HORA_DO_TURNO = { MANHA: '08:00', TARDE: '12:00', NOITE: '18:00' } as const;

/** Hora inicial do agendamento aberto a partir da célula. */
export function horaParaAgendar(coluna: AgendaMatrizColuna): string {
  return /^\d{2}:\d{2}$/.test(coluna.chave) ? coluna.chave : HORA_DO_TURNO[coluna.turno];
}
