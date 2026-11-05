import { describe, expect, it } from 'vitest';
import {
  createCompraSchema,
  importarXmlCompraSchema,
  listComprasQuerySchema,
  subtotalCompra,
  totalCompra,
} from './compra';

const ID = '0b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const item = { produtoId: ID, descricao: 'Cadeira', quantidade: 2, valorUnitario: 100.1 };
const base = { fornecedorId: ID, dataEntrada: '2026-11-05', itens: [item] };

describe('createCompraSchema', () => {
  it('exige o fornecedor', () => {
    const r = createCompraSchema.safeParse({ ...base, fornecedorId: '' });
    expect(r.error?.issues[0]?.message).toBe('Fornecedor é obrigatório.');
  });

  it('exige pelo menos um produto', () => {
    const r = createCompraSchema.safeParse({ ...base, itens: [] });
    expect(r.error?.issues[0]?.message).toBe('Adicione pelo menos um produto.');
  });

  it('exige o produto em cada item', () => {
    const r = createCompraSchema.safeParse({ ...base, itens: [{ ...item, produtoId: undefined }] });
    expect(r.error?.issues[0]).toMatchObject({
      path: ['itens', 0, 'produtoId'],
      message: 'Produto é obrigatório.',
    });
  });

  it('rejeita quantidade zero e valor unitário negativo', () => {
    expect(
      createCompraSchema.safeParse({ ...base, itens: [{ ...item, quantidade: 0 }] }).success,
    ).toBe(false);
    expect(
      createCompraSchema.safeParse({ ...base, itens: [{ ...item, valorUnitario: -1 }] }).success,
    ).toBe(false);
  });

  it('exige a data de entrada', () => {
    const r = createCompraSchema.safeParse({ ...base, dataEntrada: '' });
    expect(r.error?.issues[0]?.message).toBe('Data de entrada é obrigatória.');
  });

  it('rejeita desconto maior que o total', () => {
    const r = createCompraSchema.safeParse({ ...base, desconto: 1000 });
    expect(r.error?.issues[0]).toMatchObject({ path: ['desconto'] });
  });

  it('normaliza opcionais e zera frete e desconto', () => {
    expect(createCompraSchema.parse(base)).toMatchObject({
      numeroNf: null,
      serieNf: null,
      dataEmissao: null,
      frete: 0,
      desconto: 0,
      observacoes: null,
      arquivoNfId: null,
      itens: [{ planoContaId: null }],
    });
  });
});

describe('totais', () => {
  it('somam em centavos, sem erro de ponto flutuante', () => {
    const itens = [{ quantidade: 3, valorUnitario: 0.1 }];
    expect(subtotalCompra(itens)).toBe(0.3);
    expect(totalCompra(itens, 10, 5)).toBe(5.3);
  });
});

describe('listComprasQuerySchema', () => {
  it('ordena por # decrescente e aceita o filtro de status', () => {
    expect(listComprasQuerySchema.parse({}).sort).toEqual({ field: 'id', direction: 'desc' });
    expect(listComprasQuerySchema.parse({ status: 'PENDENTE' }).status).toBe('PENDENTE');
    expect(listComprasQuerySchema.safeParse({ status: 'x' }).success).toBe(false);
  });
});

describe('importarXmlCompraSchema', () => {
  it('exige o XML', () => {
    expect(importarXmlCompraSchema.safeParse({ xml: '' }).error?.issues[0]?.message).toBe(
      'Selecione o arquivo XML da nota fiscal.',
    );
  });
});
