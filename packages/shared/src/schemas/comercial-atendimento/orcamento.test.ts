import { describe, expect, it } from 'vitest';
import {
  calcularTotaisOrcamento,
  catalogoOrcamentoQuerySchema,
  criarOrcamentoSchema,
  listOrcamentosQuerySchema,
  MSG_ORCAMENTO_SEM_ITENS,
} from './orcamento';

const ID = '0b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const ITEM = {
  origem: 'servico',
  origemId: ID,
  descricao: 'Serviço de teste',
  quantidade: 2,
  valorUnitario: 100,
  desconto: 10,
};

describe('criarOrcamentoSchema', () => {
  it('exige ao menos um item', () => {
    const r = criarOrcamentoSchema.safeParse({ itens: [] });
    expect(r.error?.issues[0]?.message).toBe(MSG_ORCAMENTO_SEM_ITENS);
    expect(criarOrcamentoSchema.safeParse({}).error?.issues[0]?.message).toBe(
      MSG_ORCAMENTO_SEM_ITENS,
    );
  });

  it('cliente, forma de pagamento e observações são opcionais', () => {
    expect(criarOrcamentoSchema.parse({ itens: [ITEM] })).toMatchObject({
      pacienteId: null,
      formaPagamentoId: null,
      observacoes: null,
      descontoTipo: 'valor',
      descontoValor: 0,
    });
  });

  it('rejeita desconto do item maior que o valor do item', () => {
    const r = criarOrcamentoSchema.safeParse({ itens: [{ ...ITEM, desconto: 500 }] });
    expect(r.error?.issues[0]?.message).toBe('O desconto não pode ser maior que o valor do item');
  });

  it('rejeita quantidade zero, valor negativo e descrição vazia', () => {
    expect(criarOrcamentoSchema.safeParse({ itens: [{ ...ITEM, quantidade: 0 }] }).success).toBe(
      false,
    );
    expect(
      criarOrcamentoSchema.safeParse({ itens: [{ ...ITEM, valorUnitario: -1 }] }).success,
    ).toBe(false);
    expect(criarOrcamentoSchema.safeParse({ itens: [{ ...ITEM, descricao: ' ' }] }).success).toBe(
      false,
    );
  });

  it('limita o desconto percentual a 100', () => {
    const r = criarOrcamentoSchema.safeParse({
      itens: [ITEM],
      descontoTipo: 'percentual',
      descontoValor: 101,
    });
    expect(r.error?.issues[0]?.message).toBe('O desconto percentual não pode passar de 100%');
  });
});

describe('calcularTotaisOrcamento', () => {
  const itens = [
    { quantidade: 2, valorUnitario: 100, desconto: 10 },
    { quantidade: 1, valorUnitario: 50.5, desconto: 0 },
  ];

  it('soma os itens e aplica desconto em R$', () => {
    expect(calcularTotaisOrcamento(itens, 'valor', 20.5)).toEqual({
      totaisItens: [190, 50.5],
      subtotal: 240.5,
      descontoGeral: 20.5,
      total: 220,
    });
  });

  it('aplica desconto em %', () => {
    const r = calcularTotaisOrcamento(itens, 'percentual', 10);
    expect(r.descontoGeral).toBe(24.05);
    expect(r.total).toBe(216.45);
  });

  it('limita o desconto ao subtotal', () => {
    expect(calcularTotaisOrcamento(itens, 'valor', 9999).total).toBe(0);
  });
});

describe('listagem e catálogo', () => {
  it('ordena por data desc por padrão e filtra por status', () => {
    const q = listOrcamentosQuerySchema.parse({ status: 'pendente' });
    expect(q.sort).toEqual({ field: 'data', direction: 'desc' });
    expect(listOrcamentosQuerySchema.safeParse({ status: 'x' }).success).toBe(false);
  });

  it('o catálogo exige o tipo', () => {
    expect(catalogoOrcamentoQuerySchema.safeParse({}).success).toBe(false);
    expect(catalogoOrcamentoQuerySchema.parse({ tipo: 'protocolo-mae' }).tipo).toBe(
      'protocolo-mae',
    );
  });
});
