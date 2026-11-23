import { PESQUISA_PROFISSIONAL_DIAS_PRIMEIRA } from '@torres/shared';
import { somarDias } from '../confirmacoes/envio-confirmacao.service';

/** Soma meses a um dia `AAAA-MM-DD`; dia 31 num mês curto cai no último dia do mês. */
export function somarMeses(dia: string, meses: number): string {
  const [ano, mes, diaDoMes] = dia.split('-').map(Number) as [number, number, number];
  const destino = new Date(Date.UTC(ano, mes - 1 + meses, 1));
  const ultimoDia = new Date(
    Date.UTC(destino.getUTCFullYear(), destino.getUTCMonth() + 1, 0),
  ).getUTCDate();
  destino.setUTCDate(Math.min(diaDoMes, ultimoDia));
  return destino.toISOString().slice(0, 10);
}

/**
 * Ciclo da pesquisa que já está devido hoje, ou `null` antes dos 30 dias do início do contrato.
 * `0` é a pesquisa dos 30 dias; `n` (1 em diante) é a n-ésima periódica, a cada
 * `periodicidadeMeses` depois dos 30 dias. Passou mais de um ciclo sem pesquisa (contrato antigo
 * quando o recurso entra, ou serviço parado): vale só o ciclo mais recente, sem mandar as
 * atrasadas.
 */
export function cicloDevido(
  inicioContrato: string,
  hoje: string,
  periodicidadeMeses: number,
): number | null {
  const primeira = somarDias(inicioContrato, PESQUISA_PROFISSIONAL_DIAS_PRIMEIRA);
  if (hoje < primeira) return null;
  let ciclo = 0;
  while (somarMeses(primeira, (ciclo + 1) * periodicidadeMeses) <= hoje) ciclo++;
  return ciclo;
}
