import { FontesInsightsAiGrowth, type FonteInsightsAiGrowth } from './fontes-insights-ai-growth';

describe('FontesInsightsAiGrowth', () => {
  const fonte = (quantidade: number): FonteInsightsAiGrowth => ({
    coletar: jest.fn().mockResolvedValue([{ tipo: 'FALTAS_RECENTES', quantidade }]),
  });

  it('junta os insights de todas as fontes registradas', async () => {
    const fontes = new FontesInsightsAiGrowth();
    fontes.registrar(fonte(1));
    fontes.registrar(fonte(2));
    const agora = new Date();
    const resultado = await fontes.coletar(agora);
    expect(resultado.map((i) => i.quantidade)).toEqual([1, 2]);
  });

  it('registrar a mesma fonte duas vezes não duplica', async () => {
    const fontes = new FontesInsightsAiGrowth();
    const unica = fonte(1);
    fontes.registrar(unica);
    fontes.registrar(unica);
    expect(await fontes.coletar(new Date())).toHaveLength(1);
  });

  it('sem fontes, devolve lista vazia', async () => {
    expect(await new FontesInsightsAiGrowth().coletar(new Date())).toEqual([]);
  });
});
