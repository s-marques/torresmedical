import type { TransactionHost } from '@nestjs-cls/transactional';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import { CentrosCustoService } from './centros-custo.service';

const ID = '0b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const CENTRO = {
  id: ID,
  nome: 'Administrativo',
  ativo: true,
  createdAt: new Date('2026-11-01T12:00:00.000Z'),
  updatedAt: new Date('2026-11-01T12:00:00.000Z'),
  deletedAt: null,
};

function setup() {
  const centroCusto = {
    findMany: jest.fn().mockResolvedValue([CENTRO]),
    findFirst: jest.fn().mockResolvedValue(null),
    count: jest.fn().mockResolvedValue(1),
    create: jest.fn().mockResolvedValue(CENTRO),
    update: jest.fn().mockResolvedValue(CENTRO),
  };
  const txHost = { tx: { centroCusto } } as unknown as TransactionHost<PrismaAdapter>;
  return { service: new CentrosCustoService(txHost), centroCusto };
}

describe('CentrosCustoService', () => {
  it('list ignora excluídos e busca pelo nome', async () => {
    const { service, centroCusto } = setup();
    const res = await service.list({
      page: 1,
      pageSize: 10,
      sort: { field: 'nome', direction: 'asc' },
      search: 'adm',
    });
    expect(res.meta.total).toBe(1);
    expect(centroCusto.findMany.mock.calls[0][0].where).toMatchObject({ deletedAt: null });
    expect(centroCusto.findMany.mock.calls[0][0].where.OR).toBeDefined();
  });

  it('create grava o nome', async () => {
    const { service, centroCusto } = setup();
    await service.create({ nome: 'Clínico' });
    expect(centroCusto.create).toHaveBeenCalledWith({ data: { nome: 'Clínico' } });
  });

  it('create recusa nome repetido (sem diferenciar maiúsculas)', async () => {
    const { service, centroCusto } = setup();
    centroCusto.findFirst.mockResolvedValue({ id: 'outro' });
    await expect(service.create({ nome: 'administrativo' })).rejects.toMatchObject({
      code: 'DUPLICATE',
      status: 409,
    });
    expect(centroCusto.findFirst.mock.calls[0][0].where.nome).toEqual({
      equals: 'administrativo',
      mode: 'insensitive',
    });
    expect(centroCusto.create).not.toHaveBeenCalled();
  });

  it('update altera o interruptor ativo sem checar o nome', async () => {
    const { service, centroCusto } = setup();
    centroCusto.findFirst.mockResolvedValue(CENTRO);
    await service.update(ID, { ativo: false });
    expect(centroCusto.update).toHaveBeenCalledWith({ where: { id: ID }, data: { ativo: false } });
    expect(centroCusto.findFirst).toHaveBeenCalledTimes(1);
  });

  it('update com nome novo ignora o próprio registro na checagem de duplicidade', async () => {
    const { service, centroCusto } = setup();
    centroCusto.findFirst.mockResolvedValueOnce(CENTRO).mockResolvedValueOnce(null);
    await service.update(ID, { nome: 'Administração' });
    expect(centroCusto.findFirst.mock.calls[1][0].where.id).toEqual({ not: ID });
  });

  it('update e remove de centro inexistente dão 404', async () => {
    const { service } = setup();
    await expect(service.update(ID, { ativo: false })).rejects.toMatchObject({ status: 404 });
    await expect(service.remove(ID)).rejects.toMatchObject({ status: 404 });
  });

  it('remove é exclusão lógica', async () => {
    const { service, centroCusto } = setup();
    centroCusto.findFirst.mockResolvedValue(CENTRO);
    await service.remove(ID);
    expect(centroCusto.update).toHaveBeenCalledWith({
      where: { id: ID },
      data: { deletedAt: expect.any(Date) },
    });
  });

  it('lookup só oferece ativos e não excluídos', async () => {
    const { service, centroCusto } = setup();
    const res = await service.lookup({
      page: 1,
      pageSize: 10,
      sort: { field: 'nome', direction: 'asc' },
      search: undefined,
    });
    expect(res.data).toEqual([{ id: ID, label: 'Administrativo', descricao: null }]);
    expect(centroCusto.findMany.mock.calls[0][0].where).toMatchObject({
      deletedAt: null,
      ativo: true,
    });
  });
});
