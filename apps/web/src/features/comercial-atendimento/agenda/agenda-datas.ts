import type { Agendamento } from '@torres/shared';

export type VisaoAgenda = 'semana' | 'dia';

export const DIAS_CURTOS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'] as const;

/** Faixa de horas padrão da grade (print do inventário: 07:00 a 20:00). */
export const HORA_INICIAL_PADRAO = 7;
export const HORA_FINAL_PADRAO = 20;

const MINUTOS_HORA = 60;
const DIA_MS = 86_400_000;

/** `AAAA-MM-DD` → data local (meio-dia, para não mudar de dia no horário de verão). */
export function dataLocal(iso: string): Date {
  const [ano = 0, mes = 1, dia = 1] = iso.split('-').map(Number);
  return new Date(ano, mes - 1, dia, 12);
}

export function paraISO(data: Date): string {
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  const dia = String(data.getDate()).padStart(2, '0');
  return `${data.getFullYear()}-${mes}-${dia}`;
}

export function somarDias(iso: string, dias: number): string {
  return paraISO(new Date(dataLocal(iso).getTime() + dias * DIA_MS));
}

/** Segunda-feira da semana de `iso` (a semana do calendário vai de segunda a domingo). */
export function inicioDaSemana(iso: string): string {
  const dia = dataLocal(iso).getDay();
  return somarDias(iso, dia === 0 ? -6 : 1 - dia);
}

export interface Periodo {
  inicio: string;
  fim: string;
}

export function periodoDaVisao(iso: string, visao: VisaoAgenda): Periodo {
  if (visao === 'dia') return { inicio: iso, fim: iso };
  const inicio = inicioDaSemana(iso);
  return { inicio, fim: somarDias(inicio, 6) };
}

export function diasDoPeriodo({ inicio, fim }: Periodo): string[] {
  const total = Math.round((dataLocal(fim).getTime() - dataLocal(inicio).getTime()) / DIA_MS);
  return Array.from({ length: total + 1 }, (_, i) => somarDias(inicio, i));
}

const SEM_ANO = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short' });
const COM_ANO = new Intl.DateTimeFormat('pt-BR', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});
const DIA_LONGO = new Intl.DateTimeFormat('pt-BR', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});
/** Título ao lado dos botões: `12 de out. — 18 de out. de 2026` (semana) ou `22 de outubro de 2026`. */
export function tituloDoPeriodo(periodo: Periodo, visao: VisaoAgenda): string {
  if (visao === 'dia') return DIA_LONGO.format(dataLocal(periodo.inicio));
  return `${SEM_ANO.format(dataLocal(periodo.inicio))} — ${COM_ANO.format(dataLocal(periodo.fim))}`;
}

const DIAS_LONGOS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'] as const;

/** `Quinta, 22 de out.`: subtítulo das colunas da visão Dia. */
export function rotuloDoDia(iso: string): string {
  const data = dataLocal(iso);
  return `${DIAS_LONGOS[data.getDay()]}, ${SEM_ANO.format(data)}`;
}

/** Hora e minuto locais de um instante ISO, em minutos desde 00:00. */
export function minutosDoDia(inicio: string): number {
  const data = new Date(inicio);
  return data.getHours() * MINUTOS_HORA + data.getMinutes();
}

export function diaLocal(inicio: string): string {
  return paraISO(new Date(inicio));
}

export function formatarHora(minutos: number): string {
  const h = String(Math.floor(minutos / MINUTOS_HORA)).padStart(2, '0');
  const m = String(minutos % MINUTOS_HORA).padStart(2, '0');
  return `${h}:${m}`;
}

export function horaLocal(inicio: string): string {
  return formatarHora(minutosDoDia(inicio));
}

export function faixaDeHoras(agendamentos: readonly Agendamento[]): [number, number] {
  let primeira: number = HORA_INICIAL_PADRAO;
  let ultima: number = HORA_FINAL_PADRAO;
  for (const a of agendamentos) {
    const inicio = minutosDoDia(a.inicio);
    primeira = Math.min(primeira, Math.floor(inicio / MINUTOS_HORA));
    // Um agendamento que atravessa a meia-noite é cortado em 23:59.
    const fim = Math.min(inicio + a.duracaoMinutos, 24 * MINUTOS_HORA);
    ultima = Math.max(ultima, Math.ceil(fim / MINUTOS_HORA) - 1);
  }
  return [primeira, ultima];
}

export interface AgendamentoPosicionado {
  agendamento: Agendamento;
  /** Faixa (coluna) dentro do dia, para agendamentos que se sobrepõem. */
  faixa: number;
  faixas: number;
}

/** Distribui lado a lado os agendamentos que se sobrepõem no mesmo dia. */
export function posicionar(agendamentos: readonly Agendamento[]): AgendamentoPosicionado[] {
  const ordenados = [...agendamentos].sort(
    (a, b) => a.inicio.localeCompare(b.inicio) || a.numero - b.numero,
  );
  const resultado: AgendamentoPosicionado[] = [];
  let grupo: AgendamentoPosicionado[] = [];
  let fimDoGrupo = -1;
  let fimPorFaixa: number[] = [];

  const fecharGrupo = () => {
    for (const item of grupo) item.faixas = fimPorFaixa.length;
    resultado.push(...grupo);
    grupo = [];
    fimPorFaixa = [];
  };

  for (const agendamento of ordenados) {
    const inicio = minutosDoDia(agendamento.inicio);
    const fim = inicio + agendamento.duracaoMinutos;
    if (grupo.length > 0 && inicio >= fimDoGrupo) fecharGrupo();
    let faixa = fimPorFaixa.findIndex((ocupadoAte) => ocupadoAte <= inicio);
    if (faixa === -1) faixa = fimPorFaixa.length;
    fimPorFaixa[faixa] = fim;
    fimDoGrupo = grupo.length === 0 ? fim : Math.max(fimDoGrupo, fim);
    grupo.push({ agendamento, faixa, faixas: 1 });
  }
  fecharGrupo();
  return resultado;
}
