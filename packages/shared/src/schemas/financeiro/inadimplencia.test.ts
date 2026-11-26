import { describe, expect, it } from 'vitest';
import {
  aplicarVariaveisCobranca,
  DIAS_DO_MARCO,
  faixaDoAtraso,
  MARCOS_COBRANCA,
  MENSAGEM_PADRAO_MARCO,
  updateReguaMarcoSchema,
  VARIAVEIS_COBRANCA,
} from './inadimplencia';

describe('marcos da régua', () => {
  it('são os quatro do requisito: 3 dias antes, no vencimento, 3 e 7 dias depois', () => {
    expect(MARCOS_COBRANCA.map((m) => DIAS_DO_MARCO[m])).toEqual([-3, 0, 3, 7]);
  });

  it('todo texto padrão usa só variáveis conhecidas', () => {
    for (const texto of Object.values(MENSAGEM_PADRAO_MARCO)) {
      const usadas = [...texto.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
      expect(usadas.length).toBeGreaterThan(0);
      for (const variavel of usadas) expect(VARIAVEIS_COBRANCA).toContain(variavel);
    }
  });
});

describe('aplicarVariaveisCobranca', () => {
  const valores = { nome: 'Ana', valor: 'R$ 10,00', vencimento: '26/11/2026', titulo: '#5' };

  it('troca as variáveis, inclusive repetidas', () => {
    expect(aplicarVariaveisCobranca('{nome}, {titulo} de {valor} ({nome})', valores)).toBe(
      'Ana, #5 de R$ 10,00 (Ana)',
    );
  });

  it('deixa como está o que não é variável conhecida', () => {
    expect(aplicarVariaveisCobranca('Oi {nome} {outra}', valores)).toBe('Oi Ana {outra}');
  });
});

describe('faixaDoAtraso', () => {
  it.each([
    [1, 'ATE_30'],
    [30, 'ATE_30'],
    [31, 'DE_31_A_60'],
    [60, 'DE_31_A_60'],
    [61, 'ACIMA_60'],
    [400, 'ACIMA_60'],
  ] as const)('%i dias → %s', (dias, faixa) => {
    expect(faixaDoAtraso(dias)).toBe(faixa);
  });
});

describe('updateReguaMarcoSchema', () => {
  it('aceita alterar só um campo', () => {
    expect(updateReguaMarcoSchema.safeParse({ ativo: false }).success).toBe(true);
  });

  it('exige ao menos um campo', () => {
    expect(updateReguaMarcoSchema.safeParse({}).success).toBe(false);
  });

  it('mensagem vazia é recusada com a mensagem padrão de obrigatório', () => {
    const resultado = updateReguaMarcoSchema.safeParse({ mensagem: '   ' });
    expect(resultado.success).toBe(false);
    expect(resultado.error?.issues[0]?.message).toBe('Mensagem é obrigatória.');
  });

  it('não aceita mudar o marco', () => {
    expect(updateReguaMarcoSchema.safeParse({ marco: 'NO_VENCIMENTO', ativo: true }).success).toBe(
      false,
    );
  });
});
