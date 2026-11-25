import { describe, expect, it } from 'vitest';
import {
  baixarContaPagarSchema,
  CONTA_PAGAR_JUSTIFICATIVA_MAX,
  createContaPagarSchema,
  listDivergenciasContaPagarQuerySchema,
  verificarDuplicidadeContaPagarSchema,
} from './conta-pagar';

describe('createContaPagarSchema: competência, centro de custo e anexo (#163)', () => {
  const base = { descricao: 'Energia', valor: 150, dataVencimento: '2026-12-10' };

  it('os campos novos são opcionais e vazios viram null', () => {
    expect(createContaPagarSchema.parse(base)).toMatchObject({
      competencia: null,
      centroCustoId: null,
      documentoArquivoId: null,
    });
    expect(createContaPagarSchema.parse({ ...base, competencia: '' }).competencia).toBeNull();
  });

  it('aceita a competência no formato AAAA-MM', () => {
    expect(createContaPagarSchema.parse({ ...base, competencia: ' 2026-11 ' }).competencia).toBe(
      '2026-11',
    );
    expect(createContaPagarSchema.parse({ ...base, competencia: '2026-01' }).competencia).toBe(
      '2026-01',
    );
  });

  it.each(['11/2026', '2026-13', '2026-00', '2026-1', '202611', 'novembro'])(
    'rejeita a competência %s',
    (competencia) => {
      const r = createContaPagarSchema.safeParse({ ...base, competencia });
      expect(r.success).toBe(false);
      expect(r.error?.issues[0]?.path).toEqual(['competencia']);
    },
  );

  it('valida os ids do centro de custo e do anexo', () => {
    const id = '00000000-0000-4000-8000-0000000000d1';
    expect(
      createContaPagarSchema.parse({ ...base, centroCustoId: id, documentoArquivoId: id }),
    ).toMatchObject({ centroCustoId: id, documentoArquivoId: id });
    expect(createContaPagarSchema.safeParse({ ...base, centroCustoId: 'x' }).success).toBe(false);
    expect(createContaPagarSchema.safeParse({ ...base, documentoArquivoId: 'x' }).success).toBe(
      false,
    );
  });

  it('aceita a confirmação da duplicidade, que não faz parte da conta', () => {
    expect(
      createContaPagarSchema.parse({ ...base, duplicidadeConfirmada: true }).duplicidadeConfirmada,
    ).toBe(true);
    expect(
      createContaPagarSchema.safeParse({ ...base, duplicidadeConfirmada: 'sim' }).success,
    ).toBe(false);
  });
});

describe('baixarContaPagarSchema: divergência (#163)', () => {
  const base = { dataPagamento: '2026-11-04', valorPago: 100 };

  it('justificativa é opcional (vazia vira null); pagamento parcial começa desmarcado', () => {
    expect(baixarContaPagarSchema.parse(base)).toMatchObject({
      justificativaDivergencia: null,
      pagamentoParcial: false,
    });
    expect(
      baixarContaPagarSchema.parse({ ...base, justificativaDivergencia: '  ' })
        .justificativaDivergencia,
    ).toBeNull();
  });

  it('apara a justificativa e limita o tamanho', () => {
    expect(
      baixarContaPagarSchema.parse({ ...base, justificativaDivergencia: ' Multa ' })
        .justificativaDivergencia,
    ).toBe('Multa');
    const longa = 'a'.repeat(CONTA_PAGAR_JUSTIFICATIVA_MAX + 1);
    const r = baixarContaPagarSchema.safeParse({ ...base, justificativaDivergencia: longa });
    expect(r.error?.issues[0]?.message).toBe('Justificativa deve ter no máximo 500 caracteres');
  });
});

describe('verificarDuplicidadeContaPagarSchema (#163)', () => {
  it('aceita só os campos que identificam o título, todos opcionais', () => {
    expect(verificarDuplicidadeContaPagarSchema.parse({})).toMatchObject({
      beneficiarioTipo: 'FORNECEDOR',
      beneficiarioId: null,
      dataVencimento: null,
      documento: null,
    });
    expect(
      verificarDuplicidadeContaPagarSchema.parse({
        beneficiarioTipo: 'FUNCIONARIO',
        valor: 10,
        dataVencimento: '',
        documento: ' NF-1 ',
      }),
    ).toMatchObject({ beneficiarioTipo: 'FUNCIONARIO', dataVencimento: null, documento: 'NF-1' });
  });

  it('rejeita campos extras, valor não positivo e data inválida', () => {
    expect(verificarDuplicidadeContaPagarSchema.safeParse({ descricao: 'x' }).success).toBe(false);
    expect(verificarDuplicidadeContaPagarSchema.safeParse({ valor: 0 }).success).toBe(false);
    expect(
      verificarDuplicidadeContaPagarSchema.safeParse({ dataVencimento: '10/12' }).success,
    ).toBe(false);
  });
});

describe('listDivergenciasContaPagarQuerySchema (#163)', () => {
  it('ordena pelo pagamento mais recente por padrão e aceita o período', () => {
    const r = listDivergenciasContaPagarQuerySchema.parse({
      pagamentoDe: '2026-11-01',
      pagamentoAte: '2026-11-30',
    });
    expect(r.sort).toEqual({ field: 'dataPagamento', direction: 'desc' });
    expect(r).toMatchObject({ pagamentoDe: '2026-11-01', pagamentoAte: '2026-11-30' });
  });

  it('rejeita ordenação fora da lista e data inválida', () => {
    expect(listDivergenciasContaPagarQuerySchema.safeParse({ sort: 'descricao:asc' }).success).toBe(
      false,
    );
    expect(listDivergenciasContaPagarQuerySchema.safeParse({ pagamentoDe: 'ontem' }).success).toBe(
      false,
    );
  });
});
