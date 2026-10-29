import type { TransactionHost } from '@nestjs-cls/transactional';
import { Prisma } from '../../../generated/prisma/client';
import type { RequestContextService } from '../../../common/context/request-context.service';
import type { ExportService } from '../../../common/export/export.service';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import { CAIXA_EXPORT_DEFINITIONS, CaixasService, toCaixa } from './caixas.service';

const ID = '0b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const OPERADOR = '1c9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const CAIXA = {
  id: ID,
  numero: 7,
  nome: 'Caixa 1',
  operadorId: OPERADOR,
  operador: { nome: 'Operadora Teste' },
  dataAbertura: new Date('2026-10-01T12:00:00.000Z'),
  dataFechamento: null,
  valorAbertura: new Prisma.Decimal('150.5'),
  valorFechamento: null,
  quebra: null,
  status: 'ABERTO' as const,
};

function setup(userId: string | null = OPERADOR) {
  const caixa = {
    findMany: jest.fn().mockResolvedValue([CAIXA]),
    findFirst: jest.fn().mockResolvedValue(null),
    count: jest.fn().mockResolvedValue(1),
    create: jest.fn().mockResolvedValue(CAIXA),
  };
  const txHost = { tx: { caixa } } as unknown as TransactionHost<PrismaAdapter>;
  const exportService = {
    ensureWithinLimit: jest.fn(),
    export: jest.fn().mockResolvedValue({ filename: 'caixas.xlsx' }),
  };
  const contexto = { getUserId: () => userId ?? undefined } as unknown as RequestContextService;
  const service = new CaixasService(txHost, exportService as unknown as ExportService, contexto);
  return { service, caixa, exportService };
}

describe('CaixasService', () => {
  it('toCaixa converte decimais em texto e datas em ISO', () => {
    expect(toCaixa(CAIXA)).toMatchObject({
      operador: 'Operadora Teste',
      valorAbertura: '150.5',
      dataAbertura: '2026-10-01T12:00:00.000Z',
      dataFechamento: null,
      quebra: null,
    });
  });

  it('abrir cria o caixa para o usuário autenticado', async () => {
    const { service, caixa } = setup();
    const res = await service.abrir({ nome: 'Caixa 1', valorAbertura: 150.5 });
    expect(caixa.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { nome: 'Caixa 1', valorAbertura: 150.5, operadorId: OPERADOR },
      }),
    );
    expect(res.id).toBe(ID);
  });

  it('abrir recusa um segundo caixa aberto do mesmo operador', async () => {
    const { service, caixa } = setup();
    caixa.findFirst.mockResolvedValue({ id: ID });
    await expect(service.abrir({ nome: 'X', valorAbertura: 0 })).rejects.toMatchObject({
      code: 'CAIXA_JA_ABERTO',
    });
    expect(caixa.create).not.toHaveBeenCalled();
  });

  it('abrir exige usuário no contexto', async () => {
    const { service } = setup(null);
    await expect(service.abrir({ nome: 'X', valorAbertura: 0 })).rejects.toMatchObject({
      code: 'OPERADOR_NAO_IDENTIFICADO',
    });
  });

  it('list filtra por status, busca em nome e operador e ordena por operador', async () => {
    const { service, caixa } = setup();
    const page = await service.list({
      page: 1,
      pageSize: 10,
      sort: { field: 'operador', direction: 'asc' },
      search: 'ana',
      status: 'fechado',
    });
    const args = caixa.findMany.mock.calls[0][0];
    expect(args.where).toMatchObject({ status: 'FECHADO', deletedAt: null });
    expect(args.where.OR).toHaveLength(2);
    expect(args.orderBy[0]).toEqual({ operador: { nome: 'asc' } });
    expect(page.data[0]?.numero).toBe(7);
  });

  it('list ordena a coluna # pelo número', async () => {
    const { service, caixa } = setup();
    await service.list({ page: 1, pageSize: 10, sort: { field: 'id', direction: 'desc' } });
    expect(caixa.findMany.mock.calls[0][0].orderBy[0]).toEqual({ numero: 'desc' });
  });

  it('export aplica o limite e usa as colunas pedidas', async () => {
    const { service, exportService } = setup();
    await service.export({
      format: 'xlsx',
      sort: { field: 'dataAbertura', direction: 'desc' },
      columns: ['nome', 'status'],
    });
    expect(exportService.ensureWithinLimit).toHaveBeenCalledWith(1);
    expect(exportService.export.mock.calls[0][0].columns.map((c: { key: string }) => c.key)).toEqual([
      'nome',
      'status',
    ]);
    expect(CAIXA_EXPORT_DEFINITIONS.map((c) => c.key)).toContain('quebra');
  });
});
