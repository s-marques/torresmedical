import { describe, expect, it } from 'vitest';
import {
  createProtocoloSchema,
  listProtocolosQuerySchema,
  sessoesDoProtocolo,
  valorPorSemana,
} from './protocolo';

const PRODUTO = '00000000-0000-4000-8000-0000000000b1';
const OUTRO = '00000000-0000-4000-8000-0000000000b2';

describe('createProtocoloSchema', () => {
  it('aplica os padrões do modal e normaliza vazios', () => {
    expect(createProtocoloSchema.parse({ nome: '  Limpeza de pele ', categoria: '' })).toEqual({
      nome: 'Limpeza de pele',
      tipo: 'procedimento',
      categoria: 'Geral',
      profissionalId: null,
      totalSemanas: 1,
      valorTotal: 0,
      observacoes: null,
      itens: [],
    });
  });

  it('nome é obrigatório, com a mensagem padrão', () => {
    for (const nome of [undefined, '', '   ']) {
      const resultado = createProtocoloSchema.safeParse({ nome });
      expect(resultado.error?.issues.map((i) => [i.path[0], i.message])).toEqual([
        ['nome', 'Nome é obrigatório.'],
      ]);
    }
  });

  it('valida valor, semanas e itens', () => {
    const resultado = createProtocoloSchema.safeParse({
      nome: 'X',
      valorTotal: -1,
      totalSemanas: 0,
      itens: [{ produtoId: PRODUTO, quantidade: 0 }],
    });
    expect(resultado.error?.issues.map((i) => i.message)).toEqual(
      expect.arrayContaining([
        'O valor não pode ser negativo',
        'O total de semanas deve ser de pelo menos 1',
        'A quantidade deve ser de pelo menos 1',
      ]),
    );
  });

  it('recusa produto repetido na composição', () => {
    const resultado = createProtocoloSchema.safeParse({
      nome: 'X',
      itens: [
        { produtoId: PRODUTO, quantidade: 1 },
        { produtoId: PRODUTO, quantidade: 2 },
      ],
    });
    expect(resultado.error?.issues[0]?.message).toBe(
      'Há produtos/serviços repetidos na composição',
    );
    expect(
      createProtocoloSchema.safeParse({
        nome: 'X',
        itens: [
          { produtoId: PRODUTO, quantidade: 1 },
          { produtoId: OUTRO, quantidade: 2 },
        ],
      }).success,
    ).toBe(true);
  });
});

describe('listProtocolosQuerySchema', () => {
  it('aceita filtros e ordena por nome por padrão', () => {
    const query = listProtocolosQuerySchema.parse({ categoria: ' Estética ', search: 'pele' });
    expect(query).toMatchObject({ categoria: 'Estética', search: 'pele' });
    expect(query.sort).toEqual({ field: 'nome', direction: 'asc' });
  });

  it('rejeita sort fora da whitelist', () => {
    expect(listProtocolosQuerySchema.safeParse({ sort: 'categoria:asc' }).success).toBe(false);
  });
});

describe('helpers', () => {
  it('valorPorSemana divide o valor pelas semanas', () => {
    expect(valorPorSemana(1210, 4)).toBe(302.5);
    expect(valorPorSemana(250, 1)).toBe(250);
  });

  it('sessoesDoProtocolo soma as quantidades, com mínimo de 1', () => {
    expect(sessoesDoProtocolo([])).toBe(1);
    expect(sessoesDoProtocolo([{ quantidade: 1 }, { quantidade: 1 }])).toBe(2);
  });
});
