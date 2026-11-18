import { escopoFalso } from '../../../../test/utils/escopo-falso';
import type { TransactionHost } from '@nestjs-cls/transactional';
import type { AtendimentoMedicoItem, Paciente } from '@torres/shared';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import type { AgendamentosAtendimentoService } from '../../comercial-atendimento/agenda/agendamentos-atendimento.service';
import type { PacientesService } from '../../comercial-atendimento/pacientes/pacientes.service';
import type { AuditService } from '../../../common/audit/audit.service';
import type { EventPublisher } from '../../../common/messaging/event-publisher';
import type { ProfissionaisService } from '../../gestao-profissionais/profissionais/profissionais.service';
import type { ProtocolosService } from '../../gestao-profissionais/protocolos/protocolos.service';
import {
  AtendimentoMedicoService,
  enderecoEmLinha,
  toAtendimentoEmCurso,
  toPacienteDados,
} from './atendimento-medico.service';

const ID_AG = '0b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const ID_PAC = '1b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const ID_PROF = '2b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const ID_AT = '3b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const ID_EV = '4b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const AGORA = new Date('2026-11-17T12:00:00.000Z');

const ITEM: AtendimentoMedicoItem = {
  id: ID_AG,
  inicio: '2026-11-17T11:30:00.000Z',
  pacienteId: ID_PAC,
  pacienteNome: 'Paciente Fictício',
  profissionalId: ID_PROF,
  profissionalNome: 'Profissional Fictício',
  procedimento: null,
  status: 'CONFIRMADO',
  pago: false,
};

const ATENDIMENTO = {
  id: ID_AT,
  pacienteId: ID_PAC,
  profissionalId: ID_PROF,
  agendamentoId: ID_AG,
  status: 'EM_ANDAMENTO' as const,
  iniciadoEm: AGORA,
  finalizadoEm: null as Date | null,
  createdAt: AGORA,
};

const EVOLUCAO = {
  id: ID_EV,
  atendimentoId: ID_AT,
  tipo: 'EVOLUCAO' as const,
  texto: 'Paciente estável',
  createdAt: AGORA,
  atendimento: { profissionalId: ID_PROF },
};

const RECEITA = {
  id: ID_EV,
  atendimentoId: ID_AT,
  tipo: 'PRESCRICAO' as const,
  controlada: true,
  validadeDias: 60,
  texto: '1) Medicamento',
  observacoes: null as string | null,
  createdAt: AGORA,
  atendimento: { profissionalId: ID_PROF },
};

function setup({
  item = ITEM,
  atendimento = null as typeof ATENDIMENTO | null,
  escopo,
}: {
  item?: AtendimentoMedicoItem;
  atendimento?: typeof ATENDIMENTO | null;
  escopo?: string[];
} = {}) {
  const tx = {
    atendimento: {
      findFirst: jest.fn().mockResolvedValue(atendimento),
      create: jest
        .fn()
        .mockImplementation(({ data }: { data: object }) =>
          Promise.resolve({ ...ATENDIMENTO, ...data, id: ID_AT, createdAt: AGORA }),
        ),
      update: jest
        .fn()
        .mockImplementation(({ data }: { data: object }) =>
          Promise.resolve({ ...ATENDIMENTO, ...data }),
        ),
      findMany: jest
        .fn()
        .mockResolvedValue([
          { ...ATENDIMENTO, evolucoes: [{ ...EVOLUCAO }], _count: { receitas: 2 } },
        ]),
      count: jest.fn().mockResolvedValue(1),
    },
    atendimentoReceita: {
      findMany: jest.fn().mockResolvedValue([RECEITA]),
      count: jest.fn().mockResolvedValue(1),
      create: jest
        .fn()
        .mockImplementation(({ data }: { data: object }) =>
          Promise.resolve({ ...RECEITA, ...data, createdAt: AGORA }),
        ),
    },
    atendimentoEvolucao: {
      findMany: jest.fn().mockResolvedValue([EVOLUCAO]),
      count: jest.fn().mockResolvedValue(1),
      create: jest
        .fn()
        .mockImplementation(({ data }: { data: object }) =>
          Promise.resolve({ ...EVOLUCAO, ...data, createdAt: AGORA }),
        ),
    },
  };
  const txHost = {
    tx,
    withTransaction: (fn: () => Promise<unknown>) => fn(),
  } as unknown as TransactionHost<PrismaAdapter>;
  const agendamentos = {
    listarDoDia: jest.fn().mockResolvedValue({ data: [item], meta: {} }),
    resumo: jest.fn().mockResolvedValue(item),
    alterarStatus: jest.fn().mockResolvedValue({ ...item, status: 'EM_ATENDIMENTO' }),
    pagamento: jest.fn().mockResolvedValue({ pago: false }),
    registrarRecebimento: jest.fn().mockResolvedValue({ id: 'r1' }),
  };
  const protocolos = {
    list: jest.fn().mockResolvedValue({
      data: [
        { id: ID_EV, nome: 'Limpeza de pele', categoria: 'Estética', observacoes: 'Aplicar 2x' },
      ],
      meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
    }),
    categorias: jest.fn().mockResolvedValue({ data: ['Estética'] }),
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const events = { publish: jest.fn().mockResolvedValue(undefined) };
  const pacientes = { detalhe: jest.fn() };
  const profissionais = {
    detalhe: jest.fn().mockResolvedValue({ id: ID_PROF, nome: 'Profissional Fictício' }),
  };
  const service = new AtendimentoMedicoService(
    txHost,
    agendamentos as unknown as AgendamentosAtendimentoService,
    pacientes as unknown as PacientesService,
    profissionais as unknown as ProfissionaisService,
    protocolos as unknown as ProtocolosService,
    audit as unknown as AuditService,
    escopoFalso(escopo),
    events as unknown as EventPublisher,
  );
  return { service, tx, agendamentos, pacientes, profissionais, protocolos, audit, events };
}

describe('AtendimentoMedicoService', () => {
  it('listar repassa a consulta ao service de agendamentos', async () => {
    const { service, agendamentos } = setup();
    const query = {
      page: 1,
      pageSize: 100,
      sort: { field: 'inicio' as const, direction: 'asc' as const },
      search: undefined,
      data: '2026-11-17',
    };
    await service.listar(query);
    expect(agendamentos.listarDoDia).toHaveBeenCalledWith(query);
  });

  describe('detalhe', () => {
    it('sem atendimento iniciado', async () => {
      const { service } = setup();
      await expect(service.detalhe(ID_AG)).resolves.toEqual({
        agendamento: ITEM,
        atendimento: null,
      });
    });

    it('com atendimento em andamento', async () => {
      const { service } = setup({ atendimento: ATENDIMENTO });
      const detalhe = await service.detalhe(ID_AG);
      expect(detalhe.atendimento).toEqual({
        id: ID_AT,
        agendamentoId: ID_AG,
        status: 'EM_ANDAMENTO',
        iniciadoEm: AGORA.toISOString(),
        finalizadoEm: null,
      });
    });
  });

  describe('iniciar', () => {
    it('cria o atendimento com a entrada e muda o agendamento para Em Atendimento', async () => {
      const { service, tx, agendamentos } = setup();
      const criado = await service.iniciar(ID_AG);

      expect(criado).toMatchObject({ id: ID_AT, agendamentoId: ID_AG, status: 'EM_ANDAMENTO' });
      const { data } = tx.atendimento.create.mock.calls[0][0];
      expect(data).toMatchObject({
        pacienteId: ID_PAC,
        profissionalId: ID_PROF,
        agendamentoId: ID_AG,
        horario: new Date(ITEM.inicio),
        status: 'EM_ANDAMENTO',
      });
      expect(data.iniciadoEm).toBeInstanceOf(Date);
      expect(agendamentos.alterarStatus).toHaveBeenCalledWith(ID_AG, 'EM_ATENDIMENTO');
    });

    it.each([
      [{ item: { ...ITEM, status: 'CANCELADO' as const } }, 'AGENDAMENTO_CANCELADO'],
      [{ atendimento: ATENDIMENTO }, 'ATENDIMENTO_JA_INICIADO'],
      [{ item: { ...ITEM, status: 'ATENDIDO' as const } }, 'AGENDAMENTO_JA_ATENDIDO'],
    ])('422 quando não pode iniciar (%#)', async (cenario, codigo) => {
      const { service, tx, agendamentos } = setup(cenario);
      await expect(service.iniciar(ID_AG)).rejects.toMatchObject({ status: 422, code: codigo });
      expect(tx.atendimento.create).not.toHaveBeenCalled();
      expect(agendamentos.alterarStatus).not.toHaveBeenCalled();
    });
  });

  describe('evoluções', () => {
    it('lista as evoluções do paciente com o nome do profissional', async () => {
      const { service, tx } = setup();
      const pagina = await service.listarEvolucoes(ID_AG, { page: 1, pageSize: 50 });

      expect(pagina.data).toEqual([
        {
          id: ID_EV,
          atendimentoId: ID_AT,
          tipo: 'EVOLUCAO',
          texto: 'Paciente estável',
          profissionalNome: 'Profissional Fictício',
          createdAt: AGORA.toISOString(),
        },
      ]);
      expect(tx.atendimentoEvolucao.findMany.mock.calls[0][0].where).toEqual({
        deletedAt: null,
        atendimento: { pacienteId: ID_PAC, deletedAt: null },
      });
    });

    it('lista sem nome quando o profissional não existe mais', async () => {
      const { service, profissionais } = setup();
      profissionais.detalhe.mockRejectedValueOnce(new Error('404'));
      const pagina = await service.listarEvolucoes(ID_AG, { page: 1, pageSize: 50 });
      expect(pagina.data[0]?.profissionalNome).toBeNull();
    });

    it('salva no atendimento em andamento', async () => {
      const { service, tx } = setup({ atendimento: ATENDIMENTO });
      const criada = await service.criarEvolucao(ID_AG, { tipo: 'DIAGNOSTICO', texto: 'Texto' });

      expect(tx.atendimentoEvolucao.create).toHaveBeenCalledWith({
        data: { atendimentoId: ID_AT, tipo: 'DIAGNOSTICO', texto: 'Texto' },
      });
      expect(criada).toMatchObject({
        tipo: 'DIAGNOSTICO',
        profissionalNome: 'Profissional Fictício',
      });
    });

    it.each([
      [null, 'ATENDIMENTO_NAO_INICIADO'],
      [{ ...ATENDIMENTO, status: 'FINALIZADO' as never }, 'ATENDIMENTO_FINALIZADO'],
    ])('422 sem atendimento em andamento (%#)', async (atendimento, codigo) => {
      const { service, tx } = setup({ atendimento });
      await expect(
        service.criarEvolucao(ID_AG, { tipo: 'EVOLUCAO', texto: 'Texto' }),
      ).rejects.toMatchObject({ status: 422, code: codigo });
      expect(tx.atendimentoEvolucao.create).not.toHaveBeenCalled();
    });
  });

  it('dadosPaciente busca o paciente do agendamento', async () => {
    const { service, pacientes } = setup();
    pacientes.detalhe.mockResolvedValue({
      id: ID_PAC,
      nome: 'Paciente Fictício',
      documento: '00000000000',
      rg: null,
      dataNascimento: '1980-01-01',
      sexo: 'M',
      telefone: '1130000000',
      celular: null,
      email: 'paciente@example.com',
      logradouro: 'Rua A',
      numero: '10',
      complemento: null,
      bairro: 'Centro',
      cidade: 'Cidade',
      uf: 'MT',
      observacoes: 'Obs',
    });
    const dados = await service.dadosPaciente(ID_AG);
    expect(pacientes.detalhe).toHaveBeenCalledWith(ID_PAC);
    expect(dados).toMatchObject({ telefone: '1130000000', endereco: 'Rua A, 10, Centro' });
  });
});

describe('funções de mapeamento', () => {
  it('enderecoEmLinha: null sem nenhuma parte', () => {
    expect(
      enderecoEmLinha({ logradouro: null, numero: null, complemento: null, bairro: null }),
    ).toBeNull();
  });

  it('toPacienteDados: celular tem prioridade sobre telefone', () => {
    const dados = toPacienteDados({
      id: ID_PAC,
      nome: 'P',
      celular: '11900000000',
      telefone: '1130000000',
    } as Paciente);
    expect(dados.telefone).toBe('11900000000');
  });

  it('toAtendimentoEmCurso: usa createdAt sem iniciadoEm e mapeia finalizadoEm', () => {
    const fim = new Date('2026-11-17T13:00:00.000Z');
    expect(
      toAtendimentoEmCurso({
        ...ATENDIMENTO,
        agendamentoId: null,
        iniciadoEm: null,
        finalizadoEm: fim,
      } as never),
    ).toMatchObject({
      agendamentoId: '',
      iniciadoEm: AGORA.toISOString(),
      finalizadoEm: fim.toISOString(),
    });
  });
  describe('receitas', () => {
    it('lista as receitas do paciente com o nome do profissional', async () => {
      const { service, tx } = setup();
      const pagina = await service.listarReceitas(ID_AG, { page: 1, pageSize: 20 } as never);
      expect(pagina.data[0]).toMatchObject({
        controlada: true,
        profissionalNome: 'Profissional Fictício',
      });
      expect(tx.atendimentoReceita.findMany.mock.calls[0][0].where).toMatchObject({
        atendimento: { pacienteId: ID_PAC },
      });
    });

    it('salva só com o atendimento em andamento', async () => {
      const entrada = {
        tipo: 'PRESCRICAO' as const,
        controlada: false,
        validadeDias: 30,
        texto: 'x',
        observacoes: null,
      };
      await expect(setup().service.criarReceita(ID_AG, entrada)).rejects.toMatchObject({
        code: 'ATENDIMENTO_NAO_INICIADO',
      });
      const finalizado = setup({ atendimento: { ...ATENDIMENTO, status: 'FINALIZADO' as never } });
      await expect(finalizado.service.criarReceita(ID_AG, entrada)).rejects.toMatchObject({
        code: 'ATENDIMENTO_FINALIZADO',
      });
      const { service, tx } = setup({ atendimento: ATENDIMENTO });
      await expect(service.criarReceita(ID_AG, entrada)).resolves.toMatchObject({ texto: 'x' });
      expect(tx.atendimentoReceita.create).toHaveBeenCalledWith({
        data: { atendimentoId: ID_AT, ...entrada },
      });
    });

    it('protocolos vêm do cadastro, com as observações como texto', async () => {
      const { service, protocolos } = setup();
      const pagina = await service.listarProtocolos({
        page: 1,
        pageSize: 20,
        sort: { field: 'nome', direction: 'asc' },
        search: 'limp',
        categoria: 'Estética',
      } as never);
      expect(pagina.data).toEqual([
        { id: ID_EV, nome: 'Limpeza de pele', categoria: 'Estética', texto: 'Aplicar 2x' },
      ]);
      expect(protocolos.list.mock.calls[0][0]).toMatchObject({
        search: 'limp',
        categoria: 'Estética',
      });
      await expect(service.categoriasProtocolos()).resolves.toEqual({ data: ['Estética'] });
    });
  });

  it('pagamento e recebimento delegam ao service de agendamentos', async () => {
    const { service, agendamentos } = setup();
    await service.pagamento(ID_AG);
    const entrada = { valor: 10, formaPagamentoId: ID_PROF };
    await service.registrarRecebimento(ID_AG, entrada);
    expect(agendamentos.pagamento).toHaveBeenCalledWith(ID_AG);
    expect(agendamentos.registrarRecebimento).toHaveBeenCalledWith(ID_AG, entrada);
  });

  it('histórico: atendimentos do paciente com evoluções e total de receitas', async () => {
    const { service } = setup();
    const pagina = await service.historico(ID_AG, { page: 1, pageSize: 20 } as never);
    expect(pagina.data[0]).toMatchObject({
      id: ID_AT,
      profissionalNome: 'Profissional Fictício',
      totalReceitas: 2,
      evolucoes: [{ id: ID_EV, tipo: 'EVOLUCAO', texto: 'Paciente estável' }],
    });
  });

  describe('finalizar', () => {
    it('grava o fim, audita o atendimento e muda o agendamento para Atendido', async () => {
      const { service, tx, audit, agendamentos, events } = setup({ atendimento: ATENDIMENTO });
      const r = await service.finalizar(ID_AG);
      expect(r.status).toBe('FINALIZADO');
      expect(r.finalizadoEm).not.toBeNull();
      expect(tx.atendimento.update).toHaveBeenCalledWith({
        where: { id: ID_AT },
        data: { status: 'FINALIZADO', finalizadoEm: expect.any(Date) },
      });
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'UPDATE', entity: 'Atendimento', entityId: ID_AT }),
      );
      expect(agendamentos.alterarStatus).toHaveBeenCalledWith(ID_AG, 'ATENDIDO');
      // Só ids: a Pesquisa NPS reage a este fato.
      expect(events.publish).toHaveBeenCalledWith('consultorio.atendimento.finalizado', {
        atendimentoId: ID_AT,
        pacienteId: ATENDIMENTO.pacienteId,
        profissionalId: ATENDIMENTO.profissionalId,
      });
    });

    it('recusa atendimento não iniciado', async () => {
      await expect(setup().service.finalizar(ID_AG)).rejects.toMatchObject({
        code: 'ATENDIMENTO_NAO_INICIADO',
      });
    });
  });

  describe('escopo de dados (issue #153)', () => {
    it('restrito: evoluções, receitas e histórico só dos profissionais vinculados', async () => {
      const { service, tx } = setup({ escopo: [ID_PROF] });
      await service.listarEvolucoes(ID_AG, { page: 1, pageSize: 50 });
      await service.listarReceitas(ID_AG, { page: 1, pageSize: 20 } as never);
      await service.historico(ID_AG, { page: 1, pageSize: 20 } as never);

      const filtro = { pacienteId: ID_PAC, deletedAt: null, profissionalId: { in: [ID_PROF] } };
      expect(tx.atendimentoEvolucao.findMany.mock.calls[0][0].where.atendimento).toEqual(filtro);
      expect(tx.atendimentoReceita.findMany.mock.calls[0][0].where.atendimento).toEqual(filtro);
      expect(tx.atendimento.findMany.mock.calls[0][0].where).toEqual(filtro);
    });
  });
});
