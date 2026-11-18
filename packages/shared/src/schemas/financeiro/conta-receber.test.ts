import { describe, expect, it } from 'vitest';
import {
  createContaReceberSchema,
  listContasReceberQuerySchema,
  statusExibicaoContaReceber,
} from './conta-receber';

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

describe('statusExibicaoContaReceber', () => {
  const HOJE = new Date().toISOString().slice(0, 10);
  const ONTEM = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  const AMANHA = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

  it('mostra "Vencido" só quando pendente e com vencimento no passado', () => {
    expect(statusExibicaoContaReceber({ status: 'PENDENTE', dataVencimento: ONTEM })).toBe(
      'VENCIDO',
    );
    expect(statusExibicaoContaReceber({ status: 'PENDENTE', dataVencimento: HOJE })).toBe(
      'PENDENTE',
    );
    expect(statusExibicaoContaReceber({ status: 'PENDENTE', dataVencimento: AMANHA })).toBe(
      'PENDENTE',
    );
    expect(statusExibicaoContaReceber({ status: 'RECEBIDO', dataVencimento: ONTEM })).toBe(
      'RECEBIDO',
    );
    expect(statusExibicaoContaReceber({ status: 'CANCELADO', dataVencimento: ONTEM })).toBe(
      'CANCELADO',
    );
  });
});

describe('createContaReceberSchema: recebimento (#46)', () => {
  const base = { descricao: 'Mensalidade', valor: 150, dataVencimento: '2026-12-10' };

  it('conta bancária e data de recebimento são opcionais e vazias viram null', () => {
    expect(
      createContaReceberSchema.parse({ ...base, contaBancariaId: '', dataRecebimento: '' }),
    ).toMatchObject({ contaBancariaId: null, dataRecebimento: null });
    expect(createContaReceberSchema.parse(base)).toMatchObject({
      contaBancariaId: null,
      dataRecebimento: null,
    });
  });

  it('recusa conta e data inválidas', () => {
    const r = createContaReceberSchema.safeParse({
      ...base,
      contaBancariaId: 'x',
      dataRecebimento: '2026-02-30',
    });
    expect(r.error?.issues.map((i) => i.message)).toEqual([
      'Conta bancária inválida',
      'Data de recebimento inválida',
    ]);
  });
});
