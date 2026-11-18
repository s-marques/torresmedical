import { describe, expect, it } from 'vitest';
import {
  exportPedidosCompraQuerySchema,
  listPedidosCompraQuerySchema,
  pedidoCompraInputSchema,
  subtotalPedidoCompra,
  totalItemPedido,
  valorTotalPedidoCompra,
} from './pedido-compra';

const ID = '0b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';

function mensagens(resultado: { error?: { issues: { path: PropertyKey[]; message: string }[] } }) {
  return Object.fromEntries(
    (resultado.error?.issues ?? []).map((i) => [i.path.join('.'), i.message]),
  );
}

describe('totais do pedido', () => {
  it('total da linha e subtotal arredondados em centavos', () => {
    expect(totalItemPedido({ quantidade: 3, valorUnitario: 0.1 })).toBe(0.3);
    expect(totalItemPedido({ quantidade: 1.5, valorUnitario: 3.33 })).toBe(5);
    expect(
      subtotalPedidoCompra([
        { quantidade: 2, valorUnitario: 10.5 },
        { quantidade: 1, valorUnitario: 0.25 },
      ]),
    ).toBe(21.25);
    expect(subtotalPedidoCompra([])).toBe(0);
  });

  it('Valor Total: vazio é a soma dos itens ("Auto"); informado prevalece', () => {
    const itens = [{ quantidade: 2, valorUnitario: 10 }];
    expect(valorTotalPedidoCompra(itens, null)).toBe(20);
    expect(valorTotalPedidoCompra(itens, undefined)).toBe(20);
    expect(valorTotalPedidoCompra(itens, 150)).toBe(150);
    expect(valorTotalPedidoCompra([], 0)).toBe(0);
  });
});

describe('pedidoCompraInputSchema', () => {
  it('só o fornecedor é obrigatório, com a mensagem padrão', () => {
    expect(mensagens(pedidoCompraInputSchema.safeParse({}))).toEqual({
      fornecedorId: 'Fornecedor é obrigatório.',
    });
    expect(mensagens(pedidoCompraInputSchema.safeParse({ fornecedorId: '' }))).toEqual({
      fornecedorId: 'Fornecedor é obrigatório.',
    });
  });

  it('aceita pedido sem itens e normaliza os opcionais vazios', () => {
    const r = pedidoCompraInputSchema.parse({
      fornecedorId: ID,
      numeroNf: '  ',
      dataPedido: '',
      dataPrevisao: '',
      valorTotal: null,
      observacoes: '',
    });
    expect(r).toEqual({
      fornecedorId: ID,
      numeroNf: null,
      dataPedido: null,
      dataPrevisao: null,
      valorTotal: null,
      observacoes: null,
      itens: [],
    });
  });

  it('valida datas, valores, limites e os itens', () => {
    const r = pedidoCompraInputSchema.safeParse({
      fornecedorId: 'x',
      numeroNf: '1'.repeat(21),
      dataPedido: '18/11/2026',
      dataPrevisao: '2026-13-01',
      valorTotal: -1,
      itens: [{ produtoId: '', quantidade: 0, valorUnitario: -1 }],
    });
    expect(mensagens(r)).toEqual({
      fornecedorId: 'Fornecedor inválido',
      numeroNf: 'Número NF deve ter no máximo 20 caracteres',
      dataPedido: 'Data do pedido inválida',
      dataPrevisao: 'Previsão de entrega inválida',
      valorTotal: 'O valor total não pode ser negativo',
      'itens.0.produtoId': 'Produto é obrigatório.',
      'itens.0.quantidade': 'A quantidade deve ser maior que zero',
      'itens.0.valorUnitario': 'O valor unitário não pode ser negativo',
    });
  });

  it('rejeita campos desconhecidos', () => {
    expect(
      pedidoCompraInputSchema.safeParse({ fornecedorId: ID, status: 'RECEBIDO' }).success,
    ).toBe(false);
  });
});

describe('listagem e exportação', () => {
  it('ordena por data do pedido decrescente e filtra por status', () => {
    const r = listPedidosCompraQuerySchema.parse({ status: 'EM_TRANSITO' });
    expect(r).toMatchObject({
      sort: { field: 'dataPedido', direction: 'desc' },
      status: 'EM_TRANSITO',
    });
    expect(listPedidosCompraQuerySchema.safeParse({ status: 'X' }).success).toBe(false);
    expect(listPedidosCompraQuerySchema.parse({ sort: 'qtdItens:asc' }).sort).toEqual({
      field: 'qtdItens',
      direction: 'asc',
    });
  });

  it('exportação exige formato', () => {
    expect(exportPedidosCompraQuerySchema.safeParse({}).success).toBe(false);
    expect(exportPedidosCompraQuerySchema.safeParse({ format: 'xlsx' }).success).toBe(true);
  });
});
