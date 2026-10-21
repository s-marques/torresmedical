import { describe, expect, it } from 'vitest';
import {
  createFormaPagamentoSchema,
  listFormasPagamentoQuerySchema,
  updateFormaPagamentoSchema,
} from './forma-pagamento';

function mensagens(resultado: { success: boolean; error?: { issues: { message: string }[] } }) {
  return resultado.error?.issues.map((i) => i.message);
}

describe('createFormaPagamentoSchema', () => {
  it('só o nome é obrigatório: aplica os padrões do modal e apara o nome', () => {
    expect(createFormaPagamentoSchema.parse({ nome: '  Pix  ' })).toEqual({
      nome: 'Pix',
      finalidade: 'receber',
      tipo: 'dinheiro',
      prazoRecebimentoDias: 0,
      maxParcelas: 1,
      movimentaContaBancaria: true,
    });
  });

  it('exige o nome', () => {
    expect(mensagens(createFormaPagamentoSchema.safeParse({ nome: '' }))).toEqual([
      'Nome é obrigatório.',
    ]);
    expect(mensagens(createFormaPagamentoSchema.safeParse({}))).toEqual(['Nome é obrigatório.']);
  });

  it('valida prazo (inteiro ≥ 0), parcelas (inteiro ≥ 1), finalidade e tipo', () => {
    const base = { nome: 'X' };
    expect(
      createFormaPagamentoSchema.safeParse({ ...base, prazoRecebimentoDias: -1 }).success,
    ).toBe(false);
    expect(
      createFormaPagamentoSchema.safeParse({ ...base, prazoRecebimentoDias: 1.5 }).success,
    ).toBe(false);
    expect(createFormaPagamentoSchema.safeParse({ ...base, maxParcelas: 0 }).success).toBe(false);
    expect(createFormaPagamentoSchema.safeParse({ ...base, maxParcelas: 12 }).success).toBe(true);
    expect(createFormaPagamentoSchema.safeParse({ ...base, finalidade: 'x' }).success).toBe(false);
    expect(createFormaPagamentoSchema.safeParse({ ...base, tipo: 'x' }).success).toBe(false);
    expect(createFormaPagamentoSchema.safeParse({ ...base, extra: 1 }).success).toBe(false);
  });
});

describe('updateFormaPagamentoSchema', () => {
  it('aceita alteração parcial, inclusive só o ativo (Ativar/Desativar)', () => {
    expect(updateFormaPagamentoSchema.parse({ ativo: false })).toEqual({ ativo: false });
    expect(updateFormaPagamentoSchema.parse({ maxParcelas: 3 })).toEqual({ maxParcelas: 3 });
  });

  it('exige ao menos um campo', () => {
    expect(mensagens(updateFormaPagamentoSchema.safeParse({}))).toEqual([
      'Informe ao menos um campo para alterar',
    ]);
  });
});

describe('listFormasPagamentoQuerySchema', () => {
  it('padrão nome:asc e filtros opcionais', () => {
    const query = listFormasPagamentoQuerySchema.parse({ status: 'ativo', tipo: 'pix' });
    expect(query.sort).toEqual({ field: 'nome', direction: 'asc' });
    expect(query).toMatchObject({ status: 'ativo', tipo: 'pix' });
  });

  it('rejeita ordenação fora da whitelist', () => {
    expect(listFormasPagamentoQuerySchema.safeParse({ sort: 'finalidade:asc' }).success).toBe(
      false,
    );
  });
});
