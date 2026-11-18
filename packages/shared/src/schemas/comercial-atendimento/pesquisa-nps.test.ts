import { describe, expect, it } from 'vitest';
import {
  aplicarVariaveisNps,
  calcularScoreNps,
  classificarNota,
  faixaDoScore,
  listPesquisasNpsQuerySchema,
  percentual,
  respostaNpsInputSchema,
} from './pesquisa-nps';

describe('classificarNota', () => {
  it.each([
    [0, 'DETRATOR'],
    [6, 'DETRATOR'],
    [7, 'NEUTRO'],
    [8, 'NEUTRO'],
    [9, 'PROMOTOR'],
    [10, 'PROMOTOR'],
  ])('nota %i é %s', (nota, esperado) => {
    expect(classificarNota(nota)).toBe(esperado);
  });
});

describe('calcularScoreNps', () => {
  it('é 0 sem avaliações', () => {
    expect(calcularScoreNps({ promotores: 0, neutros: 0, detratores: 0 })).toBe(0);
  });

  it('subtrai % de detratores de % de promotores', () => {
    // 6 promotores, 2 neutros, 2 detratores em 10: 60% − 20% = 40.
    expect(calcularScoreNps({ promotores: 6, neutros: 2, detratores: 2 })).toBe(40);
  });

  it('chega a −100 e a 100', () => {
    expect(calcularScoreNps({ promotores: 0, neutros: 0, detratores: 3 })).toBe(-100);
    expect(calcularScoreNps({ promotores: 3, neutros: 0, detratores: 0 })).toBe(100);
  });

  it('arredonda', () => {
    // (2 − 1) / 3 = 33,33…
    expect(calcularScoreNps({ promotores: 2, neutros: 0, detratores: 1 })).toBe(33);
  });
});

describe('percentual e faixaDoScore', () => {
  it('percentual evita divisão por zero', () => {
    expect(percentual(0, 0)).toBe(0);
    expect(percentual(1, 3)).toBe(33);
  });

  it('nomeia as faixas do score', () => {
    expect(faixaDoScore(0)).toBe('Razoavel');
    expect(faixaDoScore(49)).toBe('Razoavel');
    expect(faixaDoScore(50)).toBe('Muito bom');
    expect(faixaDoScore(75)).toBe('Excelente');
    expect(faixaDoScore(-1)).toBe('Critico');
  });
});

describe('respostaNpsInputSchema', () => {
  const mensagem = (r: { error?: { issues: { message: string }[] } }) =>
    r.error?.issues[0]?.message;

  it('aceita de 0 a 10', () => {
    expect(respostaNpsInputSchema.safeParse({ nota: 0 }).success).toBe(true);
    expect(respostaNpsInputSchema.safeParse({ nota: 10, comentario: ' ótimo ' }).data).toEqual({
      nota: 10,
      comentario: 'ótimo',
    });
  });

  it('recusa nota fora da faixa, quebrada ou ausente', () => {
    expect(mensagem(respostaNpsInputSchema.safeParse({ nota: 11 }))).toBe(
      'A nota deve estar entre 0 e 10',
    );
    expect(mensagem(respostaNpsInputSchema.safeParse({ nota: -1 }))).toBe(
      'A nota deve estar entre 0 e 10',
    );
    expect(mensagem(respostaNpsInputSchema.safeParse({ nota: 7.5 }))).toBe(
      'A nota deve ser um número inteiro',
    );
    expect(mensagem(respostaNpsInputSchema.safeParse({}))).toBe('A nota é obrigatória.');
  });
});

describe('listPesquisasNpsQuerySchema', () => {
  it('ordena pela mais recente e aceita o período', () => {
    const q = listPesquisasNpsQuerySchema.parse({ de: '2026-06-01', ate: '2026-06-30' });
    expect(q.sort).toEqual({ field: 'enviadaEm', direction: 'desc' });
    expect(q.de).toBe('2026-06-01');
  });

  it('recusa data inválida e classificação desconhecida', () => {
    expect(listPesquisasNpsQuerySchema.safeParse({ de: '01/06/2026' }).success).toBe(false);
    expect(listPesquisasNpsQuerySchema.safeParse({ classificacao: 'X' }).success).toBe(false);
  });
});

describe('aplicarVariaveisNps', () => {
  it('troca nome e profissional', () => {
    expect(
      aplicarVariaveisNps('{nome} / {profissional}', { nome: 'Ana', profissional: 'Dr. B' }),
    ).toBe('Ana / Dr. B');
  });
});
