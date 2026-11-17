import type { TransactionHost } from '@nestjs-cls/transactional';
import type { ListLotesQuery } from '@torres/shared';
import { Prisma } from '../../../generated/prisma/client';
import type { ExportService } from '../../../common/export/export.service';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import { LOTE_EXPORT_DEFINITIONS, LotesService } from './lotes.service';

const PRODUTO_ID = '2d9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
/** 17/11/2026, 09h00 em Brasília. */
const AGORA = new Date('2026-11-17T12:00:00.000Z');

function lote(extra: Record<string, unknown> = {}) {
  return {
    id: 'l1',
    produtoId: PRODUTO_ID,
    numero: 'LOT-1',
    dataVencimento: new Date('2026-12-01T00:00:00.000Z'),
    quantidade: new Prisma.Decimal('12.5'),
    createdAt: AGORA,
    produto: { nome: 'Luva', sku: 'LUV' },
    ...extra,
  };
}

function setup() {
  const tx = {
    lote: {
      findMany: jest.fn().mockResolvedValue([lote()]),
      count: jest.fn().mockResolvedValue(1),
      create: jest
        .fn()
        .mockImplementation(({ data }) => Promise.resolve(lote({ ...data, id: 'novo' }))),
    },
    produto: {
      fields: { estoqueMinimo: 'estoque_minimo_ref' },
      findFirst: jest.fn().mockResolvedValue({ id: PRODUTO_ID }),
      count: jest.fn().mockResolvedValue(4),
    },
  };
  const exportService = {
    ensureWithinLimit: jest.fn(),
    export: jest.fn().mockResolvedValue({ filename: 'lotes.xlsx' }),
  };
  const service = new LotesService(
    { tx } as unknown as TransactionHost<PrismaAdapter>,
    exportService as unknown as ExportService,
  );
  return { service, tx, exportService };
}

const QUERY: ListLotesQuery = {
  page: 1,
  pageSize: 10,
  sort: { field: 'vencimento', direction: 'asc' },
  search: undefined,
  produtoId: undefined,
  comSaldo: false,
};

describe('LotesService', () => {
  it('lista com o status calculado pelo vencimento e a quantidade decimal em texto', async () => {
    const { service, tx } = setup();
    const page = await service.list(QUERY, AGORA);
    expect(page.data).toEqual([
      {
        id: 'l1',
        produtoId: PRODUTO_ID,
        produtoNome: 'Luva',
        produtoSku: 'LUV',
        numero: 'LOT-1',
        dataVencimento: '2026-12-01',
        quantidade: '12.5',
        status: 'VENCENDO',
        createdAt: AGORA.toISOString(),
      },
    ]);
    expect(page.meta).toEqual({ page: 1, pageSize: 10, total: 1, totalPages: 1 });
    expect(tx.lote.findMany.mock.calls[0]?.[0].where).toEqual({
      AND: [{ deletedAt: null, produto: { deletedAt: null } }],
    });
  });

  it('aplica produto, "Apenas com saldo" e a busca por lote, produto ou SKU', async () => {
    const { service, tx } = setup();
    await service.list({ ...QUERY, produtoId: PRODUTO_ID, comSaldo: true, search: 'lot' }, AGORA);
    const contem = { contains: 'lot', mode: 'insensitive' };
    expect(tx.lote.findMany.mock.calls[0]?.[0].where.AND).toEqual([
      { deletedAt: null, produto: { deletedAt: null } },
      { produtoId: PRODUTO_ID },
      { quantidade: { gt: 0 } },
      { OR: [{ numero: contem }, { produto: { OR: [{ nome: contem }, { sku: contem }] } }] },
    ]);
  });

  it.each([
    ['produto', { produto: { nome: 'desc' } }],
    ['lote', { numero: 'desc' }],
    ['quantidade', { quantidade: 'desc' }],
    ['vencimento', { dataVencimento: 'desc' }],
    ['status', { dataVencimento: 'desc' }],
  ] as const)('ordena por %s com desempate estável', async (field, principal) => {
    const { service, tx } = setup();
    await service.list({ ...QUERY, sort: { field, direction: 'desc' } }, AGORA);
    expect(tx.lote.findMany.mock.calls[0]?.[0].orderBy).toEqual([
      principal,
      { dataVencimento: 'asc' },
      { numero: 'asc' },
      { id: 'asc' },
    ]);
  });

  it('resumo: vencidos, vencendo em 60 dias e produtos abaixo do mínimo', async () => {
    const { service, tx } = setup();
    tx.lote.count.mockResolvedValueOnce(2).mockResolvedValueOnce(5);
    expect(await service.resumo(AGORA)).toEqual({ vencidos: 2, vencendo: 5, abaixoMinimo: 4 });
    const [vencidos, vencendo] = tx.lote.count.mock.calls.map((c) => c[0].where.dataVencimento);
    expect(vencidos).toEqual({ lt: new Date('2026-11-17T00:00:00.000Z') });
    expect(vencendo).toEqual({
      gte: new Date('2026-11-17T00:00:00.000Z'),
      lte: new Date('2027-01-16T00:00:00.000Z'),
    });
    expect(tx.produto.count.mock.calls[0]?.[0].where).toMatchObject({
      controlaEstoque: true,
      estoqueMinimo: { gt: 0 },
      estoqueAtual: { lte: 'estoque_minimo_ref' },
    });
  });

  it('"hoje" é o dia no fuso da clínica', async () => {
    const { service, tx } = setup();
    // 02h00 UTC de 17/11 ainda é 16/11 em Brasília.
    await service.contarVencimentos(30, new Date('2026-11-17T02:00:00.000Z'));
    expect(tx.lote.count.mock.calls[0]?.[0].where.dataVencimento).toEqual({
      lt: new Date('2026-11-16T00:00:00.000Z'),
    });
  });

  it('vencendo: lotes de hoje até N dias, do vencimento mais próximo', async () => {
    const { service, tx } = setup();
    const lotes = await service.vencendo(60, AGORA);
    expect(lotes.map((l) => l.status)).toEqual(['VENCENDO']);
    expect(tx.lote.findMany.mock.calls[0]?.[0].orderBy[0]).toEqual({ dataVencimento: 'asc' });
  });

  it('cria o lote com o vencimento como data e devolve o status', async () => {
    const { service, tx } = setup();
    const criado = await service.create(
      { produtoId: PRODUTO_ID, numero: 'LOT-9', dataVencimento: '2026-11-10', quantidade: 3 },
      AGORA,
    );
    expect(tx.lote.create.mock.calls[0]?.[0].data).toEqual({
      produtoId: PRODUTO_ID,
      numero: 'LOT-9',
      dataVencimento: new Date('2026-11-10T00:00:00.000Z'),
      quantidade: 3,
    });
    expect(criado).toMatchObject({ id: 'novo', numero: 'LOT-9', status: 'VENCIDO' });
  });

  it('404 quando o produto não existe, está excluído ou é serviço', async () => {
    const { service, tx } = setup();
    tx.produto.findFirst.mockResolvedValue(null);
    await expect(
      service.create(
        { produtoId: PRODUTO_ID, numero: 'L', dataVencimento: '2027-01-01', quantidade: 1 },
        AGORA,
      ),
    ).rejects.toMatchObject({ status: 404 });
    expect(tx.produto.findFirst.mock.calls[0]?.[0].where).toEqual({
      id: PRODUTO_ID,
      deletedAt: null,
      tipo: 'PRODUTO',
    });
    expect(tx.lote.create).not.toHaveBeenCalled();
  });

  it('exporta com as colunas escolhidas, os filtros e o limite de linhas', async () => {
    const { service, tx, exportService } = setup();
    await service.export(
      { ...QUERY, format: 'pdf', columns: ['produto', 'status'], comSaldo: true },
      AGORA,
    );
    expect(exportService.ensureWithinLimit).toHaveBeenCalledWith(1);
    expect(tx.lote.findMany.mock.calls[0]?.[0].where.AND).toContainEqual({
      quantidade: { gt: 0 },
    });
    const pedido = exportService.export.mock.calls[0]?.[0];
    expect(pedido).toMatchObject({ format: 'pdf', title: 'Controle de Lotes', filename: 'lotes' });
    expect(pedido.columns.map((c: { key: string }) => c.key)).toEqual(['produto', 'status']);
  });

  it('colunas da exportação: rótulo do status e vencimento como data', () => {
    const linha = {
      id: 'l1',
      produtoId: PRODUTO_ID,
      produtoNome: 'Luva',
      produtoSku: null,
      numero: 'LOT-1',
      dataVencimento: '2026-12-01',
      quantidade: '3',
      status: 'VALIDO' as const,
      createdAt: AGORA.toISOString(),
    };
    const valores = Object.fromEntries(LOTE_EXPORT_DEFINITIONS.map((c) => [c.key, c.value(linha)]));
    expect(valores).toEqual({
      produto: 'Luva',
      lote: 'LOT-1',
      quantidade: '3',
      vencimento: new Date('2026-12-01T00:00:00.000Z'),
      status: 'Válido',
    });
  });
});
