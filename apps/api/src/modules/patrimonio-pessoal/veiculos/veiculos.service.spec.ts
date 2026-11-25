import type { TransactionHost } from '@nestjs-cls/transactional';
import { createVeiculoSchema } from '@torres/shared';
import type { ExportService } from '../../../common/export/export.service';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import { VEICULO_EXPORT_DEFINITIONS, VeiculosService, toDto } from './veiculos.service';

const ID = '0b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e61';
const DATA = new Date('2026-11-19T12:00:00.000Z');

/** Decimal como vem do Prisma (`toString`). */
const decimal = (valor: string) => ({ toString: () => valor });

/** Registro como vem do Prisma. */
const VEICULO = {
  id: ID,
  descricao: 'Carro Teste',
  tipo: 'CARRO',
  placa: 'ABC1D23',
  renavam: null,
  chassi: null,
  ano: 2024,
  cor: null,
  uso: 'CLINICA',
  valorCompra: decimal('120000.5'),
  dataCompra: new Date('2024-03-10T00:00:00.000Z'),
  ipvaAnual: decimal('3200'),
  licenciamento: null,
  seguroAnual: decimal('4100.75'),
  vencimentoSeguro: new Date('2027-03-10T00:00:00.000Z'),
  banco: 'Banco Teste',
  financiamentoParcela: decimal('2500'),
  saldoDevedor: null,
  vencimentoFinanciamento: null,
  observacoes: null,
  createdAt: DATA,
  updatedAt: DATA,
  deletedAt: null,
};

const ORDEM = { field: 'descricao', direction: 'asc' } as const;

function setup(existente: object | null = VEICULO) {
  const veiculo = {
    findMany: jest.fn().mockResolvedValue([VEICULO]),
    findFirst: jest.fn().mockResolvedValue(existente),
    count: jest.fn().mockResolvedValue(1),
    create: jest.fn().mockResolvedValue(VEICULO),
    update: jest.fn().mockResolvedValue(VEICULO),
  };
  const txHost = { tx: { veiculo } } as unknown as TransactionHost<PrismaAdapter>;
  const exportService = {
    ensureWithinLimit: jest.fn(),
    export: jest.fn().mockResolvedValue({ filename: 'veiculos.xlsx' }),
  };
  const service = new VeiculosService(txHost, exportService as unknown as ExportService);
  return { service, veiculo, exportService };
}

describe('VeiculosService', () => {
  it('toDto: converte decimais e datas', () => {
    expect(toDto(VEICULO as never)).toMatchObject({
      valorCompra: 120_000.5,
      financiamentoParcela: 2500,
      seguroAnual: 4100.75,
      dataCompra: '2024-03-10',
      vencimentoSeguro: '2027-03-10',
      vencimentoFinanciamento: null,
      licenciamento: null,
      createdAt: DATA.toISOString(),
    });
  });

  it('list: sem excluídos, ordenação com desempate por id', async () => {
    const { service, veiculo } = setup();

    const page = await service.list({ page: 1, pageSize: 10, sort: ORDEM, search: undefined });

    expect(veiculo.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { deletedAt: null },
        orderBy: [{ descricao: 'asc' }, { id: 'asc' }],
        skip: 0,
        take: 10,
      }),
    );
    expect(page.meta.total).toBe(1);
    expect(page.data[0]?.ipvaAnual).toBe(3200);
  });

  it('list: a busca procura na descrição, na placa, no RENAVAM e no chassi', async () => {
    const { service, veiculo } = setup();

    await service.list({
      page: 1,
      pageSize: 10,
      sort: { field: 'ipvaAnual', direction: 'desc' },
      search: 'abc',
    });

    const contem = { contains: 'abc', mode: 'insensitive' };
    expect(veiculo.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          deletedAt: null,
          OR: [{ descricao: contem }, { placa: contem }, { renavam: contem }, { chassi: contem }],
        },
        orderBy: [{ ipvaAnual: 'desc' }, { id: 'desc' }],
      }),
    );
  });

  it('create: grava as datas como Date (coluna date)', async () => {
    const { service, veiculo } = setup();
    const input = createVeiculoSchema.parse({
      descricao: 'Carro',
      dataCompra: '2024-03-10',
      vencimentoSeguro: '2027-01-31',
      vencimentoFinanciamento: '2040-01-31',
    });

    await service.create(input);

    expect(veiculo.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        descricao: 'Carro',
        tipo: 'CARRO',
        uso: 'CLINICA',
        dataCompra: new Date('2024-03-10T00:00:00.000Z'),
        vencimentoSeguro: new Date('2027-01-31T00:00:00.000Z'),
        vencimentoFinanciamento: new Date('2040-01-31T00:00:00.000Z'),
      }),
    });
  });

  it('update: substitui os campos do veículo existente', async () => {
    const { service, veiculo } = setup();
    const input = createVeiculoSchema.parse({ descricao: 'Novo nome', tipo: 'MOTO' });

    await service.update(ID, input);

    expect(veiculo.findFirst).toHaveBeenCalledWith({ where: { id: ID, deletedAt: null } });
    expect(veiculo.update).toHaveBeenCalledWith({
      where: { id: ID },
      data: expect.objectContaining({ descricao: 'Novo nome', tipo: 'MOTO', dataCompra: null }),
    });
  });

  it('remove: exclusão lógica', async () => {
    const { service, veiculo } = setup();

    await service.remove(ID);

    expect(veiculo.update).toHaveBeenCalledWith({
      where: { id: ID },
      data: { deletedAt: expect.any(Date) },
    });
  });

  it('404 quando não existe, foi excluído ou o id não é uuid', async () => {
    const { service, veiculo } = setup(null);

    await expect(service.findById(ID)).rejects.toMatchObject({ status: 404 });
    await expect(
      service.update(ID, createVeiculoSchema.parse({ descricao: 'x' })),
    ).rejects.toMatchObject({ status: 404 });
    await expect(service.remove(ID)).rejects.toMatchObject({ status: 404 });
    await expect(service.findById('abc')).rejects.toMatchObject({ status: 404 });
    expect(veiculo.findFirst).toHaveBeenCalledTimes(3);
    expect(veiculo.update).not.toHaveBeenCalled();
  });

  it('export: confere o limite e exporta as colunas pedidas, já como DTO', async () => {
    const { service, exportService } = setup();

    await service.export({
      sort: ORDEM,
      search: undefined,
      format: 'xlsx',
      columns: ['descricao', 'ipvaAnual'],
    });

    expect(exportService.ensureWithinLimit).toHaveBeenCalledWith(1);
    const pedido = exportService.export.mock.calls[0][0];
    expect(pedido).toMatchObject({ format: 'xlsx', title: 'Veículos', filename: 'veiculos' });
    expect(pedido.columns.map((c: { key: string }) => c.key)).toEqual(['descricao', 'ipvaAnual']);
    expect(pedido.rows[0]).toMatchObject({ ipvaAnual: 3200 });
  });

  it('colunas da exportação: rótulos de tipo e uso e valores em moeda', () => {
    const dto = toDto({ ...VEICULO, tipo: 'UTILITARIO', uso: 'MISTO', placa: null } as never);
    const valores = Object.fromEntries(
      VEICULO_EXPORT_DEFINITIONS.map((c) => [c.key, { tipo: c.type, valor: c.value(dto) }]),
    );
    expect(valores).toEqual({
      descricao: { tipo: undefined, valor: 'Carro Teste' },
      placa: { tipo: undefined, valor: '' },
      tipo: { tipo: undefined, valor: 'Utilitário' },
      uso: { tipo: undefined, valor: 'Misto' },
      ipvaAnual: { tipo: 'currency', valor: 3200 },
      seguroAnual: { tipo: 'currency', valor: 4100.75 },
      financiamentoParcela: { tipo: 'currency', valor: 2500 },
    });
  });
});
