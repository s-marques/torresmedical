import type { AtendimentoEmCurso, Evolucao, EvolucaoVozAgendamento } from '@torres/shared';
import type { AuditService } from '../../../common/audit/audit.service';
import type { AgendamentosAtendimentoService } from '../../comercial-atendimento/agenda/agendamentos-atendimento.service';
import type { AtendimentoMedicoService } from '../atendimento-medico/atendimento-medico.service';
import { EvolucaoVozService } from './evolucao-voz.service';

const ID_AG = '0b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const ID_AT = '3b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';

const AGENDAMENTO: EvolucaoVozAgendamento = {
  id: ID_AG,
  numero: 1422,
  inicio: '2026-11-19T11:30:00.000Z',
  pacienteId: '1b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f',
  pacienteNome: 'Paciente Fictício',
  profissionalId: '2b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f',
  profissionalNome: 'Profissional Fictício',
  procedimento: 'Consulta',
  status: 'CONFIRMADO',
  pago: false,
};

const EM_CURSO: AtendimentoEmCurso = {
  id: ID_AT,
  agendamentoId: ID_AG,
  status: 'EM_ANDAMENTO',
  iniciadoEm: '2026-11-19T12:00:00.000Z',
  finalizadoEm: null,
};

const EVOLUCAO: Evolucao = {
  id: '4b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f',
  atendimentoId: ID_AT,
  tipo: 'EVOLUCAO',
  texto: 'Paciente relata melhora',
  profissionalNome: 'Profissional Fictício',
  createdAt: '2026-11-19T12:05:00.000Z',
};

function criar(atendimento: AtendimentoEmCurso | null) {
  const agendamentos = {
    listarParaEvolucaoVoz: jest.fn().mockResolvedValue({ data: [AGENDAMENTO], meta: {} }),
    resumoComNumero: jest.fn().mockResolvedValue(AGENDAMENTO),
  };
  const atendimentoMedico = {
    detalhe: jest.fn().mockResolvedValue({ agendamento: AGENDAMENTO, atendimento }),
    iniciar: jest.fn().mockResolvedValue(EM_CURSO),
    criarEvolucao: jest.fn().mockResolvedValue(EVOLUCAO),
    listarEvolucoes: jest.fn().mockResolvedValue({ data: [EVOLUCAO], meta: {} }),
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const service = new EvolucaoVozService(
    agendamentos as unknown as AgendamentosAtendimentoService,
    atendimentoMedico as unknown as AtendimentoMedicoService,
    audit as unknown as AuditService,
  );
  return { service, agendamentos, atendimentoMedico, audit };
}

describe('EvolucaoVozService', () => {
  it('lista, detalha e traz o histórico pelos services donos', async () => {
    const { service, agendamentos, atendimentoMedico } = criar(null);
    const query = {
      page: 1,
      pageSize: 100,
      sort: { field: 'inicio', direction: 'asc' },
      search: undefined,
    } as const;

    await service.listar({ ...query, data: '2026-11-19' });
    expect(agendamentos.listarParaEvolucaoVoz).toHaveBeenCalledWith({
      ...query,
      data: '2026-11-19',
    });
    await expect(service.detalhe(ID_AG)).resolves.toEqual(AGENDAMENTO);
    await service.listarEvolucoes(ID_AG, { page: 1, pageSize: 100 });
    expect(atendimentoMedico.listarEvolucoes).toHaveBeenCalledWith(ID_AG, {
      page: 1,
      pageSize: 100,
    });
  });

  it('salva no atendimento em andamento sem iniciar outro', async () => {
    const { service, atendimentoMedico, audit } = criar(EM_CURSO);

    await expect(service.salvar(ID_AG, { texto: 'Paciente relata melhora' })).resolves.toEqual(
      EVOLUCAO,
    );
    expect(atendimentoMedico.iniciar).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
    expect(atendimentoMedico.criarEvolucao).toHaveBeenCalledWith(ID_AG, {
      tipo: 'EVOLUCAO',
      texto: 'Paciente relata melhora',
    });
  });

  it('sem atendimento, inicia e audita o atendimento antes de salvar', async () => {
    const { service, atendimentoMedico, audit } = criar(null);

    await service.salvar(ID_AG, { texto: 'Paciente relata melhora' });

    expect(atendimentoMedico.iniciar).toHaveBeenCalledWith(ID_AG);
    expect(audit.record).toHaveBeenCalledWith({
      action: 'CREATE',
      entity: 'Atendimento',
      entityId: ID_AT,
      before: null,
      after: EM_CURSO,
    });
    expect(atendimentoMedico.iniciar.mock.invocationCallOrder[0]).toBeLessThan(
      atendimentoMedico.criarEvolucao.mock.invocationCallOrder[0] ?? 0,
    );
  });
});
