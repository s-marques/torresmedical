import type { ContaReceber } from '@torres/shared';

/** Baixar e renegociar valem para a conta com saldo em aberto (A vencer, Vencida ou Parcial). */
export function contaComSaldoEmAberto(conta: Pick<ContaReceber, 'status'>): boolean {
  return conta.status === 'PENDENTE' || conta.status === 'PARCIAL';
}

/** A baixa só pode ser cancelada enquanto a conta não foi cancelada nem renegociada. */
export function contaComBaixaCancelavel(
  conta: Pick<ContaReceber, 'status' | 'valorRecebido'>,
): boolean {
  return (
    conta.status !== 'CANCELADO' &&
    conta.status !== 'RENEGOCIADO' &&
    Number(conta.valorRecebido) > 0
  );
}

/** Diferença entre o saldo e as parcelas, em centavos (evita erro de ponto flutuante). */
export function diferencaEmCentavos(saldo: number, valores: readonly unknown[]): number {
  const soma = valores.reduce<number>((total, v) => total + Math.round((Number(v) || 0) * 100), 0);
  return Math.round(saldo * 100) - soma;
}
