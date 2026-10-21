import type { TransactionHost } from '@nestjs-cls/transactional';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import type { SalaEmUsoVerificador } from './sala-em-uso';
import { SalasService } from './salas.service';

const ID = '0b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const AGORA = new Date('2026-10-21T12:00:00Z');
const SALA = {
  id: ID,
  nome: 'Sala 1',
  numero: '01',
  andar: '2º andar',
  tipo: 'CONSULTORIO',
  capacidade: 1,
  metragem: '12.5',
  valorHora: '50',
  valorTurno: null,
  valorMensal: '3000.75',
  equipamentos: null,
  ativo: true,
  createdAt: AGORA,
  updatedAt: AGORA,
  deletedAt: null,
};
const QUERY = {
  page: 1,
  pageSize: 100,
  sort: { field: 'nome', direction: 'asc' },
  search: undefined,
} as const;
const DADOS = {
  nome: 'Sala 1',
  numero: null,
  andar: null,
  tipo: 'CONSULTORIO',
  metragem: null,
  valorHora: null,
  valorTurno: null,
  valorMensal: null,
  equipamentos: null,
} as const;

function setup(opcoes: { sala?: unknown; emUso?: string[] } = {}) {
  const sala = {
    findMany: jest.fn().mockResolvedValue([SALA]),
    count: jest.fn().mockResolvedValue(1),
    findFirst: jest.fn().mockResolvedValue('sala' in opcoes ? opcoes.sala : SALA),
    create: jest.fn().mockResolvedValue(SALA),
    update: jest.fn().mockResolvedValue(SALA),
  };
  const txHost = { tx: { sala } } as unknown as TransactionHost<PrismaAdapter>;
  const verificador: SalaEmUsoVerificador = {
    emUso: jest.fn().mockResolvedValue(new Set(opcoes.emUso ?? [])),
  };
  return { service: new SalasService(txHost, [verificador]), sala, verificador };
}

describe('SalasService', () => {
  it('list: ignora excluídas, filtra, busca e converte os valores', async () => {
    const { service, sala } = setup({ emUso: [ID] });

    const page = await service.list({
      ...QUERY,
      search: 'sala',
      tipo: 'CONSULTORIO',
      status: 'ativo',
    });

    expect(sala.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          deletedAt: null,
          tipo: 'CONSULTORIO',
          ativo: true,
          OR: [
            { nome: { contains: 'sala', mode: 'insensitive' } },
            { numero: { contains: 'sala', mode: 'insensitive' } },
            { andar: { contains: 'sala', mode: 'insensitive' } },
            { equipamentos: { contains: 'sala', mode: 'insensitive' } },
          ],
        },
        orderBy: [{ nome: 'asc' }, { id: 'asc' }],
      }),
    );
    expect(page.data[0]).toMatchObject({
      metragem: 12.5,
      valorHora: 50,
      valorTurno: null,
      valorMensal: 3000.75,
      emUso: true,
    });
  });

  it('list: sem salas não consulta os verificadores', async () => {
    const { service, sala, verificador } = setup();
    sala.findMany.mockResolvedValue([]);
    sala.count.mockResolvedValue(0);

    await service.list(QUERY);

    expect(verificador.emUso).not.toHaveBeenCalled();
  });

  it('create: grava os dados do formulário', async () => {
    const { service, sala } = setup();
    const criada = await service.create(DADOS);
    expect(sala.create).toHaveBeenCalledWith({ data: DADOS });
    expect(criada).toMatchObject({ id: ID, emUso: false });
  });

  it('update: substitui os campos; 404 se não existe', async () => {
    const { service, sala } = setup();
    await service.update(ID, DADOS);
    expect(sala.update).toHaveBeenCalledWith({ where: { id: ID }, data: DADOS });

    await expect(setup({ sala: null }).service.update(ID, DADOS)).rejects.toMatchObject({
      status: 404,
    });
  });

  it('remove: exclusão lógica da sala livre', async () => {
    const { service, sala } = setup();
    await service.remove(ID);
    expect(sala.update).toHaveBeenCalledWith({
      where: { id: ID },
      data: { deletedAt: expect.any(Date) },
    });
  });

  it('remove: 409 SALA_EM_USO quando há contrato', async () => {
    const { service, sala } = setup({ emUso: [ID] });
    await expect(service.remove(ID)).rejects.toMatchObject({ code: 'SALA_EM_USO', status: 409 });
    expect(sala.update).not.toHaveBeenCalled();
  });

  it('id que não é uuid vira 404', async () => {
    await expect(setup().service.findById('abc')).rejects.toMatchObject({ status: 404 });
  });
});
