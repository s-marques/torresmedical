import { describe, expect, it } from 'vitest';
import {
  baixarContaReceberSchema,
  CONTA_RECEBER_FILTRO_STATUS,
  CONTA_RECEBER_ROTULO_STATUS_EXIBICAO,
  createContaReceberSchema,
  listContasReceberQuerySchema,
  renegociarContaReceberSchema,
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

  it('mostra "Vencido" só quando pendente e com vencimento no passado; senão "A vencer"', () => {
    expect(statusExibicaoContaReceber({ status: 'PENDENTE', dataVencimento: ONTEM })).toBe(
      'VENCIDO',
    );
    expect(statusExibicaoContaReceber({ status: 'PENDENTE', dataVencimento: HOJE })).toBe(
      'A_VENCER',
    );
    expect(statusExibicaoContaReceber({ status: 'PENDENTE', dataVencimento: AMANHA })).toBe(
      'A_VENCER',
    );
    expect(statusExibicaoContaReceber({ status: 'RECEBIDO', dataVencimento: ONTEM })).toBe(
      'RECEBIDO',
    );
    expect(statusExibicaoContaReceber({ status: 'CANCELADO', dataVencimento: ONTEM })).toBe(
      'CANCELADO',
    );
  });

  it('Parcial e Renegociado não viram Vencido, mesmo com vencimento no passado', () => {
    expect(statusExibicaoContaReceber({ status: 'PARCIAL', dataVencimento: ONTEM })).toBe(
      'PARCIAL',
    );
    expect(statusExibicaoContaReceber({ status: 'RENEGOCIADO', dataVencimento: ONTEM })).toBe(
      'RENEGOCIADO',
    );
  });

  it('os seis status do documento do cliente têm chip e rótulo (R §17)', () => {
    expect(CONTA_RECEBER_FILTRO_STATUS.map((s) => CONTA_RECEBER_ROTULO_STATUS_EXIBICAO[s])).toEqual(
      ['A vencer', 'Vencido', 'Pago', 'Parcial', 'Renegociado', 'Cancelado'],
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

describe('createContaReceberSchema: sacado e competência (#165)', () => {
  const base = { descricao: 'Aluguel', valor: 1500, dataVencimento: '2026-12-10' };
  const ID = '0b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';

  it('aceita o profissional sacado e a competência; vazios viram null', () => {
    expect(createContaReceberSchema.parse(base)).toMatchObject({
      profissionalSacadoId: null,
      competencia: null,
    });
    expect(
      createContaReceberSchema.parse({ ...base, profissionalSacadoId: ID, competencia: '2026-11' }),
    ).toMatchObject({ profissionalSacadoId: ID, competencia: '2026-11' });
    expect(createContaReceberSchema.parse({ ...base, competencia: '' }).competencia).toBeNull();
  });

  it('recusa paciente e profissional ao mesmo tempo, apontando o campo do profissional', () => {
    const r = createContaReceberSchema.safeParse({
      ...base,
      pacienteId: ID,
      profissionalSacadoId: ID,
    });
    expect(r.error?.issues[0]).toMatchObject({
      message: 'Informe o paciente ou o profissional, não os dois',
      path: ['profissionalSacadoId'],
    });
  });

  it('recusa competência fora do formato AAAA-MM e Parcial/Renegociado como status do modal', () => {
    expect(createContaReceberSchema.safeParse({ ...base, competencia: '2026-13' }).success).toBe(
      false,
    );
    expect(createContaReceberSchema.safeParse({ ...base, competencia: '11/2026' }).success).toBe(
      false,
    );
    expect(createContaReceberSchema.safeParse({ ...base, status: 'PARCIAL' }).success).toBe(false);
    expect(createContaReceberSchema.safeParse({ ...base, status: 'RENEGOCIADO' }).success).toBe(
      false,
    );
  });
});

describe('listContasReceberQuerySchema: status do documento (#165)', () => {
  it('aceita os chips novos e recusa Pendente (agora é A vencer)', () => {
    for (const status of [
      'A_VENCER',
      'VENCIDO',
      'RECEBIDO',
      'PARCIAL',
      'RENEGOCIADO',
      'CANCELADO',
    ]) {
      expect(listContasReceberQuerySchema.safeParse({ status }).success).toBe(true);
    }
    expect(listContasReceberQuerySchema.safeParse({ status: 'PENDENTE' }).success).toBe(false);
  });
});

describe('baixarContaReceberSchema', () => {
  const base = { dataRecebimento: '2026-12-05', valorRecebido: 100 };

  it('exige data e valor positivo; forma, conta, documento e observações são opcionais', () => {
    expect(baixarContaReceberSchema.parse(base)).toMatchObject({
      formaPagamentoId: null,
      contaBancariaId: null,
      documento: null,
      observacoes: null,
    });
    expect(
      baixarContaReceberSchema.safeParse({ valorRecebido: 10 }).error?.issues[0]?.message,
    ).toBe('Data de recebimento é obrigatória.');
    expect(baixarContaReceberSchema.safeParse({ ...base, valorRecebido: 0 }).success).toBe(false);
    expect(baixarContaReceberSchema.safeParse({ ...base, valorRecebido: -1 }).success).toBe(false);
    expect(
      baixarContaReceberSchema.safeParse({ dataRecebimento: base.dataRecebimento }).error?.issues[0]
        ?.message,
    ).toBe('Valor recebido é obrigatório.');
  });

  it('recusa data inválida e campos fora do schema', () => {
    expect(
      baixarContaReceberSchema.safeParse({ ...base, dataRecebimento: '2026-02-30' }).error
        ?.issues[0]?.message,
    ).toBe('Data de recebimento inválida');
    expect(baixarContaReceberSchema.safeParse({ ...base, extra: 'x' }).success).toBe(false);
  });
});

describe('renegociarContaReceberSchema', () => {
  const parcela = { valor: 50, dataVencimento: '2027-01-10' };

  it('exige ao menos uma parcela com valor positivo e vencimento', () => {
    expect(renegociarContaReceberSchema.parse({ parcelas: [parcela] })).toMatchObject({
      observacoes: null,
    });
    expect(renegociarContaReceberSchema.safeParse({ parcelas: [] }).error?.issues[0]?.message).toBe(
      'Informe ao menos uma parcela',
    );
    expect(renegociarContaReceberSchema.safeParse({}).success).toBe(false);
    expect(
      renegociarContaReceberSchema.safeParse({ parcelas: [{ ...parcela, valor: 0 }] }).success,
    ).toBe(false);
    expect(
      renegociarContaReceberSchema.safeParse({ parcelas: [{ valor: 10, dataVencimento: '' }] })
        .error?.issues[0]?.message,
    ).toBe('Data de vencimento é obrigatória.');
  });

  it('limita o número de parcelas', () => {
    const muitas = Array.from({ length: 61 }, () => parcela);
    expect(renegociarContaReceberSchema.safeParse({ parcelas: muitas }).success).toBe(false);
    expect(renegociarContaReceberSchema.safeParse({ parcelas: muitas.slice(0, 60) }).success).toBe(
      true,
    );
  });
});
