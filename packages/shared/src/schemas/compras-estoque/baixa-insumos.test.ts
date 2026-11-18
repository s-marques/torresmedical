import { describe, expect, it } from 'vitest';
import { baixaInsumoInputSchema, listBaixasInsumosQuerySchema } from './baixa-insumos';

const PRODUTO = '2d9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const OUTRO = '3e0d2a8f-2b3c-4d4e-9fa0-1b2c3d4e5f60';

const mensagens = (entrada: unknown) => {
  const r = baixaInsumoInputSchema.safeParse(entrada);
  return r.success ? [] : r.error.issues.map((i) => [i.path.join('.'), i.message]);
};

describe('baixaInsumoInputSchema', () => {
  it('aceita só os insumos; paciente, profissional, unidade e textos viram null', () => {
    const r = baixaInsumoInputSchema.parse({ itens: [{ produtoId: PRODUTO, quantidade: 2 }] });
    expect(r).toMatchObject({
      pacienteId: null,
      profissionalId: null,
      unidadeId: null,
      pressaoArterial: null,
      dextro: null,
      observacao: null,
    });
  });

  it('exige ao menos um insumo', () => {
    expect(mensagens({})).toContainEqual(['itens', 'Selecione ao menos um insumo.']);
    expect(mensagens({ itens: [] })).toContainEqual(['itens', 'Selecione ao menos um insumo.']);
  });

  it('quantidade obrigatória, inteira e maior que zero', () => {
    const itens = (quantidade: unknown) => [{ produtoId: PRODUTO, quantidade }];
    expect(mensagens({ itens: itens(null) })).toContainEqual([
      'itens.0.quantidade',
      'Quantidade é obrigatória.',
    ]);
    expect(mensagens({ itens: itens(0) })).toContainEqual([
      'itens.0.quantidade',
      'A quantidade deve ser maior que zero',
    ]);
    expect(mensagens({ itens: itens(1.5) })).toContainEqual([
      'itens.0.quantidade',
      'A quantidade deve ser um número inteiro',
    ]);
  });

  it('recusa insumo repetido e insumo vazio', () => {
    expect(
      mensagens({
        itens: [
          { produtoId: PRODUTO, quantidade: 1 },
          { produtoId: PRODUTO, quantidade: 2 },
        ],
      }),
    ).toContainEqual(['itens', 'Há insumos repetidos. Some as quantidades em uma só linha.']);
    expect(mensagens({ itens: [{ produtoId: '', quantidade: 1 }] })).toContainEqual([
      'itens.0.produtoId',
      'Insumo é obrigatório.',
    ]);
    expect(
      baixaInsumoInputSchema.safeParse({
        itens: [
          { produtoId: PRODUTO, quantidade: 1 },
          { produtoId: OUTRO, quantidade: 2 },
        ],
      }).success,
    ).toBe(true);
  });

  it('limita o tamanho de pressão, dextro e observação', () => {
    const itens = [{ produtoId: PRODUTO, quantidade: 1 }];
    expect(mensagens({ itens, dextro: 'x'.repeat(51) })).toContainEqual([
      'dextro',
      'Dextro (Glicemia) deve ter no máximo 50 caracteres',
    ]);
  });
});

describe('listBaixasInsumosQuerySchema', () => {
  it('ordena pela data mais recente por padrão e aceita o período', () => {
    const q = listBaixasInsumosQuerySchema.parse({ dataInicio: '2026-11-01', dataFim: '' });
    expect(q.sort).toEqual({ field: 'data', direction: 'desc' });
    expect(q.dataInicio).toBe('2026-11-01');
    expect(q.dataFim).toBeUndefined();
  });

  it('recusa data inválida', () => {
    expect(listBaixasInsumosQuerySchema.safeParse({ dataFim: 'abc' }).success).toBe(false);
  });
});
