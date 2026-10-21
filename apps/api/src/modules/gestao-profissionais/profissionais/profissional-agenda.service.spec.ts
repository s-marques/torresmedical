import type { TransactionHost } from '@nestjs-cls/transactional';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import { ProfissionalAgendaService } from './profissional-agenda.service';
import type { ProfissionaisService } from './profissionais.service';

const PROFISSIONAL_ID = '0b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const BLOQUEIO_ID = '7a1d3c52-8d0f-4b8e-9f4c-2b2f3c4d5e6f';

const BLOQUEIO = {
  id: BLOQUEIO_ID,
  profissionalId: PROFISSIONAL_ID,
  dataInicio: new Date('2026-11-02T00:00:00.000Z'),
  dataFim: new Date('2026-11-06T00:00:00.000Z'),
  tipo: 'DIA_INTEIRO',
  horaInicio: null,
  horaFim: null,
  motivo: 'FERIAS',
  createdAt: new Date('2026-10-21T10:00:00.000Z'),
  deletedAt: null,
};

function setup() {
  const horario = {
    findMany: jest.fn().mockResolvedValue([]),
    deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    createMany: jest.fn().mockResolvedValue({ count: 0 }),
  };
  const bloqueio = {
    findMany: jest.fn().mockResolvedValue([BLOQUEIO]),
    findFirst: jest.fn().mockResolvedValue(BLOQUEIO),
    create: jest.fn().mockResolvedValue(BLOQUEIO),
    update: jest.fn().mockResolvedValue(BLOQUEIO),
  };
  const txHost = {
    tx: { horarioAtendimento: horario, bloqueioAgenda: bloqueio },
  } as unknown as TransactionHost<PrismaAdapter>;
  const profissionais = { garantirExiste: jest.fn().mockResolvedValue(undefined) };
  return {
    service: new ProfissionalAgendaService(
      txHost,
      profissionais as unknown as ProfissionaisService,
    ),
    horario,
    bloqueio,
    profissionais,
  };
}

describe('ProfissionalAgendaService', () => {
  it('salvarHorarios: substitui a lista e normaliza dia da semana e data', async () => {
    const { service, horario } = setup();

    await service.salvarHorarios(PROFISSIONAL_ID, {
      horarios: [
        {
          tipo: 'SEMANAL',
          diaSemana: 4,
          data: '2026-01-01',
          inicio: '13:30',
          fim: '18:00',
          almocoInicio: null,
          almocoFim: null,
        },
        {
          tipo: 'POR_DATA',
          diaSemana: 2,
          data: '2026-12-24',
          inicio: '08:00',
          fim: '12:00',
          almocoInicio: null,
          almocoFim: null,
        },
      ],
    });

    expect(horario.deleteMany).toHaveBeenCalledWith({ where: { profissionalId: PROFISSIONAL_ID } });
    const { data } = horario.createMany.mock.calls[0][0];
    expect(data[0]).toMatchObject({ diaSemana: 4, data: null });
    expect(data[1]).toMatchObject({ diaSemana: null, data: new Date('2026-12-24T00:00:00.000Z') });
  });

  it('salvarHorarios: lista vazia só apaga', async () => {
    const { service, horario } = setup();

    await service.salvarHorarios(PROFISSIONAL_ID, { horarios: [] });

    expect(horario.deleteMany).toHaveBeenCalled();
    expect(horario.createMany).not.toHaveBeenCalled();
  });

  it('exige o profissional existente (404 vem do ProfissionaisService)', async () => {
    const { service, profissionais, horario } = setup();
    profissionais.garantirExiste.mockRejectedValue(new Error('404'));

    await expect(service.listarHorarios(PROFISSIONAL_ID)).rejects.toThrow('404');
    await expect(service.salvarHorarios(PROFISSIONAL_ID, { horarios: [] })).rejects.toThrow('404');
    expect(horario.deleteMany).not.toHaveBeenCalled();
  });

  it('listarBloqueios: só os que terminam hoje ou depois', async () => {
    const { service, bloqueio } = setup();

    const lista = await service.listarBloqueios(PROFISSIONAL_ID, new Date('2026-11-03T15:00:00Z'));

    expect(bloqueio.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          profissionalId: PROFISSIONAL_ID,
          deletedAt: null,
          dataFim: { gte: new Date('2026-11-03T00:00:00.000Z') },
        },
      }),
    );
    expect(lista[0]).toMatchObject({
      dataInicio: '2026-11-02',
      dataFim: '2026-11-06',
      motivo: 'FERIAS',
    });
  });

  it('criarBloqueio: grava o período e devolve o DTO', async () => {
    const { service, bloqueio } = setup();

    const criado = await service.criarBloqueio(PROFISSIONAL_ID, {
      dataInicio: '2026-11-02',
      dataFim: '2026-11-06',
      tipo: 'DIA_INTEIRO',
      horaInicio: null,
      horaFim: null,
      motivo: 'FERIAS',
    });

    expect(bloqueio.create.mock.calls[0][0].data).toMatchObject({
      profissionalId: PROFISSIONAL_ID,
      dataInicio: new Date('2026-11-02T00:00:00.000Z'),
      dataFim: new Date('2026-11-06T00:00:00.000Z'),
    });
    expect(criado.id).toBe(BLOQUEIO_ID);
  });

  it('removerBloqueio: exclusão lógica; 404 se for de outro profissional ou inexistente', async () => {
    const { service, bloqueio } = setup();

    await service.removerBloqueio(PROFISSIONAL_ID, BLOQUEIO_ID);
    expect(bloqueio.findFirst).toHaveBeenCalledWith({
      where: { id: BLOQUEIO_ID, profissionalId: PROFISSIONAL_ID, deletedAt: null },
    });
    expect(bloqueio.update.mock.calls[0][0].data.deletedAt).toBeInstanceOf(Date);

    bloqueio.findFirst.mockResolvedValue(null);
    await expect(service.removerBloqueio(PROFISSIONAL_ID, BLOQUEIO_ID)).rejects.toMatchObject({
      status: 404,
    });
    await expect(service.removerBloqueio(PROFISSIONAL_ID, 'abc')).rejects.toMatchObject({
      status: 404,
    });
  });
});
