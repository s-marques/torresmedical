import { recepcaoStatusNaClinica, type RecepcaoItem } from '@torres/shared';
import { useEffect, useState } from 'react';

const MINUTO_MS = 60_000;

/**
 * Minutos de espera: do horário de chegada até agora (quem ainda espera) ou até a entrada no
 * consultório (quem já foi atendido). `null` sem chegada ou sem entrada ainda.
 */
export function minutosDeEspera(
  item: Pick<RecepcaoItem, 'status' | 'chegadaEm' | 'entradaEm'>,
  agora: number,
): number | null {
  if (!item.chegadaEm) return null;
  const chegada = Date.parse(item.chegadaEm);
  let fim: number;
  if (recepcaoStatusNaClinica(item.status)) fim = agora;
  else if (item.entradaEm) fim = Date.parse(item.entradaEm);
  else return null;
  return Math.max(Math.floor((fim - chegada) / MINUTO_MS), 0);
}

/** 0 → "0 min", 75 → "1 h 15 min". */
export function formatarEspera(minutos: number): string {
  if (minutos < 60) return `${minutos} min`;
  const resto = String(minutos % 60).padStart(2, '0');
  return `${Math.floor(minutos / 60)} h ${resto} min`;
}

/** Relógio que avança sozinho (padrão: a cada 30 s), para o tempo de espera em andamento. */
export function useAgora(intervaloMs = 30_000): number {
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setAgora(Date.now()), intervaloMs);
    return () => clearInterval(id);
  }, [intervaloMs]);
  return agora;
}
