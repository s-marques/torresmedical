/** Faixa do score, como na Pesquisa NPS: 75+ excelente, 50+ muito bom, 0+ razoável, abaixo disso crítico. */
export function chaveFaixa(score: number): 'excelente' | 'muitoBom' | 'razoavel' | 'critico' {
  if (score >= 75) return 'excelente';
  if (score >= 50) return 'muitoBom';
  if (score >= 0) return 'razoavel';
  return 'critico';
}
