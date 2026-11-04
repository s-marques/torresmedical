import { describe, expect, it } from 'vitest';
import { createContaReceberSchema, listContasReceberQuerySchema } from './conta-receber';

describe('createContaReceberSchema', () => {
  const base = { descricao: 'Mensalidade', valor: 150, dataVencimento: '2026-12-10' };

  it('exige a descrição', () => {
    const r = createContaReceberSchema.safeParse({ ...base, descricao: '  ' });
    expect(r.error?.issues[0]?.message).toBe('Descrição é obrigatório.');
  });

  it('exige o valor e rejeita valor zero ou negativo', () => {
    const semValor = { descricao: base.descricao, dataVencimento: base.dataVencimento };
    expect(createContaReceberSchema.safeParse(semValor).error?.issues[0]?.message).toBe(
      'Valor é obrigatório.',
    );
    expect(createContaReceberSchema.safeParse({ ...base, valor: 0 }).success).toBe(false);
    expect(createContaReceberSchema.safeParse({ ...base, valor: -10 }).success).toBe(false);
  });

  it('exige a data de vencimento', () => {
    const r = createContaReceberSchema.safeParse({ ...base, dataVencimento: '' });
    expect(r.error?.issues[0]?.message).toBe('Data de vencimento é obrigatória.');
  });

  it('aceita sem cliente, forma de pagamento, plano de contas e documento; status padrão Pendente', () => {
    const r = createContaReceberSchema.parse(base);
    expect(r).toMatchObject({
      pacienteId: null,
      formaPagamentoId: null,
      planoContaId: null,
      documento: null,
      totalParcelas: 1,
      status: 'PENDENTE',
      observacoes: null,
    });
  });

  it('rejeita campos fora do schema', () => {
    expect(createContaReceberSchema.safeParse({ ...base, extra: 'x' }).success).toBe(false);
  });
});

describe('listContasReceberQuerySchema', () => {
  it('ordena por vencimento asc por padrão e filtra por status e período', () => {
    const q = listContasReceberQuerySchema.parse({
      status: 'VENCIDO',
      vencimentoDe: '2026-01-01',
      vencimentoAte: '2026-01-31',
    });
    expect(q.sort).toEqual({ field: 'dataVencimento', direction: 'asc' });
    expect(q.status).toBe('VENCIDO');
    expect(q.vencimentoDe).toBe('2026-01-01');
    expect(q.vencimentoAte).toBe('2026-01-31');
    expect(listContasReceberQuerySchema.safeParse({ status: 'x' }).success).toBe(false);
  });
});
