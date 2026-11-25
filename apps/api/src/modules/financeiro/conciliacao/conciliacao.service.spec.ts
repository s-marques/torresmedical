import type { TransactionHost } from '@nestjs-cls/transactional';
import { Prisma } from '../../../generated/prisma/client';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import { ConciliacaoService, lancamentoDePagar, lancamentoDeReceber } from './conciliacao.service';

const ID = '0b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const CONTA_BANCARIA_ID = '2d9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const BASE = {
  id: ID,
  numero: 1,
  descricao: 'Lançamento',
  valor: new Prisma.Decimal('561'),
  dataVencimento: new Date('2026-10-10T00:00:00.000Z'),
  formaPagamentoId: null,
  planoContaId: null,
  documento: null,
  totalParcelas: 1,
  observacoes: null,
  createdAt: new Date('2026-10-01T12:00:00.000Z'),
  updatedAt: new Date('2026-10-01T12:00:00.000Z'),
  deletedAt: null,
};
const PAGAR = {
  ...BASE,
  beneficiarioTipo: 'FORNECEDOR' as const,
  fornecedorId: null,
  funcionarioId: null,
  status: 'PAGO' as 'PAGO' | 'PENDENTE' | 'CANCELADO',
  competencia: null,
  centroCustoId: null,
  documentoArquivoId: null,
  baixas: [{ dataPagamento: new Date('2026-10-05T00:00:00.000Z') }],
};
const RECEBER = {
  ...BASE,
  pacienteId: null,
  profissionalId: null,
  paciente: { nome: 'Cliente Teste' },
  status: 'RECEBIDO' as 'RECEBIDO' | 'PENDENTE' | 'CANCELADO',
  contaBancariaId: null,
  dataRecebimento: new Date('2026-10-03T00:00:00.000Z') as Date | null,
};
const QUERY = { page: 1, pageSize: 10, de: '2026-09-30', ate: '2026-10-30' };
const PERIODO = { gte: new Date('2026-09-30'), lte: new Date('2026-10-30') };

function setup() {
  const contaPagar = {
    findMany: jest.fn().mockResolvedValue([PAGAR]),
    count: jest.fn().mockResolvedValue(1),
  };
  const contaReceber = {
    findMany: jest.fn().mockResolvedValue([RECEBER]),
    count: jest.fn().mockResolvedValue(1),
    aggregate: jest.fn().mockResolvedValue({ _sum: { valor: new Prisma.Decimal('9070') } }),
  };
  const contaPagarBaixa = {
    aggregate: jest.fn().mockResolvedValue({ _sum: { valorPago: new Prisma.Decimal('14679.45') } }),
  };
  const txHost = {
    tx: { contaPagar, contaReceber, contaPagarBaixa },
  } as unknown as TransactionHost<PrismaAdapter>;
  return { service: new ConciliacaoService(txHost), contaPagar, contaReceber, contaPagarBaixa };
}

describe('ConciliacaoService', () => {
  describe('lançamento: data de referência', () => {
    it('A Pagar pago usa a data do último pagamento; pendente usa o vencimento', () => {
      expect(lancamentoDePagar(PAGAR)).toMatchObject({
        tipo: 'PAGAR',
        data: '2026-10-05',
        valor: '561',
        status: 'PAGO',
        pessoaNome: null,
      });
      expect(lancamentoDePagar({ ...PAGAR, status: 'PENDENTE', baixas: [] })).toMatchObject({
        data: '2026-10-10',
      });
    });

    it('A Receber recebido usa a data do recebimento; cancelado usa o vencimento', () => {
      expect(lancamentoDeReceber(RECEBER)).toMatchObject({
        tipo: 'RECEBER',
        data: '2026-10-03',
        pessoaNome: 'Cliente Teste',
        status: 'RECEBIDO',
      });
      expect(
        lancamentoDeReceber({ ...RECEBER, status: 'CANCELADO', dataRecebimento: null }),
      ).toMatchObject({ data: '2026-10-10' });
    });
  });

  it('A Pagar filtra pagos pela data da baixa e os demais pelo vencimento', async () => {
    const { service, contaPagar, contaReceber } = setup();
    const res = await service.lancamentos({ ...QUERY, tipo: 'PAGAR' });
    expect(res.meta.total).toBe(1);
    expect(contaReceber.findMany).not.toHaveBeenCalled();
    const where = contaPagar.findMany.mock.calls[0][0].where;
    expect(where.OR).toEqual([
      { status: 'PAGO', baixas: { some: { deletedAt: null, dataPagamento: PERIODO } } },
      { status: { not: 'PAGO' }, dataVencimento: PERIODO },
    ]);
    expect(where.baixas).toBeUndefined();
  });

  it('A Pagar com conta filtra pelas baixas da conta', async () => {
    const { service, contaPagar } = setup();
    await service.lancamentos({ ...QUERY, tipo: 'PAGAR', contaBancariaId: CONTA_BANCARIA_ID });
    expect(contaPagar.findMany.mock.calls[0][0].where.baixas).toEqual({
      some: { deletedAt: null, contaBancariaId: CONTA_BANCARIA_ID },
    });
  });

  it('A Receber filtra recebidos pela data do recebimento e a conta pelo recebimento', async () => {
    const { service, contaReceber } = setup();
    const res = await service.lancamentos({
      ...QUERY,
      tipo: 'RECEBER',
      contaBancariaId: CONTA_BANCARIA_ID,
    });
    expect(res.data[0]).toMatchObject({ tipo: 'RECEBER' });
    const where = contaReceber.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({
      deletedAt: null,
      contaBancariaId: CONTA_BANCARIA_ID,
      OR: [
        { status: 'RECEBIDO', dataRecebimento: PERIODO },
        { status: { not: 'RECEBIDO' }, dataVencimento: PERIODO },
      ],
    });
  });

  it('resumo: Recebido − Pago no período (valores do print)', async () => {
    const { service, contaPagarBaixa } = setup();
    await expect(service.resumo({ de: QUERY.de, ate: QUERY.ate })).resolves.toEqual({
      recebido: '9070.00',
      pago: '14679.45',
      saldo: '-5609.45',
    });
    expect(contaPagarBaixa.aggregate.mock.calls[0][0].where).toEqual({
      deletedAt: null,
      dataPagamento: PERIODO,
      contaPagar: { deletedAt: null },
    });
  });

  it('resumo sem movimentos devolve zeros', async () => {
    const { service, contaReceber, contaPagarBaixa } = setup();
    contaReceber.aggregate.mockResolvedValue({ _sum: { valor: null } });
    contaPagarBaixa.aggregate.mockResolvedValue({ _sum: { valorPago: null } });
    await expect(service.resumo({ de: QUERY.de, ate: QUERY.ate })).resolves.toEqual({
      recebido: '0.00',
      pago: '0.00',
      saldo: '0.00',
    });
  });
});
