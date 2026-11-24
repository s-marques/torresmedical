import type { TransactionHost } from '@nestjs-cls/transactional';
import { createBemSchema } from '@torres/shared';
import type { ExportService } from '../../../common/export/export.service';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import { BEM_EXPORT_DEFINITIONS, PatrimonioService, toDto } from './patrimonio.service';

const ID = '0b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e62';
const DATA = new Date('2026-11-23T12:00:00.000Z');
const decimal = (valor: string) => ({ toString: () => valor });

const BEM = {
  id: ID,
  produtoId: null,
  descricao: 'Carro Teste',
  tipo: 'AUTOMOVEL',
  valorCompra: decimal('120000.5'),
  valorAtual: null,
  dataAquisicao: new Date('2024-05-20T00:00:00.000Z'),
  marca: 'Marca X',
  modelo: null,
  ano: 2024,
  placa: 'ABC-1D23',
  renavam: null,
  financiado: true,
  possuiSeguro: false,
  createdAt: DATA,
  updatedAt: DATA,
  deletedAt: null,
};

const ORDEM = { field: 'descricao', direction: 'asc' } as const;

function setup(existente: object | null = BEM) {
  const bem = {
    findMany: jest.fn().mockResolvedValue([BEM]),
    findFirst: jest.fn().mockResolvedValue(existente),
    count: jest.fn().mockResolvedValue(1),
    create: jest.fn().mockResolvedValue(BEM),
    update: jest.fn().mockResolvedValue(BEM),
  };
  const txHost = { tx: { bem } } as unknown as TransactionHost<PrismaAdapter>;
  const exportService = {
    ensureWithinLimit: jest.fn(),
    export: jest.fn().mockResolvedValue({ filename: 'patrimonio.xlsx' }),
  };
  const service = new PatrimonioService(txHost, exportService as unknown as ExportService);
  return { service, bem, exportService };
}

describe('PatrimonioService', () => {
  it('toDto: converte decimais e datas; Impostos Pend. é 0', () => {
    expect(toDto(BEM as never)).toMatchObject({
      valorCompra: 120_000.5,
      valorAtual: null,
      dataAquisicao: '2024-05-20',
      impostosPendentes: 0,
      createdAt: DATA.toISOString(),
    });
  });

  it('list: sem excluídos, com filtro de tipo e busca', async () => {
    const { service, bem } = setup();

    const page = await service.list({
      page: 1,
      pageSize: 10,
      sort: ORDEM,
      search: 'abc',
      tipo: 'AUTOMOVEL',
    });

    const contem = { contains: 'abc', mode: 'insensitive' };
    expect(bem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          deletedAt: null,
          tipo: 'AUTOMOVEL',
          OR: [{ descricao: contem }, { placa: contem }, { renavam: contem }],
        },
        orderBy: [{ descricao: 'asc' }, { id: 'asc' }],
        skip: 0,
        take: 10,
      }),
    );
    expect(page.meta.total).toBe(1);
  });

  it('resumo: soma o valor atual ou, na falta, o de compra', async () => {
    const { service, bem } = setup();
    bem.findMany.mockResolvedValue([
      { valorAtual: decimal('80.05'), valorCompra: decimal('100.10') },
      { valorAtual: null, valorCompra: decimal('200') },
      { valorAtual: null, valorCompra: null },
    ]);

    expect(await service.resumo()).toEqual({
      valorTotal: 280.05,
      impostosPendentes: 0,
      alertasProximos: 0,
    });
  });

  it('create: data como Date e Dados do Veículo mantidos para Automóvel', async () => {
    const { service, bem } = setup();

    await service.create(
      createBemSchema.parse({
        descricao: 'Carro',
        dataAquisicao: '2024-05-20',
        marca: 'X',
        financiado: true,
      }),
    );

    expect(bem.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        dataAquisicao: new Date('2024-05-20T00:00:00.000Z'),
        marca: 'X',
        financiado: true,
      }),
    });
  });

  it('create: descarta os Dados do Veículo fora de Automóvel', async () => {
    const { service, bem } = setup();

    await service.create(
      createBemSchema.parse({
        descricao: 'Terreno',
        tipo: 'IMOVEL_RURAL',
        marca: 'X',
        placa: 'Y',
        ano: 2020,
        possuiSeguro: true,
      }),
    );

    expect(bem.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        marca: null,
        placa: null,
        ano: null,
        financiado: false,
        possuiSeguro: false,
      }),
    });
  });

  it('update e remove: exclusão lógica e substituição dos campos', async () => {
    const { service, bem } = setup();

    await service.update(ID, createBemSchema.parse({ descricao: 'Novo', tipo: 'BEM_MOVEL' }));
    await service.remove(ID);

    expect(bem.findFirst).toHaveBeenCalledWith({ where: { id: ID, deletedAt: null } });
    expect(bem.update).toHaveBeenNthCalledWith(1, {
      where: { id: ID },
      data: expect.objectContaining({ descricao: 'Novo', tipo: 'BEM_MOVEL' }),
    });
    expect(bem.update).toHaveBeenNthCalledWith(2, {
      where: { id: ID },
      data: { deletedAt: expect.any(Date) },
    });
  });

  it('404 quando não existe, foi excluído ou o id não é uuid', async () => {
    const { service, bem } = setup(null);

    await expect(service.findById(ID)).rejects.toMatchObject({ status: 404 });
    await expect(
      service.update(ID, createBemSchema.parse({ descricao: 'x' })),
    ).rejects.toMatchObject({ status: 404 });
    await expect(service.remove(ID)).rejects.toMatchObject({ status: 404 });
    await expect(service.findById('abc')).rejects.toMatchObject({ status: 404 });
    expect(bem.update).not.toHaveBeenCalled();
  });

  it('export: confere o limite e exporta as colunas pedidas', async () => {
    const { service, exportService } = setup();

    await service.export({
      sort: ORDEM,
      search: undefined,
      tipo: undefined,
      format: 'xlsx',
      columns: ['descricao', 'valorCompra'],
    });

    expect(exportService.ensureWithinLimit).toHaveBeenCalledWith(1);
    const pedido = exportService.export.mock.calls[0][0];
    expect(pedido).toMatchObject({ format: 'xlsx', title: 'Patrimônio', filename: 'patrimonio' });
    expect(pedido.columns.map((c: { key: string }) => c.key)).toEqual(['descricao', 'valorCompra']);
  });

  it('colunas da exportação: rótulo do tipo, moeda e data', () => {
    const dto = toDto(BEM as never);
    const valores = Object.fromEntries(
      BEM_EXPORT_DEFINITIONS.map((c) => [c.key, { tipo: c.type, valor: c.value(dto) }]),
    );
    expect(valores).toEqual({
      descricao: { tipo: undefined, valor: 'Carro Teste' },
      tipo: { tipo: undefined, valor: 'Automóvel' },
      valorCompra: { tipo: 'currency', valor: 120_000.5 },
      valorAtual: { tipo: 'currency', valor: null },
      dataAquisicao: { tipo: 'date', valor: '2024-05-20' },
      impostosPendentes: { tipo: 'number', valor: 0 },
    });
  });
});
