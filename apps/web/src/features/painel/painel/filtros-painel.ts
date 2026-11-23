import {
  ABAS_PAINEL,
  BASES_PERIODO,
  MATRIZ_TURNOS,
  MODOS_PERIODO,
  type AbaPainel,
  type BasePeriodo,
  type FiltrosPainelInput,
  type MatrizTurno,
  type ModoPeriodo,
} from '@torres/shared';

export const ROTULOS_ABA: Record<AbaPainel, string> = {
  executivo: 'Executivo',
  comercial: 'Comercial',
  ocupacao: 'Ocupação',
  financeiro: 'Financeiro',
  pacientes: 'Pacientes',
};

export const ROTULOS_MODO: Record<ModoPeriodo, string> = { mes: 'Por mês', periodo: 'Por período' };

export const ROTULOS_BASE: Record<BasePeriodo, string> = {
  recebimento: 'Recebimento',
  competencia: 'Competência',
};

/** Meses oferecidos no seletor (o sistema atual lista os últimos 24, do atual para trás). */
export const QUANTIDADE_MESES = 24;

const NOME_MES = new Intl.DateTimeFormat('pt-BR', { month: 'long', timeZone: 'UTC' });

/** `2026-10` → `Outubro de 2026`. */
export function rotuloDoMes(mes: string): string {
  const [ano = 0, numero = 1] = mes.split('-').map(Number);
  const nome = NOME_MES.format(new Date(Date.UTC(ano, numero - 1, 1)));
  return `${nome.charAt(0).toUpperCase()}${nome.slice(1)} de ${ano}`;
}

export function mesDe(data: Date): string {
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}`;
}

export function mesesDisponiveis(hoje = new Date()): string[] {
  return Array.from({ length: QUANTIDADE_MESES }, (_, i) =>
    mesDe(new Date(hoje.getFullYear(), hoje.getMonth() - i, 1)),
  );
}

export interface FiltrosAplicados {
  aba: AbaPainel;
  modo: ModoPeriodo;
  mes: string;
  de: string;
  ate: string;
  base: BasePeriodo;
  /** Filtros da aba Ocupação (issue #139); ausente = sem filtro. */
  salaId?: string;
  profissionalId?: string;
  turno?: MatrizTurno;
  /** Dia da semana: "0" (domingo) a "6" (sábado). */
  diaSemana?: string;
}

/** Campos de filtro da aba Ocupação, guardados na URL. */
export const CAMPOS_OCUPACAO = ['salaId', 'profissionalId', 'turno', 'diaSemana'] as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DIA_SEMANA = /^[0-6]$/;

function escolher<T extends string>(valor: string | null, validos: readonly T[], padrao: T): T {
  return validos.find((v) => v === valor) ?? padrao;
}

/** Filtros e aba guardados na URL (`?aba=&modo=&mes=&de=&ate=&base=`); o que faltar usa o padrão. */
export function filtrosDaUrl(params: URLSearchParams, hoje = new Date()): FiltrosAplicados {
  const mes = params.get('mes');
  const sala = params.get('salaId');
  const profissional = params.get('profissionalId');
  const turno = MATRIZ_TURNOS.find((t) => t === params.get('turno'));
  const dia = params.get('diaSemana');
  return {
    aba: escolher(params.get('aba'), ABAS_PAINEL, 'executivo'),
    modo: escolher(params.get('modo'), MODOS_PERIODO, 'mes'),
    mes: mes && /^\d{4}-(0[1-9]|1[0-2])$/.test(mes) ? mes : mesDe(hoje),
    de: params.get('de') ?? '',
    ate: params.get('ate') ?? '',
    base: escolher(params.get('base'), BASES_PERIODO, 'recebimento'),
    ...(sala && UUID.test(sala) ? { salaId: sala } : {}),
    ...(profissional && UUID.test(profissional) ? { profissionalId: profissional } : {}),
    ...(turno ? { turno } : {}),
    ...(dia && DIA_SEMANA.test(dia) ? { diaSemana: dia } : {}),
  };
}

export function filtrosParaUrl(filtros: FiltrosAplicados): URLSearchParams {
  const params = new URLSearchParams({ aba: filtros.aba, modo: filtros.modo, base: filtros.base });
  if (filtros.modo === 'mes') params.set('mes', filtros.mes);
  else {
    params.set('de', filtros.de);
    params.set('ate', filtros.ate);
  }
  for (const campo of CAMPOS_OCUPACAO) {
    const valor = filtros[campo];
    if (valor) params.set(campo, valor);
  }
  return params;
}

/** Query da API só com o que vale para o modo. */
export function filtrosParaApi(filtros: FiltrosAplicados): FiltrosPainelInput {
  const periodo: FiltrosPainelInput =
    filtros.modo === 'mes'
      ? { modo: 'mes', mes: filtros.mes, base: filtros.base }
      : { modo: 'periodo', de: filtros.de, ate: filtros.ate, base: filtros.base };
  if (filtros.aba !== 'ocupacao') return periodo;
  return {
    ...periodo,
    ...(filtros.salaId ? { salaId: filtros.salaId } : {}),
    ...(filtros.profissionalId ? { profissionalId: filtros.profissionalId } : {}),
    ...(filtros.turno ? { turno: filtros.turno } : {}),
    ...(filtros.diaSemana ? { diaSemana: filtros.diaSemana } : {}),
  };
}
