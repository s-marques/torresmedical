/** `AAAA-MM` → `MM/AAAA`; vazio vira `null` (o item do detalhe mostra "-"). */
export function formatarCompetencia(competencia: string | null): string | null {
  if (!competencia) return null;
  const [ano, mes] = competencia.split('-');
  return `${mes}/${ano}`;
}

/** Centavos inteiros: evita que 0,1 + 0,2 vire uma "diferença" de 0,0000000000000001. */
export const centavos = (valor: number | null | undefined) => Math.round((valor ?? 0) * 100);

/**
 * Diferença (em centavos) entre o valor pago e o saldo do título; juros e desconto são campos à
 * parte. Pagar menos de propósito, com "Pagamento parcial" marcado, não é divergência. Mesma regra
 * da API.
 */
export function divergenciaEmCentavos(
  saldo: number,
  valorPago: number | null | undefined,
  parcial: boolean,
): number {
  const diferenca = centavos(valorPago) - centavos(saldo);
  return parcial && diferenca < 0 ? 0 : diferenca;
}
