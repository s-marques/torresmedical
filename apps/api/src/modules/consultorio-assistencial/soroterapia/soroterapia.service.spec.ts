import type { TransactionHost } from '@nestjs-cls/transactional';
import {
  SOROTERAPIA_EXPORT_COLUMNS,
  type ListSoroterapiaEmAndamentoQuery,
  type ListSoroterapiaHistoricoQuery,
} from '@torres/shared';
import { escopoFalso } from '../../../../test/utils/escopo-falso';
import type { ExportService } from '../../../common/export/export.service';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import type { AgendamentosAtendimentoService } from '../../comercial-atendimento/agenda/agendamentos-atendimento.service';
import type { OrcamentosService } from '../../comercial-atendimento/orcamentos/orcamentos.service';
import type { PacientesService } from '../../comercial-atendimento/pacientes/pacientes.service';
import type { ProfissionaisService } from '../../gestao-profissionais/profissionais/profissionais.service';
import type { PacientesVinculadosService } from '../pacientes-vinculados/pacientes-vinculados.service';
import {
  duracaoEmMinutos,
  SOROTERAPIA_EXPORT_DEFINITIONS,
  SoroterapiaService,
  toSoroterapiaChecklist,
} from './soroterapia.service';

const PACIENTE = '1d9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const MEDICO = '2d9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const INICIO = new Date('2026-11-10T13:00:00.000Z');

function checklist(extra: Record<string, unknown> = {}) {
  return {
    id: 'c1',
    agendamentoId: null,
    pacienteId: PACIENTE,
    profissionalId: MEDICO,
    protocoloNome: 'Protocolo Alfa',
    sinaisVitaisInicio: null,
    status: 'EM_ANDAMENTO',
    iniciadoEm: INICIO,
    finalizadoEm: null,
    createdAt: INICIO,
    updatedAt: INICIO,
    deletedAt: null,
    ...extra,
  };
}

function setup(escopo = escopoFalso()) {
  const tx = {
    soroterapiaChecklist: {
      findMany: jest.fn().mockResolvedValue([checklist()]),
      count: jest.fn().mockResolvedValue(1),
    },
  };
  const exportService = {
    ensureWithinLimit: jest.fn(),
    export: jest.fn().mockResolvedValue({ filename: 'x.xlsx' }),
  };
  const pacientes = {
    nomesPorIds: jest.fn().mockResolvedValue(new Map([[PACIENTE, 'Paciente Teste']])),
    idsPorBusca: jest.fn().mockResolvedValue([]),
  };
  const profissionais = {
    nomesPorIds: jest.fn().mockResolvedValue(new Map([[MEDICO, 'Dr. Teste']])),
  };
  const agendamentos = { listarFilaSoroterapia: jest.fn().mockResolvedValue([]) };
  const orcamentos = { listarPacotesProtocolo: jest.fn().mockResolvedValue([]) };
  const vinculados = { idsNoEscopo: jest.fn().mockResolvedValue(null) };
  const service = new SoroterapiaService(
    { tx } as unknown as TransactionHost<PrismaAdapter>,
    exportService as unknown as ExportService,
    pacientes as unknown as PacientesService,
    profissionais as unknown as ProfissionaisService,
    agendamentos as unknown as AgendamentosAtendimentoService,
    orcamentos as unknown as OrcamentosService,
    vinculados as unknown as PacientesVinculadosService,
    escopo,
  );
  return { service, tx, exportService, pacientes, agendamentos, orcamentos, vinculados };
}

const EM_ANDAMENTO: ListSoroterapiaEmAndamentoQuery = {
  page: 1,
  pageSize: 10,
  sort: { field: 'data', direction: 'desc' },
  search: undefined,
};
const HISTORICO: ListSoroterapiaHistoricoQuery = { ...EM_ANDAMENTO, status: undefined };

describe('duracaoEmMinutos', () => {
  it('é nula sem fim e arredonda o intervalo em minutos', () => {
    expect(duracaoEmMinutos({ iniciadoEm: INICIO, finalizadoEm: null })).toBeNull();
    expect(
      duracaoEmMinutos({
        iniciadoEm: INICIO,
        finalizadoEm: new Date(INICIO.getTime() + 45 * 60_000),
      }),
    ).toBe(45);
    expect(
      duracaoEmMinutos({ iniciadoEm: INICIO, finalizadoEm: new Date(INICIO.getTime() - 60_000) }),
    ).toBe(0);
  });
});

describe('toSoroterapiaChecklist e exportação', () => {
  it('usa os nomes dos outros módulos e deixa nulo o que não encontra', () => {
    const nomes = { pacientes: new Map([[PACIENTE, 'Paciente Teste']]), profissionais: new Map() };
    const item = toSoroterapiaChecklist(checklist() as never, nomes);
    expect(item).toMatchObject({
      pacienteNome: 'Paciente Teste',
      profissionalNome: null,
      protocolo: 'Protocolo Alfa',
      data: INICIO.toISOString(),
      duracaoMinutos: null,
    });
  });

  it('as colunas exportáveis são as do grid, na ordem do inventário', () => {
    expect(SOROTERAPIA_EXPORT_DEFINITIONS.map((c) => c.key)).toEqual([
      ...SOROTERAPIA_EXPORT_COLUMNS,
    ]);
  });
});

describe('SoroterapiaService', () => {
  it('Em Andamento lista só EM_ANDAMENTO, não excluídos, no escopo, e calcula a paginação', async () => {
    const { service, tx } = setup(escopoFalso([MEDICO]));
    tx.soroterapiaChecklist.count.mockResolvedValue(25);
    const pagina = await service.listEmAndamento({ ...EM_ANDAMENTO, pageSize: 10 });
    expect(pagina.meta).toEqual({ page: 1, pageSize: 10, total: 25, totalPages: 3 });
    expect(pagina.data[0]).toMatchObject({
      pacienteNome: 'Paciente Teste',
      status: 'EM_ANDAMENTO',
    });
    expect(tx.soroterapiaChecklist.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          deletedAt: null,
          status: { in: ['EM_ANDAMENTO'] },
          profissionalId: { in: [MEDICO] },
        },
        skip: 0,
        take: 10,
      }),
    );
  });

  it('Historico lista Finalizado e Suspenso, ou só o escolhido no chip', async () => {
    const { service, tx } = setup();
    await service.listHistorico(HISTORICO);
    expect(tx.soroterapiaChecklist.findMany.mock.calls[0]?.[0].where.status).toEqual({
      in: ['FINALIZADO', 'SUSPENSO'],
    });
    await service.listHistorico({ ...HISTORICO, status: 'SUSPENSO' });
    expect(tx.soroterapiaChecklist.findMany.mock.calls[1]?.[0].where.status).toEqual({
      in: ['SUSPENSO'],
    });
  });

  it('a busca procura no protocolo e nos pacientes encontrados pelo nome', async () => {
    const { service, tx, pacientes } = setup();
    pacientes.idsPorBusca.mockResolvedValue([PACIENTE]);
    await service.listEmAndamento({ ...EM_ANDAMENTO, search: 'ana' });
    expect(tx.soroterapiaChecklist.findMany.mock.calls[0]?.[0].where.OR).toEqual([
      { protocoloNome: { contains: 'ana', mode: 'insensitive' } },
      { pacienteId: { in: [PACIENTE] } },
    ]);
    pacientes.idsPorBusca.mockResolvedValue([]);
    await service.listEmAndamento({ ...EM_ANDAMENTO, search: 'zzz' });
    expect(tx.soroterapiaChecklist.findMany.mock.calls[1]?.[0].where.OR).toEqual([
      { protocoloNome: { contains: 'zzz', mode: 'insensitive' } },
    ]);
  });

  it('ordena por paciente pelos nomes do outro módulo, já que não há FK', async () => {
    const { service, tx } = setup();
    tx.soroterapiaChecklist.findMany
      .mockResolvedValueOnce([{ id: 'c1', pacienteId: PACIENTE, profissionalId: MEDICO }])
      .mockResolvedValueOnce([checklist()]);
    const pagina = await service.listEmAndamento({
      ...EM_ANDAMENTO,
      sort: { field: 'paciente', direction: 'asc' },
    });
    expect(pagina.data.map((c) => c.id)).toEqual(['c1']);
    expect(tx.soroterapiaChecklist.findMany).toHaveBeenLastCalledWith({
      where: { id: { in: ['c1'] } },
    });
  });

  it('exporta com os mesmos filtros, sem paginação, e respeita o limite', async () => {
    const { service, tx, exportService } = setup();
    await service.exportHistorico({
      format: 'xlsx',
      columns: ['paciente', 'protocolo'],
      sort: { field: 'data', direction: 'desc' },
      search: undefined,
      status: 'FINALIZADO',
    });
    expect(exportService.ensureWithinLimit).toHaveBeenCalledWith(1);
    expect(tx.soroterapiaChecklist.findMany.mock.calls[0]?.[0]).not.toHaveProperty('take');
    expect(exportService.export).toHaveBeenCalledWith(
      expect.objectContaining({
        format: 'xlsx',
        filename: 'soroterapia-historico',
        columns: [
          expect.objectContaining({ key: 'paciente' }),
          expect.objectContaining({ key: 'protocolo' }),
        ],
      }),
    );
  });

  it('fila do dia e pacotes vêm dos módulos donos; pacotes recebe o escopo de pacientes', async () => {
    const { service, agendamentos, orcamentos, vinculados } = setup();
    await service.filaDia();
    expect(agendamentos.listarFilaSoroterapia).toHaveBeenCalledTimes(1);
    vinculados.idsNoEscopo.mockResolvedValue([PACIENTE]);
    await service.pacotes();
    expect(orcamentos.listarPacotesProtocolo).toHaveBeenCalledWith([PACIENTE]);
  });
});
