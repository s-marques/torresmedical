import type { TransactionHost } from '@nestjs-cls/transactional';
import { createColetaResiduoSchema } from '@torres/shared';
import type { ExportService } from '../../../common/export/export.service';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import {
  COLETA_RESIDUO_EXPORT_DEFINITIONS,
  ColetasResiduoService,
  toDto,
} from './coletas-residuo.service';

const ID = '0b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e65';
const DATA = new Date('2026-11-23T12:00:00.000Z');

/** Registro como vem do Prisma (`pesoKg` é Decimal). */
const COLETA = {
  id: ID,
  dataColeta: new Date('2026-11-10T00:00:00.000Z'),
  proximaColeta: new Date('2026-12-10T00:00:00.000Z'),
  empresaColetora: 'Coleta Teste Ltda',
  manifestoMtr: 'MTR-001',
  pesoKg: { toString: () => '12.5' },
  tipoResiduo: 'INFECTANTE',
  responsavel: 'Fulana de Teste',
  observacoes: null,
  createdAt: DATA,
  updatedAt: DATA,
  deletedAt: null,
};

const ORDEM = { field: 'dataColeta', direction: 'desc' } as const;

function setup(existente: object | null = COLETA) {
  const coletaResiduo = {
    findMany: jest.fn().mockResolvedValue([COLETA]),
    findFirst: jest.fn().mockResolvedValue(existente),
    count: jest.fn().mockResolvedValue(1),
    create: jest.fn().mockResolvedValue(COLETA),
    update: jest.fn().mockResolvedValue(COLETA),
  };
  const txHost = { tx: { coletaResiduo } } as unknown as TransactionHost<PrismaAdapter>;
  const exportService = {
    ensureWithinLimit: jest.fn(),
    export: jest.fn().mockResolvedValue({ filename: 'coletas-residuo.xlsx' }),
  };
  const service = new ColetasResiduoService(txHost, exportService as unknown as ExportService);
  return { service, coletaResiduo, exportService };
}

describe('ColetasResiduoService', () => {
  it('toDto: converte datas, decimal e carimbos', () => {
    expect(toDto(COLETA as never)).toEqual({
      id: ID,
      dataColeta: '2026-11-10',
      proximaColeta: '2026-12-10',
      empresaColetora: 'Coleta Teste Ltda',
      manifestoMtr: 'MTR-001',
      pesoKg: 12.5,
      tipoResiduo: 'INFECTANTE',
      responsavel: 'Fulana de Teste',
      observacoes: null,
      createdAt: DATA.toISOString(),
      updatedAt: DATA.toISOString(),
    });
    expect(toDto({ ...COLETA, proximaColeta: null, pesoKg: null } as never)).toMatchObject({
      proximaColeta: null,
      pesoKg: null,
    });
  });

  it('list: sem excluídas, ordenação com desempate por id na mesma direção', async () => {
    const { service, coletaResiduo } = setup();

    const page = await service.list({ page: 1, pageSize: 10, sort: ORDEM, search: undefined });

    expect(coletaResiduo.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { deletedAt: null },
        orderBy: [{ dataColeta: 'desc' }, { id: 'desc' }],
        skip: 0,
        take: 10,
      }),
    );
    expect(page.meta.total).toBe(1);
    expect(page.data[0]?.pesoKg).toBe(12.5);
  });

  it('list: a busca procura na empresa coletora, no MTR e no responsável', async () => {
    const { service, coletaResiduo } = setup();

    await service.list({ page: 1, pageSize: 10, sort: ORDEM, search: 'mtr' });

    expect(coletaResiduo.count).toHaveBeenCalledWith({
      where: {
        deletedAt: null,
        OR: [
          { empresaColetora: { contains: 'mtr', mode: 'insensitive' } },
          { manifestoMtr: { contains: 'mtr', mode: 'insensitive' } },
          { responsavel: { contains: 'mtr', mode: 'insensitive' } },
        ],
      },
    });
  });

  it('findById: 404 para inexistente, excluída ou id inválido', async () => {
    await expect(setup(null).service.findById(ID)).rejects.toMatchObject({
      status: 404,
      message: 'Coleta não encontrada',
    });
    const { service, coletaResiduo } = setup();
    await expect(service.findById('abc')).rejects.toMatchObject({ status: 404 });
    expect(coletaResiduo.findFirst).not.toHaveBeenCalled();
  });

  it('create: grava as datas como date (meia-noite UTC)', async () => {
    const { service, coletaResiduo } = setup();
    const input = createColetaResiduoSchema.parse({
      dataColeta: '2026-11-10',
      proximaColeta: '2026-12-10',
      tipoResiduo: 'QUIMICO',
      pesoKg: 3,
    });

    await service.create(input);

    expect(coletaResiduo.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        dataColeta: new Date('2026-11-10T00:00:00.000Z'),
        proximaColeta: new Date('2026-12-10T00:00:00.000Z'),
        tipoResiduo: 'QUIMICO',
        pesoKg: 3,
        empresaColetora: null,
      }),
    });
  });

  it('update: confere a existência e substitui os campos; sem próxima coleta grava null', async () => {
    const { service, coletaResiduo } = setup();
    const input = createColetaResiduoSchema.parse({
      dataColeta: '2026-11-11',
      tipoResiduo: 'PERFUROCORTANTE',
    });

    await service.update(ID, input);

    expect(coletaResiduo.findFirst).toHaveBeenCalledWith({ where: { id: ID, deletedAt: null } });
    expect(coletaResiduo.update).toHaveBeenCalledWith({
      where: { id: ID },
      data: expect.objectContaining({ proximaColeta: null, pesoKg: null }),
    });
    await expect(setup(null).service.update(ID, input)).rejects.toMatchObject({ status: 404 });
  });

  it('remove: exclusão lógica; 404 quando não existe', async () => {
    const { service, coletaResiduo } = setup();

    await service.remove(ID);

    expect(coletaResiduo.update).toHaveBeenCalledWith({
      where: { id: ID },
      data: { deletedAt: expect.any(Date) },
    });
    await expect(setup(null).service.remove(ID)).rejects.toMatchObject({ status: 404 });
  });

  it('export: respeita o limite e usa as colunas pedidas', async () => {
    const { service, exportService } = setup();

    const arquivo = await service.export({
      format: 'xlsx',
      sort: ORDEM,
      search: undefined,
      columns: ['dataColeta', 'tipoResiduo'],
    } as never);

    expect(arquivo).toEqual({ filename: 'coletas-residuo.xlsx' });
    expect(exportService.ensureWithinLimit).toHaveBeenCalledWith(1);
    expect(exportService.export).toHaveBeenCalledWith(
      expect.objectContaining({
        format: 'xlsx',
        filename: 'coletas-residuo',
        columns: [
          expect.objectContaining({ key: 'dataColeta' }),
          expect.objectContaining({ key: 'tipoResiduo' }),
        ],
      }),
    );
  });

  it('colunas de exportação: datas em DD/MM/AAAA e tipo por extenso', () => {
    const dto = toDto(COLETA as never);
    const valor = (chave: string) =>
      COLETA_RESIDUO_EXPORT_DEFINITIONS.find((c) => c.key === chave)?.value(dto);
    expect(valor('dataColeta')).toBe('10/11/2026');
    expect(valor('proximaColeta')).toBe('10/12/2026');
    expect(valor('tipoResiduo')).toBe('Infectante');
    expect(valor('pesoKg')).toBe(12.5);
  });
});
