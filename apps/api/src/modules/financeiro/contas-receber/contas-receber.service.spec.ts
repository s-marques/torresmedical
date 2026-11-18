import type { TransactionHost } from '@nestjs-cls/transactional';
import { Prisma } from '../../../generated/prisma/client';
import type { AuditService } from '../../../common/audit/audit.service';
import type { ExportService } from '../../../common/export/export.service';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import type { ContasBancariasService } from '../contas-bancarias/contas-bancarias.service';
import {
  CONTA_RECEBER_EXPORT_DEFINITIONS,
  ContasReceberService,
  toContaReceber,
} from './contas-receber.service';

const ID = '0b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const PACIENTE_ID = '1c9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const CONTA = {
  id: ID,
  numero: 12,
  descricao: 'Mensalidade Outubro',
  pacienteId: PACIENTE_ID,
  paciente: { nome: 'Maria Teste' },
  valor: new Prisma.Decimal('150.5'),
  dataVencimento: new Date('2026-10-10T00:00:00.000Z'),
  formaPagamentoId: null,
  formaPagamento: null,
  planoContaId: null,
  planoConta: null,
  documento: null,
  totalParcelas: 1,
  status: 'PENDENTE' as 'PENDENTE' | 'RECEBIDO' | 'CANCELADO',
  contaBancariaId: null as string | null,
  contaBancaria: null as { nome: string } | null,
  dataRecebimento: null as Date | null,
  observacoes: null,
  createdAt: new Date('2026-10-01T12:00:00.000Z'),
  updatedAt: new Date('2026-10-01T12:00:00.000Z'),
  deletedAt: null,
};

function setup() {
  const contaReceber = {
    findMany: jest.fn().mockResolvedValue([CONTA]),
    findFirst: jest.fn().mockResolvedValue(CONTA),
    count: jest.fn().mockResolvedValue(1),
    create: jest.fn().mockResolvedValue(CONTA),
    update: jest.fn().mockResolvedValue(CONTA),
  };
  const txHost = { tx: { contaReceber } } as unknown as TransactionHost<PrismaAdapter>;
  const exportService = {
    ensureWithinLimit: jest.fn(),
    export: jest.fn().mockResolvedValue({ filename: 'contas-receber.xlsx' }),
  };
  const audit = { record: jest.fn() };
  const contasBancarias = { garantirExiste: jest.fn().mockResolvedValue(undefined) };
  const service = new ContasReceberService(
    txHost,
    exportService as unknown as ExportService,
    audit as unknown as AuditService,
    contasBancarias as unknown as ContasBancariasService,
  );
  return { service, contaReceber, exportService, audit, contasBancarias };
}

const ENTRADA = {
  descricao: 'Mensalidade Outubro',
  pacienteId: null,
  valor: 150.5,
  dataVencimento: '2026-10-10',
  formaPagamentoId: null,
  planoContaId: null,
  documento: null,
  totalParcelas: 1,
  observacoes: null,
};
const CONTA_BANCARIA_ID = '2d9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';

describe('ContasReceberService: conta bancária e data do recebimento (#46)', () => {
  it('com status Recebido grava a conta (validada) e a data informada', async () => {
    const { service, contaReceber, contasBancarias } = setup();
    await service.create({
      ...ENTRADA,
      status: 'RECEBIDO',
      contaBancariaId: CONTA_BANCARIA_ID,
      dataRecebimento: '2026-10-05',
    });
    expect(contasBancarias.garantirExiste).toHaveBeenCalledWith(CONTA_BANCARIA_ID);
    const data = contaReceber.create.mock.calls[0][0].data;
    expect(data.contaBancariaId).toBe(CONTA_BANCARIA_ID);
    expect(data.dataRecebimento).toEqual(new Date('2026-10-05'));
  });

  it('com status Recebido sem data usa a de hoje', async () => {
    const { service, contaReceber } = setup();
    await service.create({ ...ENTRADA, status: 'RECEBIDO' });
    const data = contaReceber.create.mock.calls[0][0].data;
    expect(data.contaBancariaId).toBeNull();
    expect(data.dataRecebimento).toEqual(new Date(new Date().toISOString().slice(0, 10)));
  });

  it('na edição sem data mantém a data de recebimento já gravada', async () => {
    const { service, contaReceber } = setup();
    contaReceber.findFirst.mockResolvedValue({
      ...CONTA,
      status: 'RECEBIDO',
      dataRecebimento: new Date('2026-09-20'),
    });
    await service.update(ID, {
      ...ENTRADA,
      status: 'RECEBIDO',
      contaBancariaId: null,
      dataRecebimento: null,
    });
    expect(contaReceber.update.mock.calls[0][0].data.dataRecebimento).toEqual(
      new Date('2026-09-20'),
    );
  });

  it('fora de Recebido limpa conta e data, sem validar a conta', async () => {
    const { service, contaReceber, contasBancarias } = setup();
    await service.create({
      ...ENTRADA,
      status: 'PENDENTE',
      contaBancariaId: CONTA_BANCARIA_ID,
      dataRecebimento: '2026-10-05',
    });
    expect(contasBancarias.garantirExiste).not.toHaveBeenCalled();
    const data = contaReceber.create.mock.calls[0][0].data;
    expect(data.contaBancariaId).toBeNull();
    expect(data.dataRecebimento).toBeNull();
  });

  it('toContaReceber traz a conta bancária e a data do recebimento', () => {
    expect(
      toContaReceber({
        ...CONTA,
        contaBancaria: { nome: 'Banco Teste' },
        contaBancariaId: CONTA_BANCARIA_ID,
        dataRecebimento: new Date('2026-10-05T00:00:00.000Z'),
      }),
    ).toMatchObject({ contaBancariaNome: 'Banco Teste', dataRecebimento: '2026-10-05' });
  });
});

describe('ContasReceberService', () => {
  it('toContaReceber converte decimal em texto, data em AAAA-MM-DD e traz o nome do cliente', () => {
    expect(toContaReceber(CONTA)).toMatchObject({
      valor: '150.5',
      dataVencimento: '2026-10-10',
      pacienteNome: 'Maria Teste',
      formaPagamentoNome: null,
      planoContaNome: null,
    });
  });

  it('create grava a conta com a data de vencimento convertida', async () => {
    const { service, contaReceber } = setup();
    const res = await service.create({
      descricao: 'Mensalidade Outubro',
      pacienteId: null,
      valor: 150.5,
      dataVencimento: '2026-10-10',
      formaPagamentoId: null,
      planoContaId: null,
      documento: null,
      totalParcelas: 1,
      status: 'PENDENTE',
      observacoes: null,
    });
    expect(contaReceber.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ descricao: 'Mensalidade Outubro' }),
      }),
    );
    expect(contaReceber.create.mock.calls[0][0].data.dataVencimento).toBeInstanceOf(Date);
    expect(res.id).toBe(ID);
  });

  it('update busca a conta antes de alterar e remove recusa conta inexistente', async () => {
    const { service, contaReceber } = setup();
    await service.update(ID, {
      descricao: 'X',
      pacienteId: null,
      valor: 10,
      dataVencimento: '2026-11-01',
      formaPagamentoId: null,
      planoContaId: null,
      documento: null,
      totalParcelas: 1,
      status: 'RECEBIDO',
      observacoes: null,
      contaBancariaId: null,
      dataRecebimento: null,
    });
    expect(contaReceber.findFirst).toHaveBeenCalled();
    expect(contaReceber.update).toHaveBeenCalled();

    contaReceber.findFirst.mockResolvedValue(null);
    await expect(service.findById('inexistente')).rejects.toMatchObject({
      status: 404,
    });
  });

  it('remove marca deletedAt (exclusão lógica)', async () => {
    const { service, contaReceber } = setup();
    await service.remove(ID);
    expect(contaReceber.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { deletedAt: expect.any(Date) } }),
    );
  });

  it('list filtra por status, período de vencimento, busca e ordena por cliente', async () => {
    const { service, contaReceber } = setup();
    const page = await service.list({
      page: 1,
      pageSize: 10,
      sort: { field: 'cliente', direction: 'asc' },
      search: 'maria',
      status: 'PENDENTE',
      vencimentoDe: '2026-10-01',
      vencimentoAte: '2026-10-31',
    });
    const args = contaReceber.findMany.mock.calls[0][0];
    expect(args.where).toMatchObject({ status: 'PENDENTE', deletedAt: null });
    expect(args.where.dataVencimento).toEqual({
      gte: new Date('2026-10-01'),
      lte: new Date('2026-10-31'),
    });
    expect(args.where.OR).toHaveLength(3);
    expect(args.orderBy[0]).toEqual({ paciente: { nome: 'asc' } });
    expect(page.data[0]?.numero).toBe(12);
  });

  it('list com status VENCIDO filtra Pendentes com vencimento antes de hoje (não é status gravado)', async () => {
    const { service, contaReceber } = setup();
    await service.list({
      page: 1,
      pageSize: 10,
      sort: { field: 'dataVencimento', direction: 'asc' },
      search: undefined,
      status: 'VENCIDO',
    });
    const args = contaReceber.findMany.mock.calls[0][0];
    expect(args.where.status).toBe('PENDENTE');
    expect(args.where.dataVencimento.lt).toBeInstanceOf(Date);
  });

  it('list ordena a coluna # pelo número', async () => {
    const { service, contaReceber } = setup();
    await service.list({
      page: 1,
      pageSize: 10,
      sort: { field: 'id', direction: 'desc' },
      search: undefined,
    });
    expect(contaReceber.findMany.mock.calls[0][0].orderBy[0]).toEqual({ numero: 'desc' });
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
    expect(CONTA_RECEBER_EXPORT_DEFINITIONS.map((c) => c.key)).toContain('cliente');
  });

  it('criarDeOrigemExterna cria a conta e grava a auditoria sem passar pelo interceptor', async () => {
    const { service, contaReceber, audit } = setup();
    const conta = await service.criarDeOrigemExterna({
      descricao: 'Aluguel de sala - Sala 1 - Dr. Teste - 10/2026',
      pacienteId: null,
      valor: 1500,
      dataVencimento: '2026-10-10',
      formaPagamentoId: null,
      planoContaId: null,
      documento: null,
      totalParcelas: 1,
      status: 'PENDENTE',
      observacoes: null,
    });
    expect(contaReceber.create).toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'CREATE', entity: 'ContaReceber', entityId: conta.id }),
    );
  });

  it('cancelarPendentesComVencimentoApos só cancela pendentes com vencimento depois da data', async () => {
    const { service, contaReceber, audit } = setup();
    contaReceber.findMany.mockResolvedValueOnce([CONTA]);
    const total = await service.cancelarPendentesComVencimentoApos([ID], '2026-10-01');
    expect(contaReceber.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'PENDENTE' }),
      }),
    );
    expect(contaReceber.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: ID }, data: { status: 'CANCELADO' } }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'UPDATE', entity: 'ContaReceber', entityId: ID }),
    );
    expect(total).toBe(1);
  });

  it('cancelarPendentesComVencimentoApos não consulta o banco sem ids', async () => {
    const { service, contaReceber } = setup();
    const total = await service.cancelarPendentesComVencimentoApos([], '2026-10-01');
    expect(contaReceber.findMany).not.toHaveBeenCalled();
    expect(total).toBe(0);
  });
});
