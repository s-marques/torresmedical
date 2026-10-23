import { PROFISSIONAL_CORES, type AgendaProfissional, type Agendamento } from '@torres/shared';
import type { ReactNode } from 'react';
import { DIAS_CURTOS, dataLocal, diaLocal, rotuloDoDia } from './agenda-datas';

export interface ColunaCalendario {
  chave: string;
  /** Agendamentos da coluna. */
  agendamentos: Agendamento[];
  cabecalho: ReactNode;
  destaque?: boolean;
}

/** Colunas da visão Semana: um dia por coluna, com a contagem "N agend.". */
export function colunasDaSemana(
  dias: readonly string[],
  agendamentos: readonly Agendamento[],
  hoje: string,
): ColunaCalendario[] {
  return dias.map((dia) => {
    const doDia = agendamentos.filter((a) => diaLocal(a.inicio) === dia);
    const data = dataLocal(dia);
    return {
      chave: dia,
      agendamentos: doDia,
      destaque: dia === hoje,
      cabecalho: (
        <>
          <span className="text-xs">{DIAS_CURTOS[data.getDay()]}</span>
          <span className="text-lg font-semibold">{data.getDate()}</span>
          <span className="text-muted-foreground text-xs">{doDia.length} agend.</span>
        </>
      ),
    };
  });
}

/** Colunas da visão Dia: um profissional por coluna, com a cor do calendário no cabeçalho. */
export function colunasDoDia(
  dia: string,
  profissionais: readonly AgendaProfissional[],
  agendamentos: readonly Agendamento[],
): ColunaCalendario[] {
  return profissionais.map((profissional) => ({
    chave: profissional.id,
    agendamentos: agendamentos.filter((a) => a.profissionalId === profissional.id),
    cabecalho: (
      <>
        <span
          className="-mx-1 -mt-1 w-[calc(100%+0.5rem)] rounded-t px-2 py-1.5 text-center text-xs font-bold text-white uppercase"
          style={{ backgroundColor: PROFISSIONAL_CORES[profissional.cor].hex }}
        >
          {profissional.nome}
        </span>
        <span className="text-muted-foreground text-xs">{rotuloDoDia(dia)}</span>
      </>
    ),
  }));
}
