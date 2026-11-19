import { describe, expect, it } from 'vitest';
import { AI_GROWTH_LIMITE_ALTA, aiGrowthPainelSchema, prioridadeAiGrowth } from './ai-growth';

describe('ai-growth', () => {
  it('prioridade: nada é baixa, poucos é média e muitos é alta', () => {
    expect(prioridadeAiGrowth(0)).toBe('BAIXA');
    expect(prioridadeAiGrowth(1)).toBe('MEDIA');
    expect(prioridadeAiGrowth(AI_GROWTH_LIMITE_ALTA - 1)).toBe('MEDIA');
    expect(prioridadeAiGrowth(AI_GROWTH_LIMITE_ALTA)).toBe('ALTA');
  });

  it('o painel vazio é válido', () => {
    expect(
      aiGrowthPainelSchema.safeParse({
        ultimaAnalise: null,
        emAndamento: null,
        insights: [],
        pontosAtencao: 0,
      }).success,
    ).toBe(true);
  });
});
