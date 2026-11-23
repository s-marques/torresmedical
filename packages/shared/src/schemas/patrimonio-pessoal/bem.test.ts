import { describe, expect, it } from 'vitest';
import '../../zod-pt-br';
import {
  BEM_DESCRICAO_MAX,
  bemSchema,
  createBemSchema,
  exportBensQuerySchema,
  listBensQuerySchema,
  valorDoBem,
} from './bem';

function messages(result: { error?: { issues: { path: PropertyKey[]; message: string }[] } }) {
  return Object.fromEntries(
    (result.error?.issues ?? []).map((i) => [i.path.join('.') || '_', i.message]),
  );
}

describe('createBemSchema', () => {
  it('só a Descrição é obrigatória: o resto fica vazio e o Tipo é Automóvel', () => {
    expect(createBemSchema.parse({ descricao: '  Corolla 2024 ' })).toEqual({
      produtoId: null,
      descricao: 'Corolla 2024',
      tipo: 'AUTOMOVEL',
      valorCompra: null,
      dataAquisicao: null,
      marca: null,
      modelo: null,
      ano: null,
      placa: null,
      renavam: null,
      financiado: false,
      possuiSeguro: false,
    });
  });

  it('"Descrição é obrigatória." com a descrição vazia, em branco ou ausente', () => {
    for (const body of [{ descricao: '' }, { descricao: '   ' }, {}]) {
      expect(messages(createBemSchema.safeParse(body))).toEqual({
        descricao: 'Descrição é obrigatória.',
      });
    }
  });

  it('campos vazios do formulário viram null', () => {
    const resultado = createBemSchema.parse({
      descricao: 'Carro',
      marca: '  ',
      placa: '',
      dataAquisicao: '',
      valorCompra: null,
      produtoId: null,
    });
    expect(resultado).toMatchObject({
      marca: null,
      placa: null,
      dataAquisicao: null,
      valorCompra: null,
    });
  });

  it('rejeita tipo, valor negativo, data, ano e produto inválidos e campos desconhecidos', () => {
    expect(
      Object.keys(
        messages(
          createBemSchema.safeParse({
            descricao: 'X',
            tipo: 'NAVIO',
            valorCompra: -1,
            dataAquisicao: '2024-02-31',
            ano: 1.5,
            produtoId: 'abc',
            valorAtual: 1,
          }),
        ),
      ).sort(),
    ).toEqual(['_', 'ano', 'dataAquisicao', 'produtoId', 'tipo', 'valorCompra']);
  });

  it('limita o tamanho da descrição', () => {
    const longa = 'a'.repeat(BEM_DESCRICAO_MAX + 1);
    expect(Object.keys(messages(createBemSchema.safeParse({ descricao: longa })))).toEqual([
      'descricao',
    ]);
  });
});

describe('listBensQuerySchema e exportBensQuerySchema', () => {
  it('padrão: descrição crescente, página 1 e 10 por página', () => {
    expect(listBensQuerySchema.parse({})).toMatchObject({
      page: 1,
      pageSize: 10,
      sort: { field: 'descricao', direction: 'asc' },
    });
  });

  it('aceita o filtro tipo e só as colunas ordenáveis', () => {
    expect(listBensQuerySchema.parse({ tipo: 'BEM_MOVEL' }).tipo).toBe('BEM_MOVEL');
    expect(listBensQuerySchema.safeParse({ tipo: 'NAVIO' }).success).toBe(false);
    expect(listBensQuerySchema.safeParse({ sort: 'impostosPendentes:asc' }).success).toBe(false);
    expect(listBensQuerySchema.safeParse({ sort: 'dataAquisicao:desc' }).success).toBe(true);
  });

  it('exportação: colunas do grid e nenhuma fora dele', () => {
    expect(
      exportBensQuerySchema.safeParse({ format: 'xlsx', columns: 'descricao,impostosPendentes' })
        .success,
    ).toBe(true);
    expect(exportBensQuerySchema.safeParse({ format: 'xlsx', columns: 'marca' }).success).toBe(
      false,
    );
  });
});

describe('bemSchema e valorDoBem', () => {
  it('valida a resposta da API', () => {
    const resposta = {
      id: '0b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e62',
      produtoId: null,
      descricao: 'Carro',
      tipo: 'AUTOMOVEL',
      valorCompra: 100,
      valorAtual: null,
      dataAquisicao: '2024-05-20',
      marca: null,
      modelo: null,
      ano: null,
      placa: null,
      renavam: null,
      financiado: false,
      possuiSeguro: false,
      impostosPendentes: 0,
      createdAt: '2026-11-23T12:00:00.000Z',
      updatedAt: '2026-11-23T12:00:00.000Z',
    };
    expect(bemSchema.safeParse(resposta).success).toBe(true);
  });

  it('valor do bem: o atual, ou o de compra, ou 0', () => {
    expect(valorDoBem({ valorAtual: 5, valorCompra: 9 })).toBe(5);
    expect(valorDoBem({ valorAtual: null, valorCompra: 9 })).toBe(9);
    expect(valorDoBem({ valorAtual: null, valorCompra: null })).toBe(0);
  });
});
