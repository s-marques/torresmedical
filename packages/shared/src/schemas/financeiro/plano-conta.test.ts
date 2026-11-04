import { describe, expect, it } from 'vitest';
import {
  compararCodigosConta,
  createPlanoContaSchema,
  listPlanoContasQuerySchema,
  updatePlanoContaSchema,
} from './plano-conta';

describe('createPlanoContaSchema', () => {
  it('exige código, tipo e nome', () => {
    const r = createPlanoContaSchema.safeParse({ codigo: ' ', tipo: undefined, nome: '' });
    const mensagens = r.error?.issues.map((i) => i.message);
    expect(mensagens).toEqual([
      'Código é obrigatório.',
      'Tipo é obrigatório.',
      'Nome é obrigatório.',
    ]);
  });

  it('aceita conta raiz sem pai e apara os textos', () => {
    expect(
      createPlanoContaSchema.parse({ codigo: ' 6.1 ', tipo: 'despesa', nome: ' Teste ' }),
    ).toEqual({
      codigo: '6.1',
      tipo: 'despesa',
      nome: 'Teste',
      contaPaiId: null,
    });
  });

  it('rejeita tipo fora da lista e pai inválido', () => {
    expect(createPlanoContaSchema.safeParse({ codigo: '1', tipo: 'x', nome: 'A' }).success).toBe(
      false,
    );
    expect(
      createPlanoContaSchema.safeParse({ codigo: '1', tipo: 'ativo', nome: 'A', contaPaiId: 'abc' })
        .success,
    ).toBe(false);
  });
});

describe('updatePlanoContaSchema', () => {
  it('aceita só o interruptor e rejeita corpo vazio', () => {
    expect(updatePlanoContaSchema.parse({ ativo: false })).toEqual({ ativo: false });
    expect(updatePlanoContaSchema.safeParse({}).success).toBe(false);
  });
});

describe('listPlanoContasQuerySchema', () => {
  it('filtra por tipo e ignora busca vazia', () => {
    expect(listPlanoContasQuerySchema.parse({ tipo: 'receita', search: ' ' })).toEqual({
      tipo: 'receita',
      search: undefined,
    });
    expect(listPlanoContasQuerySchema.safeParse({ tipo: 'x' }).success).toBe(false);
  });
});

describe('compararCodigosConta', () => {
  it('ordena numericamente por segmento, com o pai antes dos filhos', () => {
    const codigos = ['6.1.10', '6.1', '6.1.2', '6', '1.1'];
    expect([...codigos].sort(compararCodigosConta)).toEqual(['1.1', '6', '6.1', '6.1.2', '6.1.10']);
  });
});
