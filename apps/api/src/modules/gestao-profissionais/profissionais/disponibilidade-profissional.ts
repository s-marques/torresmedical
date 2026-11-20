import {
  BLOQUEIO_MOTIVO_ROTULOS,
  diaDaSemana,
  minutosDoDia,
  type BloqueioAgenda,
  type HorarioAtendimento,
} from '@torres/shared';

/** Por que o profissional não pode atender no intervalo (issue #136). */
export type IndisponibilidadeProfissional =
  | { motivo: 'SEM_HORARIO_CADASTRADO' }
  | { motivo: 'BLOQUEADO'; descricao: string }
  | { motivo: 'FORA_DO_HORARIO' }
  | { motivo: 'NO_ALMOCO' };

/** `null` = disponível. */
export type ResultadoDisponibilidade = IndisponibilidadeProfissional | null;

/** Início do dia seguinte em minutos: um intervalo que passa daqui não cabe em nenhum horário. */
const FIM_DO_DIA = 24 * 60;

/**
 * Horários de atendimento que valem no dia `data` (`AAAA-MM-DD`). Decisão do dev na #136: uma
 * linha "Por Data" para o dia é exceção e substitui o horário semanal daquele dia.
 */
function horariosDoDia(
  horarios: readonly HorarioAtendimento[],
  data: string,
): readonly HorarioAtendimento[] {
  const porData = horarios.filter((h) => h.tipo === 'POR_DATA' && h.data === data);
  if (porData.length > 0) return porData;
  const dia = diaDaSemana(data);
  return horarios.filter((h) => h.tipo === 'SEMANAL' && h.diaSemana === dia);
}

function bloqueioAtinge(b: BloqueioAgenda, inicio: number, fim: number): boolean {
  if (b.tipo === 'DIA_INTEIRO') return true;
  if (b.horaInicio === null || b.horaFim === null) return true;
  return minutosDoDia(b.horaInicio) < fim && inicio < minutosDoDia(b.horaFim);
}

function sobrepoe(deInicio: number, deFim: number, inicio: number, fim: number): boolean {
  return deInicio < fim && inicio < deFim;
}

/**
 * Confere se o profissional atende no intervalo `[inicioMin, fimMin)` (minutos desde as 00:00)
 * do dia `data`, com os horários de atendimento e os bloqueios de agenda dele. Regras confirmadas
 * pelo dev na #136: sem horário cadastrado recusa; o almoço não é atendimento; o intervalo
 * precisa caber inteiro num horário do dia e fora dos bloqueios.
 *
 * `bloqueios` já vêm filtrados para o dia (`dataInicio <= data <= dataFim`).
 */
export function avaliarDisponibilidade(
  horarios: readonly HorarioAtendimento[],
  bloqueios: readonly BloqueioAgenda[],
  data: string,
  inicioMin: number,
  fimMin: number,
): ResultadoDisponibilidade {
  if (horarios.length === 0) return { motivo: 'SEM_HORARIO_CADASTRADO' };

  const bloqueio = bloqueios.find((b) => bloqueioAtinge(b, inicioMin, fimMin));
  if (bloqueio) return { motivo: 'BLOQUEADO', descricao: BLOQUEIO_MOTIVO_ROTULOS[bloqueio.motivo] };

  if (fimMin > FIM_DO_DIA) return { motivo: 'FORA_DO_HORARIO' };
  const cabem = horariosDoDia(horarios, data).filter(
    (h) => minutosDoDia(h.inicio) <= inicioMin && fimMin <= minutosDoDia(h.fim),
  );
  if (cabem.length === 0) return { motivo: 'FORA_DO_HORARIO' };

  const semAlmoco = cabem.some(
    (h) =>
      h.almocoInicio === null ||
      h.almocoFim === null ||
      !sobrepoe(minutosDoDia(h.almocoInicio), minutosDoDia(h.almocoFim), inicioMin, fimMin),
  );
  return semAlmoco ? null : { motivo: 'NO_ALMOCO' };
}
