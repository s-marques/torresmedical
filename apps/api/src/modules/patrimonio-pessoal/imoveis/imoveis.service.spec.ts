import type { TransactionHost } from '@nestjs-cls/transactional';
import { createImovelSchema } from '@torres/shared';
import type { ExportService } from '../../../common/export/export.service';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import { IMOVEL_EXPORT_DEFINITIONS, ImoveisService, toDto } from './imoveis.service';

const ID = '0b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e61';
const DATA = new Date('2026-11-19T12:00:00.000Z');

/** Decimal como vem do Prisma (`toString`). */
const decimal = (valor: string) => ({ toString: () => valor });

/** Registro como vem do Prisma. */
const IMOVEL = {
  id: ID,
  descricao: 'Apto Teste',
  tipo: 'APARTAMENTO',
  endereco: 'Rua Fictícia, 1',
  matricula: null,
  valorCompra: decimal('350000.5'),
  dataCompra: new Date('2024-03-10T00:00:00.000Z'),
  iptuAnual: null,
  itbiPago: null,
  banco: 'Banco Teste',
  financiamentoParcela: decimal('2500'),
  saldoDevedor: null,
  vencimentoFinanciamento: null,
  condominio: decimal('450.10'),
  contaLuz: decimal('120.20'),
  contaAgua: null,
  internet: decimal('99.90'),
  seguro: decimal('0.10'),
  observacoes: null,
  createdAt: DATA,
  updatedAt: DATA,
  deletedAt: null,
};

const ORDEM = { field: 'descricao', direction: 'asc' } as const;

function setup(existente: object | null = IMOVEL) {
  const imovel = {
    findMany: jest.fn().mockResolvedValue([IMOVEL]),
    findFirst: jest.fn().mockResolvedValue(existente),
    count: jest.fn().mockResolvedValue(1),
    create: jest.fn().mockResolvedValue(IMOVEL),
    update: jest.fn().mockResolvedValue(IMOVEL),
  };
  const txHost = { tx: { imovel } } as unknown as TransactionHost<PrismaAdapter>;
  const exportService = {
    ensureWithinLimit: jest.fn(),
    export: jest.fn().mockResolvedValue({ filename: 'imoveis.xlsx' }),
  };
  const service = new ImoveisService(txHost, exportService as unknown as ExportService);
  return { service, imovel, exportService };
}

describe('ImoveisService', () => {
  it('toDto: converte decimais e datas e calcula a Desp. Mensal', () => {
    expect(toDto(IMOVEL as never)).toMatchObject({
      valorCompra: 350_000.5,
      financiamentoParcela: 2500,
      dataCompra: '2024-03-10',
      vencimentoFinanciamento: null,
      contaAgua: null,
      despesaMensal: 670.3,
      createdAt: DATA.toISOString(),
    });
  });

  it('list: sem excluídos, ordenação com desempate por id', async () => {
    const { service, imovel } = setup();

    const page = await service.list({ page: 1, pageSize: 10, sort: ORDEM, search: undefined });

    expect(imovel.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { deletedAt: null },
        orderBy: [{ descricao: 'asc' }, { id: 'asc' }],
        skip: 0,
        take: 10,
      }),
    );
    expect(page.meta.total).toBe(1);
    expect(page.data[0]?.despesaMensal).toBe(670.3);
  });

  it('list: a busca procura na descrição, no endereço e na matrícula', async () => {
    const { service, imovel } = setup();

    await service.list({
      page: 1,
      pageSize: 10,
      sort: { field: 'valorCompra', direction: 'desc' },
      search: 'apto',
    });

    const contem = { contains: 'apto', mode: 'insensitive' };
    expect(imovel.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          deletedAt: null,
          OR: [{ descricao: contem }, { endereco: contem }, { matricula: contem }],
        },
        orderBy: [{ valorCompra: 'desc' }, { id: 'desc' }],
      }),
    );
  });

  it('create: grava as datas como Date (coluna date)', async () => {
    const { service, imovel } = setup();
    const input = createImovelSchema.parse({
      descricao: 'Apto',
      dataCompra: '2024-03-10',
      vencimentoFinanciamento: '2040-01-31',
    });

    await service.create(input);

    expect(imovel.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        descricao: 'Apto',
        tipo: 'APARTAMENTO',
        dataCompra: new Date('2024-03-10T00:00:00.000Z'),
        vencimentoFinanciamento: new Date('2040-01-31T00:00:00.000Z'),
      }),
    });
  });

  it('update: substitui os campos do imóvel existente', async () => {
    const { service, imovel } = setup();
    const input = createImovelSchema.parse({ descricao: 'Novo nome', tipo: 'GALPAO' });

    await service.update(ID, input);

    expect(imovel.findFirst).toHaveBeenCalledWith({ where: { id: ID, deletedAt: null } });
    expect(imovel.update).toHaveBeenCalledWith({
      where: { id: ID },
      data: expect.objectContaining({ descricao: 'Novo nome', tipo: 'GALPAO', dataCompra: null }),
    });
  });

  it('remove: exclusão lógica', async () => {
    const { service, imovel } = setup();

    await service.remove(ID);

    expect(imovel.update).toHaveBeenCalledWith({
      where: { id: ID },
      data: { deletedAt: expect.any(Date) },
    });
  });

  it('404 quando não existe, foi excluído ou o id não é uuid', async () => {
    const { service, imovel } = setup(null);

    await expect(service.findById(ID)).rejects.toMatchObject({ status: 404 });
    await expect(
      service.update(ID, createImovelSchema.parse({ descricao: 'x' })),
    ).rejects.toMatchObject({ status: 404 });
    await expect(service.remove(ID)).rejects.toMatchObject({ status: 404 });
    await expect(service.findById('abc')).rejects.toMatchObject({ status: 404 });
    expect(imovel.findFirst).toHaveBeenCalledTimes(3);
    expect(imovel.update).not.toHaveBeenCalled();
  });

  it('export: confere o limite e exporta as colunas pedidas, já como DTO', async () => {
    const { service, exportService } = setup();

    await service.export({
      sort: ORDEM,
      search: undefined,
      format: 'xlsx',
      columns: ['descricao', 'despesaMensal'],
    });

    expect(exportService.ensureWithinLimit).toHaveBeenCalledWith(1);
    const pedido = exportService.export.mock.calls[0][0];
    expect(pedido).toMatchObject({ format: 'xlsx', title: 'Imóveis', filename: 'imoveis' });
    expect(pedido.columns.map((c: { key: string }) => c.key)).toEqual([
      'descricao',
      'despesaMensal',
    ]);
    expect(pedido.rows[0]).toMatchObject({ despesaMensal: 670.3 });
  });

  it('colunas da exportação: rótulo do tipo e valores em moeda', () => {
    const dto = toDto({ ...IMOVEL, tipo: 'GALPAO', endereco: null } as never);
    const valores = Object.fromEntries(
      IMOVEL_EXPORT_DEFINITIONS.map((c) => [c.key, { tipo: c.type, valor: c.value(dto) }]),
    );
    expect(valores).toEqual({
      descricao: { tipo: undefined, valor: 'Apto Teste' },
      tipo: { tipo: undefined, valor: 'Galpão' },
      endereco: { tipo: undefined, valor: '' },
      valorCompra: { tipo: 'currency', valor: 350_000.5 },
      financiamentoParcela: { tipo: 'currency', valor: 2500 },
      despesaMensal: { tipo: 'currency', valor: 670.3 },
    });
  });
});
