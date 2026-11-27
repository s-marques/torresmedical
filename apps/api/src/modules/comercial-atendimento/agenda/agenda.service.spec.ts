import type { CancelamentosService } from '../../../common/cancelamentos/cancelamentos.service';
import { escopoFalso } from '../../../../test/utils/escopo-falso';
import { txHostFalso } from '../../../../test/utils/tx-host-falso';
import type { TiposAgendamentoService } from '../../configuracoes-gestao/tipos-agendamento/tipos-agendamento.service';
import type { ProfissionaisService } from '../../gestao-profissionais/profissionais/profissionais.service';
import type { SalasService } from '../../gestao-profissionais/salas/salas.service';
import type { PacientesService } from '../pacientes/pacientes.service';
import type { AgendaConflitosService } from './agenda-conflitos.service';
import { AgendaService, instanteDeInicio, toAgendamentoDto } from './agenda.service';

const ID = '0b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const ID_PROF = '1b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const ID_TIPO = '2b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const ID_SALA = '4b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';

const REGISTRO = {
  id: ID,
  numero: 1224,
  pacienteId: ID,
  profissionalId: ID_PROF,
  salaId: ID_SALA,
  tipoAgendamentoId: null,
  inicio: new Date('2026-10-21T11:40:00Z'),
  duracaoMinutos: 30,
  valor: '820.00',
  convenio: false,
  observacoes: null,
  status: 'REAGENDAR',
  paciente: { nome: 'Paciente Fictício' },
  profissional: { nome: 'Profissional Fictício', corCalendario: 'verde' },
  tipoAgendamento: null,
  sala: { nome: 'Sala Fictícia' },
};

function criar(profissionaisDoEscopo?: string[], registro: Record<string, unknown> = REGISTRO) {
  const { txHost, delegate } = txHostFalso('agendamento', [registro]);
  const pacientes = { findById: jest.fn().mockResolvedValue({}) };
  const profissionais = {
    garantirExiste: jest.fn().mockResolvedValue(undefined),
    listarParaAgenda: jest.fn().mockResolvedValue([{ id: ID_PROF }]),
  };
  const tipos = { findById: jest.fn().mockResolvedValue({}) };
  const salas = {
    sugerirDoProfissional: jest.fn().mockResolvedValue({ id: ID_SALA, nome: 'Sala Fictícia' }),
  };
  const conflitos = { garantirLivre: jest.fn().mockResolvedValue(undefined) };
  const cancelamentos = {
    registrar: jest.fn().mockResolvedValue({ motivo: 'Motivo fictício' }),
    registrarContratoCancelado: jest.fn(),
    registrarNegocioPerdido: jest.fn(),
  };
  const service = new AgendaService(
    txHost,
    pacientes as unknown as PacientesService,
    profissionais as unknown as ProfissionaisService,
    tipos as unknown as TiposAgendamentoService,
    escopoFalso(profissionaisDoEscopo),
    salas as unknown as SalasService,
    conflitos as unknown as AgendaConflitosService,
    cancelamentos as unknown as CancelamentosService,
  );
  return { service, delegate, pacientes, profissionais, tipos, salas, conflitos, cancelamentos };
}

const ENTRADA = {
  pacienteId: ID,
  profissionalId: ID_PROF,
  salaId: ID_SALA,
  tipoAgendamentoId: null,
  data: '2026-10-22',
  hora: '16:00',
  duracaoMinutos: 30,
  valor: null,
  convenio: false,
  observacoes: null,
};

/** Status HTTP do erro da promessa (200 quando resolve). */
async function status(promessa: Promise<unknown>): Promise<number | undefined> {
  try {
    await promessa;
    return 200;
  } catch (erro) {
    return (erro as { getStatus?: () => number }).getStatus?.();
  }
}

describe('AgendaService', () => {
  it('instanteDeInicio: 16:00 no fuso da clínica (UTC-3) é 19:00 UTC', () => {
    expect(instanteDeInicio('2026-10-22', '16:00').toISOString()).toBe('2026-10-22T19:00:00.000Z');
    expect(instanteDeInicio('2026-10-22', '00:00').toISOString()).toBe('2026-10-22T03:00:00.000Z');
  });

  it('toAgendamentoDto: valor decimal vira número e início vira ISO', () => {
    expect(toAgendamentoDto(REGISTRO as never)).toMatchObject({
      numero: 1224,
      valor: 820,
      inicio: '2026-10-21T11:40:00.000Z',
      pacienteNome: 'Paciente Fictício',
      profissionalCor: 'verde',
      tipoNome: null,
      salaId: ID_SALA,
      salaNome: 'Sala Fictícia',
    });
  });

  it('toAgendamentoDto: agendamento antigo sem sala devolve sala nula', () => {
    expect(toAgendamentoDto({ ...REGISTRO, salaId: null, sala: null } as never)).toMatchObject({
      salaId: null,
      salaNome: null,
    });
  });

  it('list: período inclusivo, sem excluídos e filtro de profissional', async () => {
    const { service, delegate } = criar();

    const lista = await service.list({
      inicio: '2026-10-19',
      fim: '2026-10-25',
      profissionalId: ID_PROF,
    });

    expect(lista).toHaveLength(1);
    const { where } = delegate.findMany.mock.calls[0][0];
    expect(where).toMatchObject({ deletedAt: null, profissionalId: ID_PROF });
    expect(where.inicio.gte.toISOString()).toBe('2026-10-19T03:00:00.000Z');
    expect(where.inicio.lt.toISOString()).toBe('2026-10-26T03:00:00.000Z');
  });

  it('findById: 404 para id inválido sem consultar o banco', async () => {
    const { service, delegate } = criar();

    await expect(service.findById('abc')).rejects.toMatchObject({
      message: 'Agendamento não encontrado',
    });
    expect(delegate.findFirst).not.toHaveBeenCalled();
  });

  it('create: valida as entidades, confere a ocupação, grava como Agendado e devolve o detalhe', async () => {
    const { service, delegate, pacientes, profissionais, tipos, conflitos } = criar();

    await service.create({
      ...ENTRADA,
      tipoAgendamentoId: ID_TIPO,
      duracaoMinutos: 45,
      valor: 100,
      convenio: true,
    });

    expect(pacientes.findById).toHaveBeenCalledWith(ID);
    expect(profissionais.garantirExiste).toHaveBeenCalledWith(ID_PROF);
    expect(tipos.findById).toHaveBeenCalledWith(ID_TIPO);
    expect(conflitos.garantirLivre).toHaveBeenCalledWith(
      expect.objectContaining({
        salaId: ID_SALA,
        profissionalId: ID_PROF,
        data: '2026-10-22',
        hora: '16:00',
        duracaoMinutos: 45,
      }),
    );
    const { data } = delegate.create.mock.calls[0][0];
    expect(data).toMatchObject({ duracaoMinutos: 45, valor: 100, convenio: true, salaId: ID_SALA });
    expect(data).not.toHaveProperty('status');
    expect(data.inicio.toISOString()).toBe('2026-10-22T19:00:00.000Z');
  });

  it('create: sem tipo, não consulta Tipo de Agendamento', async () => {
    const { service, tipos } = criar();

    await service.create({ ...ENTRADA, hora: '09:00' });

    expect(tipos.findById).not.toHaveBeenCalled();
  });

  it('create: conflito de ocupação interrompe antes de gravar', async () => {
    const { service, delegate, conflitos } = criar();
    conflitos.garantirLivre.mockRejectedValue(new Error('conflito'));

    await expect(service.create(ENTRADA)).rejects.toThrow('conflito');
    expect(delegate.create).not.toHaveBeenCalled();
  });

  it('listarProfissionais delega ao módulo dono', async () => {
    const { service } = criar();
    await expect(service.listarProfissionais()).resolves.toEqual([{ id: ID_PROF }]);
  });

  describe('update (reagendamento)', () => {
    const ATUAL = { ...REGISTRO, status: 'AGENDADO' };

    it('mantém o que não veio e confere a ocupação ignorando o próprio agendamento', async () => {
      const { service, delegate, conflitos } = criar(undefined, ATUAL);

      await service.update(ID, { hora: '10:00' });

      // 2026-10-21T11:40Z = 08:40 em São Paulo; só a hora muda.
      expect(conflitos.garantirLivre).toHaveBeenCalledWith(
        expect.objectContaining({
          salaId: ID_SALA,
          profissionalId: ID_PROF,
          data: '2026-10-21',
          hora: '10:00',
          duracaoMinutos: 30,
          ignorarId: ID,
        }),
      );
      const { data, where } = delegate.update.mock.calls[0][0];
      expect(where).toEqual({ id: ID });
      expect(data.salaId).toBe(ID_SALA);
      expect(data.duracaoMinutos).toBe(30);
      expect(data.inicio.toISOString()).toBe('2026-10-21T13:00:00.000Z');
    });

    it('troca de sala e duração', async () => {
      const OUTRA = '5b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
      const { service, delegate, conflitos } = criar(undefined, ATUAL);

      await service.update(ID, { salaId: OUTRA, duracaoMinutos: 60 });

      expect(conflitos.garantirLivre).toHaveBeenCalledWith(
        expect.objectContaining({ salaId: OUTRA, duracaoMinutos: 60, hora: '08:40' }),
      );
      expect(delegate.update.mock.calls[0][0].data).toMatchObject({
        salaId: OUTRA,
        duracaoMinutos: 60,
      });
    });

    it('agendamento antigo sem sala exige a sala (400)', async () => {
      const { service, delegate, conflitos } = criar(undefined, { ...ATUAL, salaId: null });

      await expect(service.update(ID, { hora: '10:00' })).rejects.toMatchObject({
        status: 400,
        message: 'Sala é obrigatória.',
      });
      expect(conflitos.garantirLivre).not.toHaveBeenCalled();
      expect(delegate.update).not.toHaveBeenCalled();
    });

    it('cancelado não ocupa sala nem horário: grava sem conferir', async () => {
      const { service, delegate, conflitos } = criar(undefined, { ...ATUAL, status: 'CANCELADO' });

      await service.update(ID, { hora: '10:00' });

      expect(conflitos.garantirLivre).not.toHaveBeenCalled();
      expect(delegate.update).toHaveBeenCalled();
    });

    it('404 para id inválido ou inexistente, sem gravar', async () => {
      const { service, delegate } = criar(undefined, ATUAL);
      delegate.findFirst.mockResolvedValue(null);

      await expect(service.update('abc', { hora: '10:00' })).rejects.toMatchObject({ status: 404 });
      await expect(service.update(ID, { hora: '10:00' })).rejects.toMatchObject({ status: 404 });
      expect(delegate.update).not.toHaveBeenCalled();
    });
  });

  describe('cancelar (issue #162)', () => {
    const MOTIVO = '5b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
    const NOVO = '6b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
    const ATUAL = { ...REGISTRO, status: 'AGENDADO' };

    it('registra o motivo na consulta e muda o status para Cancelado', async () => {
      const { service, delegate, cancelamentos } = criar(undefined, ATUAL);

      await service.cancelar(ID, { motivoId: MOTIVO, observacao: 'Paciente viajou' });

      expect(cancelamentos.registrar).toHaveBeenCalledWith({
        tipo: 'CONSULTA',
        entidade: 'Agendamento',
        entidadeId: ID,
        motivoId: MOTIVO,
        observacao: 'Paciente viajou',
        profissionalId: ID_PROF,
        reagendouParaId: undefined,
      });
      expect(delegate.update).toHaveBeenCalledWith({
        where: { id: ID },
        data: { status: 'CANCELADO' },
      });
    });

    it('liga ao novo agendamento quando reagendou', async () => {
      const { service, delegate, cancelamentos } = criar(undefined, ATUAL);
      delegate.findFirst
        .mockResolvedValueOnce(ATUAL)
        .mockResolvedValueOnce({ ...ATUAL, id: NOVO })
        .mockResolvedValue(ATUAL);

      await service.cancelar(ID, {
        motivoId: MOTIVO,
        observacao: undefined,
        reagendouParaId: NOVO,
      });

      expect(cancelamentos.registrar).toHaveBeenCalledWith(
        expect.objectContaining({ reagendouParaId: NOVO }),
      );
    });

    it('o novo agendamento precisa existir e ser outro (400), sem gravar', async () => {
      const { service, delegate, cancelamentos } = criar(undefined, ATUAL);

      expect(
        await status(
          service.cancelar(ID, { motivoId: MOTIVO, observacao: undefined, reagendouParaId: ID }),
        ),
      ).toBe(400);
      expect(cancelamentos.registrar).not.toHaveBeenCalled();
      expect(delegate.update).not.toHaveBeenCalled();
    });

    it.each(['CANCELADO', 'ATENDIDO', 'FALTOU', 'CHECK_IN'])(
      'agendamento %s não pode ser cancelado (409)',
      async (situacao) => {
        const { service, delegate, cancelamentos } = criar(undefined, {
          ...ATUAL,
          status: situacao,
        });
        expect(
          await status(service.cancelar(ID, { motivoId: MOTIVO, observacao: undefined })),
        ).toBe(409);
        expect(cancelamentos.registrar).not.toHaveBeenCalled();
        expect(delegate.update).not.toHaveBeenCalled();
      },
    );

    it('404 para id inválido', async () => {
      const { service, cancelamentos } = criar(undefined, ATUAL);
      expect(await status(service.cancelar('x', { motivoId: MOTIVO, observacao: undefined }))).toBe(
        404,
      );
      expect(cancelamentos.registrar).not.toHaveBeenCalled();
    });

    it('agendamento de outro profissional dá 403 sem registrar', async () => {
      const { service, delegate, cancelamentos } = criar(
        ['9b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f'],
        ATUAL,
      );
      expect(await status(service.cancelar(ID, { motivoId: MOTIVO, observacao: undefined }))).toBe(
        403,
      );
      expect(cancelamentos.registrar).not.toHaveBeenCalled();
      expect(delegate.update).not.toHaveBeenCalled();
    });
  });

  describe('sugerirSala', () => {
    it('devolve a sala do contrato do profissional', async () => {
      const { service, salas } = criar();

      await expect(
        service.sugerirSala({ profissionalId: ID_PROF, data: '2026-10-22', hora: '14:00' }),
      ).resolves.toEqual({ salaId: ID_SALA, salaNome: 'Sala Fictícia' });
      expect(salas.sugerirDoProfissional).toHaveBeenCalledWith(ID_PROF, '2026-10-22', '14:00');
    });

    it('sem contrato que cubra o horário, devolve nulos', async () => {
      const { service, salas } = criar();
      salas.sugerirDoProfissional.mockResolvedValue(null);

      await expect(
        service.sugerirSala({ profissionalId: ID_PROF, data: '2026-10-22', hora: '14:00' }),
      ).resolves.toEqual({ salaId: null, salaNome: null });
    });
  });

  describe('escopo de dados (issue #153)', () => {
    const OUTRO = '3b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';

    it('list: restrito sem filtro lista só os vinculados', async () => {
      const { service, delegate } = criar([ID_PROF]);
      await service.list({ inicio: '2026-10-19', fim: '2026-10-25' });
      expect(delegate.findMany.mock.calls[0][0].where.profissionalId).toEqual({ in: [ID_PROF] });
    });

    it('list: filtro de outro profissional dá 403 sem consultar o banco', async () => {
      const { service, delegate } = criar([ID_PROF]);
      expect(
        await status(
          service.list({ inicio: '2026-10-19', fim: '2026-10-25', profissionalId: OUTRO }),
        ),
      ).toBe(403);
      expect(delegate.findMany).not.toHaveBeenCalled();
    });

    it('findById: agendamento de outro profissional dá 403', async () => {
      const { service } = criar([OUTRO]);
      expect(await status(service.findById(ID))).toBe(403);
    });

    it('create: restrito só agenda para os vinculados', async () => {
      const { service, delegate, conflitos } = criar([OUTRO]);
      expect(await status(service.create(ENTRADA))).toBe(403);
      expect(delegate.create).not.toHaveBeenCalled();
      expect(conflitos.garantirLivre).not.toHaveBeenCalled();
    });

    it('update: agendamento de outro profissional dá 403 sem gravar', async () => {
      const { service, delegate } = criar([OUTRO]);
      expect(await status(service.update(ID, { hora: '10:00' }))).toBe(403);
      expect(delegate.update).not.toHaveBeenCalled();
    });

    it('sugerirSala: profissional fora do escopo dá 403', async () => {
      const { service, salas } = criar([OUTRO]);
      expect(
        await status(
          service.sugerirSala({ profissionalId: ID_PROF, data: '2026-10-22', hora: '14:00' }),
        ),
      ).toBe(403);
      expect(salas.sugerirDoProfissional).not.toHaveBeenCalled();
    });

    it('listarProfissionais: só os do escopo', async () => {
      const { service } = criar([OUTRO]);
      await expect(service.listarProfissionais()).resolves.toEqual([]);
    });
  });
});
