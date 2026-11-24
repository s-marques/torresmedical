import type { TransactionHost } from '@nestjs-cls/transactional';
import { escopoFalso } from '../../../../test/utils/escopo-falso';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import { RecepcaoService, toRecepcaoItem } from './recepcao.service';

const ID = '0b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const ID_PROF = '1b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const ID_OUTRO = '2b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const INICIO = new Date('2026-11-24T12:00:00.000Z');

const AGENDAMENTO = {
  id: ID,
  numero: 7,
  pacienteId: ID,
  profissionalId: ID_PROF,
  salaId: ID,
  inicio: INICIO,
  status: 'CONFIRMADO' as const,
  chegadaEm: null as Date | null,
  entradaEm: null as Date | null,
  finalizadoEm: null as Date | null,
  valor: 250,
  observacoes: 'dado que a recepção não deve ver',
  paciente: { nome: 'Paciente Fictício' },
  profissional: { nome: 'Profissional Fictício' },
  sala: { nome: 'Sala 1' } as { nome: string } | null,
};

const QUERY = {
  page: 1,
  pageSize: 100,
  sort: { field: 'inicio' as const, direction: 'asc' as const },
  search: undefined,
};

function setup(registro = AGENDAMENTO, escopo?: string[]) {
  const agendamento = {
    findMany: jest.fn().mockResolvedValue([registro]),
    count: jest.fn().mockResolvedValue(1),
    findFirst: jest.fn().mockResolvedValue(registro),
    update: jest
      .fn()
      .mockImplementation(({ data }: { data: object }) =>
        Promise.resolve({ ...registro, ...data }),
      ),
  };
  const txHost = { tx: { agendamento } } as unknown as TransactionHost<PrismaAdapter>;
  return { service: new RecepcaoService(txHost, escopoFalso(escopo)), agendamento };
}

describe('RecepcaoService', () => {
  it('toRecepcaoItem: só horário, paciente, profissional, sala, status e horários', () => {
    const item = toRecepcaoItem(AGENDAMENTO as never);
    expect(item).toEqual({
      id: ID,
      inicio: INICIO.toISOString(),
      pacienteNome: 'Paciente Fictício',
      profissionalId: ID_PROF,
      profissionalNome: 'Profissional Fictício',
      salaNome: 'Sala 1',
      status: 'CONFIRMADO',
      chegadaEm: null,
      entradaEm: null,
      finalizadoEm: null,
    });
    expect(JSON.stringify(item)).not.toContain('observacoes');
    expect(toRecepcaoItem({ ...AGENDAMENTO, sala: null } as never).salaNome).toBeNull();
  });

  describe('listar', () => {
    it('lista o dia sem excluídos, por horário, aplicando os filtros', async () => {
      const { service, agendamento } = setup();

      const pagina = await service.listar({ ...QUERY, profissionalId: ID_PROF, salaId: ID });

      expect(pagina.data).toHaveLength(1);
      expect(agendamento.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            deletedAt: null,
            profissionalId: ID_PROF,
            salaId: ID,
          }),
        }),
      );
    });

    it('perfil restrito vê só os profissionais vinculados', async () => {
      const { service, agendamento } = setup(AGENDAMENTO, [ID_PROF]);

      await service.listar(QUERY);

      expect(agendamento.findMany.mock.calls[0][0].where.profissionalId).toEqual({
        in: [ID_PROF],
      });
    });

    it('perfil restrito não filtra por profissional de fora do escopo (403)', async () => {
      const { service } = setup(AGENDAMENTO, [ID_PROF]);

      await expect(service.listar({ ...QUERY, profissionalId: ID_OUTRO })).rejects.toMatchObject({
        status: 403,
      });
    });
  });

  it('fila: só quem já chegou, do que chegou há mais tempo', async () => {
    const { service, agendamento } = setup();

    await service.fila();

    const args = agendamento.findMany.mock.calls[0][0];
    expect(args.where.status).toEqual({ in: ['CHECK_IN', 'AGUARDANDO'] });
    expect(args.orderBy[0]).toEqual({ chegadaEm: 'asc' });
  });

  describe('alterarStatus', () => {
    it('Chegou grava o horário de chegada', async () => {
      const { service, agendamento } = setup();

      const item = await service.alterarStatus(ID, { status: 'CHECK_IN' });

      const data = agendamento.update.mock.calls[0][0].data;
      expect(data.status).toBe('CHECK_IN');
      expect(data.chegadaEm).toBeInstanceOf(Date);
      expect(item.status).toBe('CHECK_IN');
      expect(item.chegadaEm).not.toBeNull();
    });

    it('Aguardando depois de Chegou mantém a chegada original', async () => {
      const chegada = new Date('2026-11-24T11:50:00.000Z');
      const { service, agendamento } = setup({
        ...AGENDAMENTO,
        status: 'CHECK_IN' as never,
        chegadaEm: chegada,
      });

      await service.alterarStatus(ID, { status: 'AGUARDANDO' });

      expect(agendamento.update.mock.calls[0][0].data).toEqual({ status: 'AGUARDANDO' });
    });

    it('Faltou apaga a chegada', async () => {
      const { service, agendamento } = setup({
        ...AGENDAMENTO,
        status: 'CHECK_IN' as never,
        chegadaEm: INICIO,
      });

      await service.alterarStatus(ID, { status: 'FALTOU' });

      expect(agendamento.update.mock.calls[0][0].data).toEqual({
        status: 'FALTOU',
        chegadaEm: null,
      });
    });

    it('mesmo status: não grava de novo', async () => {
      const { service, agendamento } = setup();

      await service.alterarStatus(ID, { status: 'CONFIRMADO' });

      expect(agendamento.update).not.toHaveBeenCalled();
    });

    it.each(['EM_ATENDIMENTO', 'ATENDIDO'] as const)(
      'atendimento %s é do médico: 422 RECEPCAO_STATUS_TRAVADO',
      async (status) => {
        const { service, agendamento } = setup({ ...AGENDAMENTO, status: status as never });

        await expect(service.alterarStatus(ID, { status: 'CHECK_IN' })).rejects.toMatchObject({
          status: 422,
          code: 'RECEPCAO_STATUS_TRAVADO',
        });
        expect(agendamento.update).not.toHaveBeenCalled();
      },
    );

    it('404 quando o agendamento não existe ou o id é inválido', async () => {
      const { service, agendamento } = setup();
      agendamento.findFirst.mockResolvedValue(null);

      await expect(service.alterarStatus(ID, { status: 'CHECK_IN' })).rejects.toMatchObject({
        status: 404,
      });
      await expect(service.alterarStatus('x', { status: 'CHECK_IN' })).rejects.toMatchObject({
        status: 404,
      });
    });

    it('403 para agendamento de profissional fora do escopo', async () => {
      const { service, agendamento } = setup(AGENDAMENTO, [ID_OUTRO]);

      await expect(service.alterarStatus(ID, { status: 'CHECK_IN' })).rejects.toMatchObject({
        status: 403,
      });
      expect(agendamento.update).not.toHaveBeenCalled();
    });
  });
});
