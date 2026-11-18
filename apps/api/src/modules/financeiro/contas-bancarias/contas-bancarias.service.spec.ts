import type { TransactionHost } from '@nestjs-cls/transactional';
import { Prisma } from '../../../generated/prisma/client';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import { ContasBancariasService, toContaBancaria } from './contas-bancarias.service';

const ID = '0b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const CONTA = {
  id: ID,
  nome: 'Conta Teste',
  tipo: 'CORRENTE' as const,
  banco: 'Banco Teste',
  agencia: '0001',
  conta: '12345-6',
  saldoInicial: new Prisma.Decimal('1000'),
  dataSaldoInicial: null as Date | null,
  ativo: true,
  createdAt: new Date('2026-10-01T12:00:00.000Z'),
  updatedAt: new Date('2026-10-01T12:00:00.000Z'),
  deletedAt: null,
};

function setup({
  recebido = '300',
  pago = '450.25',
}: { recebido?: string | null; pago?: string | null } = {}) {
  const contaBancaria = {
    findMany: jest.fn().mockResolvedValue([CONTA]),
    findFirst: jest.fn().mockResolvedValue(CONTA),
    count: jest.fn().mockResolvedValue(1),
    create: jest.fn().mockResolvedValue(CONTA),
    update: jest.fn().mockResolvedValue(CONTA),
  };
  const contaReceber = {
    aggregate: jest.fn().mockResolvedValue({
      _sum: { valor: recebido === null ? null : new Prisma.Decimal(recebido) },
    }),
  };
  const contaPagarBaixa = {
    aggregate: jest
      .fn()
      .mockResolvedValue({ _sum: { valorPago: pago === null ? null : new Prisma.Decimal(pago) } }),
  };
  const txHost = {
    tx: { contaBancaria, contaReceber, contaPagarBaixa },
  } as unknown as TransactionHost<PrismaAdapter>;
  return {
    service: new ContasBancariasService(txHost),
    contaBancaria,
    contaReceber,
    contaPagarBaixa,
  };
}

describe('ContasBancariasService', () => {
  it('toContaBancaria converte decimais em texto e a data em AAAA-MM-DD', () => {
    expect(
      toContaBancaria(
        { ...CONTA, dataSaldoInicial: new Date('2026-09-01T00:00:00.000Z') },
        new Prisma.Decimal('12.5'),
      ),
    ).toMatchObject({ saldoInicial: '1000', dataSaldoInicial: '2026-09-01', saldo: '12.5' });
  });

  it('list traz o saldo: inicial + recebidos − pagos, só das ativas e não excluídas', async () => {
    const { service, contaBancaria } = setup();
    const res = await service.list({ search: undefined });
    expect(res).toMatchObject({ total: 1, data: [{ id: ID, saldo: '849.75' }] });
    expect(contaBancaria.findMany.mock.calls[0][0].where).toMatchObject({
      deletedAt: null,
      ativo: true,
    });
  });

  it('saldo sem movimentos é o saldo inicial', async () => {
    const { service } = setup({ recebido: null, pago: null });
    await expect(service.findById(ID)).resolves.toMatchObject({ saldo: '1000' });
  });

  it('saldo conta só movimentos a partir da data do saldo inicial', async () => {
    const { service, contaBancaria, contaReceber, contaPagarBaixa } = setup();
    const desde = new Date('2026-09-01T00:00:00.000Z');
    contaBancaria.findFirst.mockResolvedValue({ ...CONTA, dataSaldoInicial: desde });
    await service.findById(ID);
    expect(contaReceber.aggregate.mock.calls[0][0].where).toMatchObject({
      contaBancariaId: ID,
      status: 'RECEBIDO',
      dataRecebimento: { gte: desde },
    });
    expect(contaPagarBaixa.aggregate.mock.calls[0][0].where).toMatchObject({
      contaBancariaId: ID,
      dataPagamento: { gte: desde },
      deletedAt: null,
    });
  });

  it('create converte a data do saldo inicial', async () => {
    const { service, contaBancaria } = setup();
    await service.create({
      nome: 'Conta Teste',
      tipo: 'CORRENTE',
      banco: null,
      agencia: null,
      conta: null,
      saldoInicial: 0,
      dataSaldoInicial: '2026-09-01',
    });
    expect(contaBancaria.create.mock.calls[0][0].data.dataSaldoInicial).toEqual(
      new Date('2026-09-01'),
    );
  });

  it('remove marca deletedAt e devolve o estado anterior; 404 se não existe', async () => {
    const { service, contaBancaria } = setup();
    await expect(service.remove(ID)).resolves.toMatchObject({ id: ID });
    expect(contaBancaria.update).toHaveBeenCalledWith({
      where: { id: ID },
      data: { deletedAt: expect.any(Date) },
    });
    contaBancaria.findFirst.mockResolvedValue(null);
    await expect(service.remove(ID)).rejects.toMatchObject({ status: 404 });
  });

  it('garantirExiste recusa conta inexistente com detalhe no campo', async () => {
    const { service, contaBancaria } = setup();
    await expect(service.garantirExiste(ID)).resolves.toBeUndefined();
    contaBancaria.count.mockResolvedValue(0);
    await expect(service.garantirExiste(ID)).rejects.toMatchObject({ status: 404 });
  });
});
