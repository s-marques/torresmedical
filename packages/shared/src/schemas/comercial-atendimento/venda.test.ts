import { describe, expect, it } from 'vitest';
import {
  calcularTotaisVenda,
  catalogoVendaQuerySchema,
  criarVendaSchema,
  exportVendasQuerySchema,
  listVendasQuerySchema,
  MSG_VENDA_SEM_ITENS,
} from './venda';

const ID = '0b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const ITEM = {
  origem: 'produto',
  origemId: ID,
  descricao: 'Item de teste',
  quantidade: 2,
  valorUnitario: 100,
};

describe('criarVendaSchema', () => {
  it('aceita uma venda sem cliente nem forma de pagamento e aplica os padrões', () => {
    const r = criarVendaSchema.parse({ itens: [ITEM] });
    expect(r).toMatchObject({ pacienteId: null, formaPagamentoId: null, parcelas: 1, desconto: 0 });
  });

  it('exige ao menos um item', () => {
    const r = criarVendaSchema.safeParse({ itens: [] });
    expect(r.error?.issues[0]?.message).toBe(MSG_VENDA_SEM_ITENS);
    expect(criarVendaSchema.safeParse({}).error?.issues[0]?.message).toBe(MSG_VENDA_SEM_ITENS);
  });

  it.each([
    ['parcelas zero', { parcelas: 0 }],
    ['parcelas fracionada', { parcelas: 1.5 }],
    ['desconto negativo', { desconto: -1 }],
    ['cliente inválido', { pacienteId: 'x' }],
    ['campo desconhecido', { total: 10 }],
  ])('rejeita %s', (_nome, extra) => {
    expect(criarVendaSchema.safeParse({ itens: [ITEM], ...extra }).success).toBe(false);
  });

  it.each([
    ['quantidade zero', { quantidade: 0 }],
    ['valor negativo', { valorUnitario: -1 }],
    ['descrição vazia', { descricao: '  ' }],
    ['origem desconhecida', { origem: 'servico' }],
  ])('rejeita item com %s', (_nome, extra) => {
    expect(criarVendaSchema.safeParse({ itens: [{ ...ITEM, ...extra }] }).success).toBe(false);
  });
});

describe('calcularTotaisVenda', () => {
  it('soma os itens e abate o desconto', () => {
    const r = calcularTotaisVenda(
      [
        { quantidade: 2, valorUnitario: 100 },
        { quantidade: 1, valorUnitario: 49.9 },
      ],
      30,
    );
    expect(r).toEqual({ totaisItens: [200, 49.9], subtotal: 249.9, desconto: 30, total: 219.9 });
  });

  it('limita o desconto ao subtotal', () => {
    expect(calcularTotaisVenda([{ quantidade: 1, valorUnitario: 50 }], 80)).toMatchObject({
      desconto: 50,
      total: 0,
    });
  });
});

describe('listVendasQuerySchema', () => {
  it('usa data decrescente por padrão e aceita o status', () => {
    const r = listVendasQuerySchema.parse({ status: 'finalizada' });
    expect(r.sort).toEqual({ field: 'data', direction: 'desc' });
    expect(r.status).toBe('finalizada');
  });

  it('rejeita status e ordenação fora da lista', () => {
    expect(listVendasQuerySchema.safeParse({ status: 'pendente' }).success).toBe(false);
    expect(listVendasQuerySchema.safeParse({ sort: 'x:asc' }).success).toBe(false);
  });
});

describe('exportVendasQuerySchema', () => {
  it('exige o formato e usa todas as colunas por padrão', () => {
    expect(exportVendasQuerySchema.safeParse({}).success).toBe(false);
    expect(exportVendasQuerySchema.parse({ format: 'xlsx' }).columns).toHaveLength(6);
  });
});

describe('catalogoVendaQuerySchema', () => {
  it('exige o tipo', () => {
    expect(catalogoVendaQuerySchema.safeParse({}).success).toBe(false);
    expect(catalogoVendaQuerySchema.parse({ tipo: 'protocolo' }).tipo).toBe('protocolo');
  });
});
