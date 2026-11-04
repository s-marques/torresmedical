import type { TransactionHost } from '@nestjs-cls/transactional';
import { Prisma } from '../../../generated/prisma/client';
import type { ExportService } from '../../../common/export/export.service';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import type { FornecedoresService } from '../../compras-estoque/fornecedores/fornecedores.service';
import type { FuncionariosService } from '../../regulatorio-qualidade/funcionarios/funcionarios.service';
import { CONTA_PAGAR_EXPORT_DEFINITIONS, ContasPagarService } from './contas-pagar.service';

const ID = '0b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const FORNECEDOR_ID = '1c9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const CONTA = {
  id: ID,
  numero: 9,
  descricao: 'Água Cuiaba',
  beneficiarioTipo: 'FORNECEDOR' as const,
  fornecedorId: FORNECEDOR_ID,
  funcionarioId: null,
  valor: new Prisma.Decimal('300.00'),
  dataVencimento: new Date('2026-11-10T00:00:00.000Z'),
  formaPagamentoId: null,
  formaPagamento: null,
  planoContaId: null,
  planoConta: null,
  documento: null,
  totalParcelas: 1,
  status: 'PENDENTE' as const,
  observacoes: null,
  baixas: [] as { valorPago: Prisma.Decimal }[],
  createdAt: new Date('2026-10-01T12:00:00.000Z'),
  updatedAt: new Date('2026-10-01T12:00:00.000Z'),
  deletedAt: null,
};

function setup() {
  const contaPagar = {
    findMany: jest.fn().mockResolvedValue([CONTA]),
    findFirst: jest.fn().mockResolvedValue(CONTA),
    count: jest.fn().mockResolvedValue(1),
    create: jest.fn().mockResolvedValue(CONTA),
    update: jest.fn().mockResolvedValue(CONTA),
  };
  const contaPagarBaixa = {
    create: jest.fn().mockResolvedValue({}),
    findMany: jest.fn().mockResolvedValue([]),
    findFirst: jest.fn().mockResolvedValue(null),
    update: jest.fn().mockResolvedValue({}),
  };
  const formaPagamento = { findFirst: jest.fn().mockResolvedValue({ id: 'x' }) };
  const contaBancaria = { findFirst: jest.fn().mockResolvedValue({ id: 'x' }) };
  const txHost = {
    tx: { contaPagar, contaPagarBaixa, formaPagamento, contaBancaria },
  } as unknown as TransactionHost<PrismaAdapter>;
  const exportService = {
    ensureWithinLimit: jest.fn(),
    export: jest.fn().mockResolvedValue({ filename: 'contas-pagar.xlsx' }),
  };
  const fornecedores = {
    findById: jest.fn().mockResolvedValue({ id: FORNECEDOR_ID, nome: 'Distribuidora Alfa' }),
  };
  const funcionarios = { findById: jest.fn() };
  const service = new ContasPagarService(
    txHost,
    exportService as unknown as ExportService,
    fornecedores as unknown as FornecedoresService,
    funcionarios as unknown as FuncionariosService,
  );
  return { service, contaPagar, contaPagarBaixa, exportService, fornecedores, funcionarios };
}

describe('ContasPagarService', () => {
  it('findById resolve o nome do fornecedor pelo service exportado (sem FK)', async () => {
    const { service, fornecedores } = setup();
    const res = await service.findById(ID);
    expect(fornecedores.findById).toHaveBeenCalledWith(FORNECEDOR_ID);
    expect(res).toMatchObject({
      valor: '300',
      dataVencimento: '2026-11-10',
      beneficiarioNome: 'Distribuidora Alfa',
      valorPago: '0',
    });
  });

  it('findById devolve beneficiarioNome nulo se o fornecedor foi excluído depois', async () => {
    const { service, fornecedores } = setup();
    fornecedores.findById.mockRejectedValue(new Error('404'));
    const res = await service.findById(ID);
    expect(res.beneficiarioNome).toBeNull();
  });

  it('create valida o fornecedor e grava fornecedorId/funcionarioId conforme o tipo', async () => {
    const { service, contaPagar, fornecedores } = setup();
    await service.create({
      descricao: 'Água Cuiaba',
      beneficiarioTipo: 'FORNECEDOR',
      beneficiarioId: FORNECEDOR_ID,
      valor: 300,
      dataVencimento: '2026-11-10',
      formaPagamentoId: null,
      planoContaId: null,
      documento: null,
      totalParcelas: 1,
      status: 'PENDENTE',
      observacoes: null,
    });
    expect(fornecedores.findById).toHaveBeenCalledWith(FORNECEDOR_ID);
    expect(contaPagar.create.mock.calls[0][0].data).toMatchObject({
      fornecedorId: FORNECEDOR_ID,
      funcionarioId: null,
    });
    expect(contaPagar.create.mock.calls[0][0].data.dataVencimento).toBeInstanceOf(Date);
  });

  it('create com beneficiário FUNCIONARIO valida pelo service de funcionários', async () => {
    const { service, contaPagar, funcionarios } = setup();
    funcionarios.findById.mockResolvedValue({ id: 'x', nome: 'Fulano' });
    await service.create({
      descricao: 'Salário',
      beneficiarioTipo: 'FUNCIONARIO',
      beneficiarioId: 'x',
      valor: 100,
      dataVencimento: '2026-11-10',
      formaPagamentoId: null,
      planoContaId: null,
      documento: null,
      totalParcelas: 1,
      status: 'PENDENTE',
      observacoes: null,
    });
    expect(funcionarios.findById).toHaveBeenCalledWith('x');
    expect(contaPagar.create.mock.calls[0][0].data).toMatchObject({
      fornecedorId: null,
      funcionarioId: 'x',
    });
  });

  it('remove marca deletedAt (exclusão lógica)', async () => {
    const { service, contaPagar } = setup();
    await service.remove(ID);
    expect(contaPagar.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { deletedAt: expect.any(Date) } }),
    );
  });

  it('baixar cria a baixa e quita a conta quando a soma atinge o valor', async () => {
    const { service, contaPagarBaixa, contaPagar } = setup();
    contaPagarBaixa.findMany.mockResolvedValue([{ valorPago: new Prisma.Decimal('300.00') }]);
    await service.baixar(ID, {
      dataPagamento: '2026-11-04',
      valorPago: 300,
      juros: 0,
      desconto: 0,
      formaPagamentoId: null,
      contaBancariaId: null,
      documento: null,
      observacoes: null,
      comprovanteArquivoId: null,
    });
    expect(contaPagarBaixa.create).toHaveBeenCalled();
    expect(contaPagar.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'PAGO' } }),
    );
  });

  it('baixar recusa conta já paga ou cancelada', async () => {
    const { service, contaPagar } = setup();
    contaPagar.findFirst.mockResolvedValue({ ...CONTA, status: 'PAGO' });
    await expect(
      service.baixar(ID, {
        dataPagamento: '2026-11-04',
        valorPago: 10,
        juros: 0,
        desconto: 0,
        formaPagamentoId: null,
        contaBancariaId: null,
        documento: null,
        observacoes: null,
        comprovanteArquivoId: null,
      }),
    ).rejects.toMatchObject({ code: 'BUSINESS_RULE' });
  });

  it('baixar com saldo parcial mantém a conta Pendente', async () => {
    const { service, contaPagarBaixa, contaPagar } = setup();
    contaPagarBaixa.findMany.mockResolvedValue([{ valorPago: new Prisma.Decimal('100.00') }]);
    await service.baixar(ID, {
      dataPagamento: '2026-11-04',
      valorPago: 100,
      juros: 0,
      desconto: 0,
      formaPagamentoId: null,
      contaBancariaId: null,
      documento: null,
      observacoes: null,
      comprovanteArquivoId: null,
    });
    expect(contaPagar.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'PENDENTE' } }),
    );
  });

  it('cancelarBaixa exclui logicamente a baixa mais recente e recalcula o status', async () => {
    const { service, contaPagarBaixa, contaPagar } = setup();
    contaPagarBaixa.findFirst.mockResolvedValue({ id: 'baixa-1' });
    await service.cancelarBaixa(ID);
    expect(contaPagarBaixa.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'baixa-1' },
        data: { deletedAt: expect.any(Date) },
      }),
    );
    expect(contaPagar.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'PENDENTE' } }),
    );
  });

  it('cancelarBaixa recusa quando não há baixa', async () => {
    const { service, contaPagarBaixa } = setup();
    contaPagarBaixa.findFirst.mockResolvedValue(null);
    await expect(service.cancelarBaixa(ID)).rejects.toMatchObject({ code: 'BUSINESS_RULE' });
  });

  it('list filtra por status, período de vencimento e busca', async () => {
    const { service, contaPagar } = setup();
    await service.list({
      page: 1,
      pageSize: 10,
      sort: { field: 'dataVencimento', direction: 'asc' },
      search: 'agua',
      status: 'PENDENTE',
      vencimentoDe: '2026-11-01',
      vencimentoAte: '2026-11-30',
    });
    const args = contaPagar.findMany.mock.calls[0][0];
    expect(args.where).toMatchObject({ status: 'PENDENTE', deletedAt: null });
    expect(args.where.dataVencimento).toEqual({
      gte: new Date('2026-11-01'),
      lte: new Date('2026-11-30'),
    });
  });

  it('list com status VENCIDO filtra Pendentes com vencimento antes de hoje', async () => {
    const { service, contaPagar } = setup();
    await service.list({
      page: 1,
      pageSize: 10,
      sort: { field: 'dataVencimento', direction: 'asc' },
      search: undefined,
      status: 'VENCIDO',
    });
    const args = contaPagar.findMany.mock.calls[0][0];
    expect(args.where.status).toBe('PENDENTE');
    expect(args.where.dataVencimento.lt).toBeInstanceOf(Date);
  });

  it('export aplica o limite e usa as colunas pedidas', async () => {
    const { service, exportService } = setup();
    await service.export({
      format: 'xlsx',
      search: undefined,
      sort: { field: 'dataVencimento', direction: 'asc' },
      columns: ['descricao', 'status'],
    });
    expect(exportService.ensureWithinLimit).toHaveBeenCalledWith(1);
    expect(
      exportService.export.mock.calls[0][0].columns.map((c: { key: string }) => c.key),
    ).toEqual(['descricao', 'status']);
    expect(CONTA_PAGAR_EXPORT_DEFINITIONS.map((c) => c.key)).toContain('beneficiario');
  });
});
