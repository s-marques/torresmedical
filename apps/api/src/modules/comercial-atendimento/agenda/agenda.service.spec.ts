import { txHostFalso } from '../../../../test/utils/tx-host-falso';
import type { TiposAgendamentoService } from '../../configuracoes-gestao/tipos-agendamento/tipos-agendamento.service';
import type { ProfissionaisService } from '../../gestao-profissionais/profissionais/profissionais.service';
import type { PacientesService } from '../pacientes/pacientes.service';
import { AgendaService, instanteDeInicio, toAgendamentoDto } from './agenda.service';

const ID = '0b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const ID_PROF = '1b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const ID_TIPO = '2b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';

const REGISTRO = {
  id: ID,
  numero: 1224,
  pacienteId: ID,
  profissionalId: ID_PROF,
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
};

function criar() {
  const { txHost, delegate } = txHostFalso('agendamento', [REGISTRO]);
  const pacientes = { findById: jest.fn().mockResolvedValue({}) };
  const profissionais = {
    garantirExiste: jest.fn().mockResolvedValue(undefined),
    listarParaAgenda: jest.fn().mockResolvedValue([{ id: ID_PROF }]),
  };
  const tipos = { findById: jest.fn().mockResolvedValue({}) };
  const service = new AgendaService(
    txHost,
    pacientes as unknown as PacientesService,
    profissionais as unknown as ProfissionaisService,
    tipos as unknown as TiposAgendamentoService,
  );
  return { service, delegate, pacientes, profissionais, tipos };
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

  it('create: valida as entidades, grava como Agendado e devolve o detalhe', async () => {
    const { service, delegate, pacientes, profissionais, tipos } = criar();

    await service.create({
      pacienteId: ID,
      profissionalId: ID_PROF,
      tipoAgendamentoId: ID_TIPO,
      data: '2026-10-22',
      hora: '16:00',
      duracaoMinutos: 45,
      valor: 100,
      convenio: true,
      observacoes: null,
    });

    expect(pacientes.findById).toHaveBeenCalledWith(ID);
    expect(profissionais.garantirExiste).toHaveBeenCalledWith(ID_PROF);
    expect(tipos.findById).toHaveBeenCalledWith(ID_TIPO);
    const { data } = delegate.create.mock.calls[0][0];
    expect(data).toMatchObject({ duracaoMinutos: 45, valor: 100, convenio: true });
    expect(data).not.toHaveProperty('status');
    expect(data.inicio.toISOString()).toBe('2026-10-22T19:00:00.000Z');
  });

  it('create: sem tipo, não consulta Tipo de Agendamento', async () => {
    const { service, tipos } = criar();

    await service.create({
      pacienteId: ID,
      profissionalId: ID_PROF,
      tipoAgendamentoId: null,
      data: '2026-10-22',
      hora: '09:00',
      duracaoMinutos: 30,
      valor: null,
      convenio: false,
      observacoes: null,
    });

    expect(tipos.findById).not.toHaveBeenCalled();
  });

  it('listarProfissionais delega ao módulo dono', async () => {
    const { service } = criar();
    await expect(service.listarProfissionais()).resolves.toEqual([{ id: ID_PROF }]);
  });
});
