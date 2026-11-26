import type { TransactionHost } from '@nestjs-cls/transactional';
import { Prisma } from '../../../generated/prisma/client';
import type { AuditService } from '../../../common/audit/audit.service';
import type { ExportService } from '../../../common/export/export.service';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import type { ContasBancariasService } from '../contas-bancarias/contas-bancarias.service';
import { ContasReceberService, toContaReceber } from './contas-receber.service';

const ID = '0b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const PROFISSIONAL_ID = '3e9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const CONTRATO_ID = '4f9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const dec = (valor: string) => new Prisma.Decimal(valor);

type StatusConta = 'PENDENTE' | 'RECEBIDO' | 'CANCELADO' | 'PARCIAL' | 'RENEGOCIADO';

function conta(
  status: StatusConta = 'PENDENTE',
  baixas: string[] = [],
  extra: Record<string, unknown> = {},
) {
  return {
    id: ID,
    numero: 12,
    descricao: 'Aluguel de sala',
    pacienteId: null,
    paciente: null,
    profissionalId: null,
    profissional: null,
    profissionalSacadoId: PROFISSIONAL_ID,
    profissionalSacado: { nome: 'Dr. Locatário' },
    contratoSalaId: CONTRATO_ID,
    contratoSala: { numero: 7 },
    renegociadoDeId: null,
    renegociadoDe: null,
    renegociacoes: [] as { numero: number }[],
    competencia: '2026-10',
    baixas: baixas.map((valorRecebido) => ({ valorRecebido: dec(valorRecebido) })),
    valor: dec('150.50'),
    dataVencimento: new Date('2026-10-10T00:00:00.000Z'),
    formaPagamentoId: null,
    formaPagamento: null,
    planoContaId: null,
    planoConta: null,
    documento: null,
    totalParcelas: 1,
    status,
    contaBancariaId: null,
    contaBancaria: null,
    dataRecebimento: null,
    observacoes: null,
    createdAt: new Date('2026-10-01T12:00:00.000Z'),
    updatedAt: new Date('2026-10-01T12:00:00.000Z'),
    deletedAt: null,
    ...extra,
  };
}

function setup() {
  const contaReceber = {
    findFirst: jest.fn().mockResolvedValue(conta()),
    create: jest.fn().mockResolvedValue(conta()),
    update: jest.fn().mockResolvedValue(conta()),
  };
  const contaReceberBaixa = {
    create: jest.fn().mockResolvedValue({}),
    findMany: jest.fn().mockResolvedValue([]),
    findFirst: jest.fn().mockResolvedValue(null),
    update: jest.fn().mockResolvedValue({}),
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
  };
  const formaPagamento = { findFirst: jest.fn().mockResolvedValue({ id: 'fp' }) };
  const txHost = {
    tx: { contaReceber, contaReceberBaixa, formaPagamento },
  } as unknown as TransactionHost<PrismaAdapter>;
  const audit = { record: jest.fn() };
  const contasBancarias = { garantirExiste: jest.fn().mockResolvedValue(undefined) };
  const service = new ContasReceberService(
    txHost,
    { ensureWithinLimit: jest.fn(), export: jest.fn() } as unknown as ExportService,
    audit as unknown as AuditService,
    contasBancarias as unknown as ContasBancariasService,
  );
  return { service, contaReceber, contaReceberBaixa, formaPagamento, audit, contasBancarias };
}

const BAIXA = {
  dataRecebimento: '2026-10-05',
  valorRecebido: 100,
  formaPagamentoId: null,
  contaBancariaId: null,
  documento: null,
  observacoes: null,
};

describe('toContaReceber: sacado, contrato e saldo (#165)', () => {
  it('mostra o profissional sacado, o contrato, a competência, o recebido e o saldo', () => {
    expect(toContaReceber(conta('PARCIAL', ['100']))).toMatchObject({
      pacienteNome: null,
      profissionalSacadoId: PROFISSIONAL_ID,
      profissionalSacadoNome: 'Dr. Locatário',
      contratoSalaId: CONTRATO_ID,
      contratoSalaNumero: 7,
      competencia: '2026-10',
      status: 'PARCIAL',
      valorRecebido: '100.00',
      saldo: '50.50',
    });
  });

  it('o saldo é zero em Pago, Cancelado e Renegociado', () => {
    expect(toContaReceber(conta('RECEBIDO', ['150.50'])).saldo).toBe('0.00');
    expect(toContaReceber(conta('CANCELADO')).saldo).toBe('0.00');
    expect(toContaReceber(conta('RENEGOCIADO', ['50'])).saldo).toBe('0.00');
    expect(toContaReceber(conta('PENDENTE')).saldo).toBe('150.50');
  });

  it('traz a rastreabilidade da renegociação nos dois sentidos', () => {
    expect(
      toContaReceber(conta('RENEGOCIADO', [], { renegociacoes: [{ numero: 20 }, { numero: 21 }] })),
    ).toMatchObject({ renegociadoParaNumeros: [20, 21], renegociadoDeNumero: null });
    expect(
      toContaReceber(conta('PENDENTE', [], { renegociadoDeId: ID, renegociadoDe: { numero: 12 } })),
    ).toMatchObject({ renegociadoDeId: ID, renegociadoDeNumero: 12, renegociadoParaNumeros: [] });
  });
});

describe('ContasReceberService.baixar (#165)', () => {
  it('baixa menor que o valor deixa a conta Parcial', async () => {
    const { service, contaReceber, contaReceberBaixa } = setup();
    contaReceber.findFirst
      .mockResolvedValueOnce(conta('PENDENTE'))
      .mockResolvedValueOnce(conta('PENDENTE', ['100']));
    contaReceberBaixa.findFirst.mockResolvedValue({
      contaBancariaId: null,
      dataRecebimento: new Date('2026-10-05'),
    });

    await service.baixar(ID, BAIXA);

    const baixa = contaReceberBaixa.create.mock.calls[0][0].data;
    expect(baixa).toMatchObject({ contaReceberId: ID, valorRecebido: 100 });
    expect(baixa.dataRecebimento).toEqual(new Date('2026-10-05'));
    expect(contaReceber.update.mock.calls[0][0].data).toMatchObject({
      status: 'PARCIAL',
      dataRecebimento: new Date('2026-10-05'),
    });
  });

  it('duas baixas parciais que somam o total levam a conta a Pago', async () => {
    const { service, contaReceber } = setup();
    contaReceber.findFirst
      .mockResolvedValueOnce(conta('PARCIAL', ['100']))
      .mockResolvedValueOnce(conta('PARCIAL', ['100', '50.50']));

    await service.baixar(ID, { ...BAIXA, valorRecebido: 50.5 });

    expect(contaReceber.update.mock.calls[0][0].data.status).toBe('RECEBIDO');
  });

  it('recusa baixa maior que o saldo em aberto, sem gravar', async () => {
    const { service, contaReceber, contaReceberBaixa } = setup();
    contaReceber.findFirst.mockResolvedValue(conta('PARCIAL', ['100']));

    await expect(service.baixar(ID, { ...BAIXA, valorRecebido: 50.51 })).rejects.toMatchObject({
      code: 'CONTA_RECEBER_BAIXA_EXCEDE_SALDO',
      status: 422,
    });
    expect(contaReceberBaixa.create).not.toHaveBeenCalled();
  });

  it.each<StatusConta>(['RECEBIDO', 'CANCELADO', 'RENEGOCIADO'])(
    'recusa baixar conta com status %s',
    async (status) => {
      const { service, contaReceber, contaReceberBaixa } = setup();
      contaReceber.findFirst.mockResolvedValue(conta(status));

      await expect(service.baixar(ID, BAIXA)).rejects.toMatchObject({ status: 422 });
      expect(contaReceberBaixa.create).not.toHaveBeenCalled();
    },
  );

  it('valida a forma de pagamento e a conta bancária informadas', async () => {
    const { service, formaPagamento, contasBancarias, contaReceber } = setup();
    contaReceber.findFirst.mockResolvedValue(conta());
    formaPagamento.findFirst.mockResolvedValue(null);
    await expect(
      service.baixar(ID, { ...BAIXA, formaPagamentoId: PROFISSIONAL_ID }),
    ).rejects.toMatchObject({ status: 404 });

    formaPagamento.findFirst.mockResolvedValue({ id: 'fp' });
    await service.baixar(ID, { ...BAIXA, contaBancariaId: CONTRATO_ID });
    expect(contasBancarias.garantirExiste).toHaveBeenCalledWith(CONTRATO_ID);
  });

  it('404 quando a conta não existe ou é receita de profissional', async () => {
    const { service, contaReceber } = setup();
    contaReceber.findFirst.mockResolvedValue(null);
    await expect(service.baixar(ID, BAIXA)).rejects.toMatchObject({ status: 404 });
    expect(contaReceber.findFirst.mock.calls[0][0].where).toMatchObject({
      deletedAt: null,
      profissionalId: null,
    });
  });
});

describe('ContasReceberService.cancelarBaixa (#165)', () => {
  it('exclui logicamente a baixa mais recente e recalcula o status', async () => {
    const { service, contaReceber, contaReceberBaixa } = setup();
    contaReceberBaixa.findFirst
      .mockResolvedValueOnce({ id: 'b2' })
      .mockResolvedValueOnce({ contaBancariaId: null, dataRecebimento: new Date('2026-10-05') });
    contaReceber.findFirst
      .mockResolvedValueOnce(conta('RECEBIDO', ['100', '50.50']))
      .mockResolvedValueOnce(conta('RECEBIDO', ['100']));

    await service.cancelarBaixa(ID);

    expect(contaReceberBaixa.update).toHaveBeenCalledWith({
      where: { id: 'b2' },
      data: { deletedAt: expect.any(Date) },
    });
    expect(contaReceber.update.mock.calls[0][0].data.status).toBe('PARCIAL');
  });

  it('sem nenhuma baixa, o status volta a A vencer', async () => {
    const { service, contaReceber, contaReceberBaixa } = setup();
    contaReceberBaixa.findFirst.mockResolvedValueOnce({ id: 'b1' }).mockResolvedValueOnce(null);
    contaReceber.findFirst
      .mockResolvedValueOnce(conta('PARCIAL', ['100']))
      .mockResolvedValueOnce(conta('PARCIAL', []));

    await service.cancelarBaixa(ID);

    expect(contaReceber.update.mock.calls[0][0].data).toMatchObject({
      status: 'PENDENTE',
      contaBancariaId: null,
      dataRecebimento: null,
    });
  });

  it('recusa quando não há baixa ou a conta está cancelada/renegociada', async () => {
    const { service, contaReceber } = setup();
    contaReceber.findFirst.mockResolvedValue(conta('PENDENTE'));
    await expect(service.cancelarBaixa(ID)).rejects.toMatchObject({ status: 422 });

    contaReceber.findFirst.mockResolvedValue(conta('RENEGOCIADO', ['10']));
    await expect(service.cancelarBaixa(ID)).rejects.toMatchObject({ status: 422 });
  });
});

describe('ContasReceberService.renegociar (#165)', () => {
  const PARCELAS = [
    { valor: 50, dataVencimento: '2026-12-10' },
    { valor: 50.5, dataVencimento: '2027-01-10' },
  ];

  it('gera os títulos novos ligados ao original, audita cada um e marca o original Renegociado', async () => {
    const { service, contaReceber, audit } = setup();
    contaReceber.findFirst.mockResolvedValue(conta('PARCIAL', ['50']));

    await service.renegociar(ID, { parcelas: PARCELAS, observacoes: null });

    expect(contaReceber.create).toHaveBeenCalledTimes(2);
    const primeira = contaReceber.create.mock.calls[0][0].data;
    expect(primeira).toMatchObject({
      renegociadoDeId: ID,
      profissionalSacadoId: PROFISSIONAL_ID,
      contratoSalaId: CONTRATO_ID,
      competencia: '2026-10',
      valor: 50,
      descricao: 'Aluguel de sala (renegociação 1/2)',
    });
    expect(primeira.dataVencimento).toEqual(new Date('2026-12-10'));
    expect(contaReceber.create.mock.calls[1][0].data.descricao).toBe(
      'Aluguel de sala (renegociação 2/2)',
    );
    expect(audit.record).toHaveBeenCalledTimes(2);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'CREATE', entity: 'ContaReceber', before: null }),
    );
    expect(contaReceber.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: ID }, data: { status: 'RENEGOCIADO' } }),
    );
  });

  it('recusa quando as parcelas não somam o saldo em aberto, sem criar nada', async () => {
    const { service, contaReceber } = setup();
    contaReceber.findFirst.mockResolvedValue(conta('PARCIAL', ['50']));

    await expect(
      service.renegociar(ID, {
        parcelas: [{ valor: 100, dataVencimento: '2026-12-10' }],
        observacoes: null,
      }),
    ).rejects.toMatchObject({ code: 'CONTA_RECEBER_RENEGOCIACAO_SOMA', status: 422 });
    expect(contaReceber.create).not.toHaveBeenCalled();
    expect(contaReceber.update).not.toHaveBeenCalled();
  });

  it.each<StatusConta>(['RECEBIDO', 'CANCELADO', 'RENEGOCIADO'])(
    'recusa renegociar conta com status %s',
    async (status) => {
      const { service, contaReceber } = setup();
      contaReceber.findFirst.mockResolvedValue(conta(status));

      await expect(
        service.renegociar(ID, { parcelas: PARCELAS, observacoes: null }),
      ).rejects.toMatchObject({ status: 422 });
      expect(contaReceber.create).not.toHaveBeenCalled();
    },
  );
});

describe('ContasReceberService: regras de edição e exclusão (#165)', () => {
  const ENTRADA = {
    descricao: 'Aluguel de sala',
    pacienteId: null,
    profissionalSacadoId: PROFISSIONAL_ID,
    competencia: null,
    valor: 150.5,
    dataVencimento: '2026-10-10',
    formaPagamentoId: null,
    planoContaId: null,
    documento: null,
    totalParcelas: 1,
    status: 'PENDENTE' as const,
    observacoes: null,
    contaBancariaId: null,
    dataRecebimento: null,
  };

  it('título renegociado não pode ser alterado nem excluído', async () => {
    const { service, contaReceber } = setup();
    contaReceber.findFirst.mockResolvedValue(conta('RENEGOCIADO'));
    await expect(service.update(ID, ENTRADA)).rejects.toMatchObject({ status: 422 });
    await expect(service.remove(ID)).rejects.toMatchObject({ status: 422 });
    expect(contaReceber.update).not.toHaveBeenCalled();
  });

  it('o valor não pode ficar abaixo do já recebido', async () => {
    const { service, contaReceber } = setup();
    contaReceber.findFirst.mockResolvedValue(conta('PARCIAL', ['100']));
    await expect(service.update(ID, { ...ENTRADA, valor: 99 })).rejects.toMatchObject({
      status: 422,
    });
  });

  it('não cancela conta que já tem baixa', async () => {
    const { service, contaReceber } = setup();
    contaReceber.findFirst.mockResolvedValue(conta('PARCIAL', ['100']));
    await expect(service.update(ID, { ...ENTRADA, status: 'CANCELADO' })).rejects.toMatchObject({
      status: 422,
    });
  });

  it('reabrir uma conta paga pelo modal (A vencer) desfaz as baixas', async () => {
    const { service, contaReceber, contaReceberBaixa } = setup();
    contaReceber.findFirst
      .mockResolvedValueOnce(conta('RECEBIDO', ['150.50']))
      .mockResolvedValueOnce(conta('RECEBIDO', []));

    await service.update(ID, ENTRADA);

    expect(contaReceberBaixa.updateMany).toHaveBeenCalledWith({
      where: { contaReceberId: ID, deletedAt: null },
      data: { deletedAt: expect.any(Date) },
    });
    expect(contaReceber.update.mock.calls.at(-1)?.[0].data.status).toBe('PENDENTE');
  });

  it('tirar a conta de Cancelado pelo modal a reabre como A vencer', async () => {
    const { service, contaReceber } = setup();
    contaReceber.findFirst
      .mockResolvedValueOnce(conta('CANCELADO'))
      .mockResolvedValueOnce(conta('PENDENTE'));

    await service.update(ID, ENTRADA);

    expect(contaReceber.update.mock.calls[0][0].data.status).toBe('PENDENTE');
  });

  it('o sacado profissional pode ser informado na criação', async () => {
    const { service, contaReceber } = setup();
    await service.create(ENTRADA);
    expect(contaReceber.create.mock.calls[0][0].data).toMatchObject({
      profissionalSacadoId: PROFISSIONAL_ID,
      competencia: '2026-10',
    });
  });
});
