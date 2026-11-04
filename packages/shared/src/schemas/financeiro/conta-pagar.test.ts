import { describe, expect, it } from 'vitest';
import {
  baixarContaPagarSchema,
  createContaPagarSchema,
  listContasPagarQuerySchema,
  statusExibicaoContaPagar,
} from './conta-pagar';

describe('createContaPagarSchema', () => {
  const base = { descricao: 'Água Cuiaba', valor: 150, dataVencimento: '2026-12-10' };

  it('exige a descrição', () => {
    const r = createContaPagarSchema.safeParse({ ...base, descricao: '  ' });
    expect(r.error?.issues[0]?.message).toBe('Descrição é obrigatório.');
  });

  it('exige o valor e rejeita valor zero ou negativo', () => {
    const semValor = { descricao: base.descricao, dataVencimento: base.dataVencimento };
    expect(createContaPagarSchema.safeParse(semValor).error?.issues[0]?.message).toBe(
      'Valor é obrigatório.',
    );
    expect(createContaPagarSchema.safeParse({ ...base, valor: 0 }).success).toBe(false);
    expect(createContaPagarSchema.safeParse({ ...base, valor: -10 }).success).toBe(false);
  });

  it('exige a data de vencimento', () => {
    const r = createContaPagarSchema.safeParse({ ...base, dataVencimento: '' });
    expect(r.error?.issues[0]?.message).toBe('Data de vencimento é obrigatória.');
  });

  it('aceita sem beneficiário; tipo padrão Fornecedor e status padrão Pendente', () => {
    const r = createContaPagarSchema.parse(base);
    expect(r).toMatchObject({
      beneficiarioTipo: 'FORNECEDOR',
      beneficiarioId: null,
      formaPagamentoId: null,
      planoContaId: null,
      documento: null,
      totalParcelas: 1,
      status: 'PENDENTE',
      observacoes: null,
    });
  });

  it('aceita beneficiarioTipo FUNCIONARIO', () => {
    const r = createContaPagarSchema.parse({ ...base, beneficiarioTipo: 'FUNCIONARIO' });
    expect(r.beneficiarioTipo).toBe('FUNCIONARIO');
  });

  it('rejeita campos fora do schema', () => {
    expect(createContaPagarSchema.safeParse({ ...base, extra: 'x' }).success).toBe(false);
  });
});

describe('listContasPagarQuerySchema', () => {
  it('ordena por vencimento asc por padrão e filtra por status e período', () => {
    const q = listContasPagarQuerySchema.parse({
      status: 'VENCIDO',
      vencimentoDe: '2026-01-01',
      vencimentoAte: '2026-01-31',
    });
    expect(q.sort).toEqual({ field: 'dataVencimento', direction: 'asc' });
    expect(q.status).toBe('VENCIDO');
    expect(listContasPagarQuerySchema.safeParse({ status: 'x' }).success).toBe(false);
  });
});

describe('statusExibicaoContaPagar', () => {
  const HOJE = new Date().toISOString().slice(0, 10);
  const ONTEM = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

  it('mostra "Vencido" só quando pendente e com vencimento no passado', () => {
    expect(statusExibicaoContaPagar({ status: 'PENDENTE', dataVencimento: ONTEM })).toBe('VENCIDO');
    expect(statusExibicaoContaPagar({ status: 'PENDENTE', dataVencimento: HOJE })).toBe('PENDENTE');
    expect(statusExibicaoContaPagar({ status: 'PAGO', dataVencimento: ONTEM })).toBe('PAGO');
    expect(statusExibicaoContaPagar({ status: 'CANCELADO', dataVencimento: ONTEM })).toBe(
      'CANCELADO',
    );
  });
});

describe('baixarContaPagarSchema', () => {
  const base = { dataPagamento: '2026-11-04', valorPago: 100 };

  it('exige a data de pagamento e o valor pago', () => {
    expect(baixarContaPagarSchema.safeParse({ valorPago: 100 }).error?.issues[0]?.message).toBe(
      'Data de pagamento é obrigatória.',
    );
    expect(
      baixarContaPagarSchema.safeParse({ dataPagamento: '2026-11-04' }).error?.issues[0]?.message,
    ).toBe('Valor pago é obrigatório.');
  });

  it('rejeita valor pago zero ou negativo', () => {
    expect(baixarContaPagarSchema.safeParse({ ...base, valorPago: 0 }).success).toBe(false);
    expect(baixarContaPagarSchema.safeParse({ ...base, valorPago: -1 }).success).toBe(false);
  });

  it('juros e desconto são opcionais com padrão 0', () => {
    const r = baixarContaPagarSchema.parse(base);
    expect(r).toMatchObject({
      juros: 0,
      desconto: 0,
      formaPagamentoId: null,
      contaBancariaId: null,
    });
  });
});
