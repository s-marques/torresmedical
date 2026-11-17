import { toLocalWallClock } from '../../../common/export/export-values';

/** O instante e a leitura dele no relógio da clínica (America/Sao_Paulo). */
export interface AgoraClinica {
  instante: Date;
  /** `AAAA-MM-DD`. */
  dia: string;
  /** `HH:MM`. */
  hora: string;
  /** 0 = domingo … 6 = sábado. */
  diaSemana: number;
  mes: number;
  diaDoMes: number;
}

export function agoraNaClinica(instante = new Date()): AgoraClinica {
  const parede = toLocalWallClock(instante);
  const iso = parede.toISOString();
  return {
    instante,
    dia: iso.slice(0, 10),
    hora: iso.slice(11, 16),
    diaSemana: parede.getUTCDay(),
    mes: parede.getUTCMonth() + 1,
    diaDoMes: parede.getUTCDate(),
  };
}

/** `AAAA-MM-DD` como valor de coluna `@db.Date`. */
export const paraColunaData = (dia: string): Date => new Date(`${dia}T00:00:00.000Z`);

/** Data da compra para a variável `{ultima_compra}`: `dd/mm/aaaa` no fuso da clínica. */
export function formatarDiaClinica(instante: Date): string {
  return toLocalWallClock(instante).toISOString().slice(0, 10).split('-').reverse().join('/');
}
