import type { TransactionHost } from '@nestjs-cls/transactional';
import type { ListEncaminhamentosQuery, RelatorioEncaminhamentosQuery } from '@torres/shared';
import { escopoFalso } from '../../../../test/utils/escopo-falso';
import { ApiException } from '../../../common/errors/api.exception';
import type { EscopoDadosService } from '../../../common/auth/escopo-dados.service';
import type { ExportService } from '../../../common/export/export.service';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import type { AgendamentosAtendimentoService } from '../../comercial-atendimento/agenda/agendamentos-atendimento.service';
import type { PacientesService } from '../../comercial-atendimento/pacientes/pacientes.service';
import type { EspecialidadesService } from '../../gestao-profissionais/especialidades/especialidades.service';
import type { ProfissionaisService } from '../../gestao-profissionais/profissionais/profissionais.service';
import type { ContratosSalaService } from '../../gestao-profissionais/salas/contratos-sala.service';
import type { PacientesVinculadosService } from '../pacientes-vinculados/pacientes-vinculados.service';
import {
  DESTINO_SEM_INDICACAO,
  ENCAMINHAMENTO_EXPORT_DEFINITIONS,
  EncaminhamentosService,
  ORIGEM_SEM_INDICACAO,
} from './encaminhamentos.service';

const PACIENTE = '1d9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const ORIGEM = '2d9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const DESTINO = '3d9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const OUTRO = '4d9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const ESPECIALIDADE = '5d9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const ID = '6d9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';

const NOMES = new Map([
  [ORIGEM, 'Dr. Origem'],
  [DESTINO, 'Dra. Destino'],
  [OUTRO, 'Dr. Outro'],
]);

function registro(extra: Record<string, unknown> = {}) {
  return {
    id: ID,
    pacienteId: PACIENTE,
    origemProfissionalId: ORIGEM,
    destinoProfissionalId: DESTINO,
    especialidadeId: null,
    data: new Date('2026-11-10T00:00:00.000Z'),
    motivo: 'Avaliação',
    createdAt: new Date('2026-11-10T12:00:00.000Z'),
    updatedAt: new Date('2026-11-10T12:00:00.000Z'),
    deletedAt: null,
    ...extra,
  };
}

interface Opcoes {
  registros?: ReturnType<typeof registro>[];
  atendimentos?: { pacienteId: string; profissionalId: string; finalizadoEm: Date }[];
  agendamentos?: {
    pacienteId: string;
    profissionalId: string;
    inicio: Date;
    atendido: boolean;
  }[];
  permitidos?: string[];
  escopo?: EscopoDadosService;
  vinculado?: boolean;
}

function setup({
  registros = [registro()],
  atendimentos = [],
  agendamentos = [],
  permitidos = [ORIGEM, DESTINO],
  escopo = escopoFalso(),
  vinculado = true,
}: Opcoes = {}) {
  const tx = {
    encaminhamento: {
      findMany: jest.fn().mockResolvedValue(registros),
      findFirst: jest.fn().mockResolvedValue(registros[0] ?? null),
      create: jest.fn().mockImplementation(({ data }) => Promise.resolve(registro(data))),
      update: jest
        .fn()
        .mockImplementation(({ data }) => Promise.resolve(registro({ ...registros[0], ...data }))),
    },
    atendimento: { findMany: jest.fn().mockResolvedValue(atendimentos) },
  };
  const exportService = {
    ensureWithinLimit: jest.fn(),
    export: jest.fn().mockResolvedValue({ filename: 'x.xlsx' }),
  };
  const pacientes = {
    findById: jest.fn().mockResolvedValue({ id: PACIENTE }),
    nomesPorIds: jest.fn().mockResolvedValue(new Map([[PACIENTE, 'Paciente Teste']])),
    idsPorBusca: jest.fn().mockResolvedValue([]),
  };
  const profissionais = {
    findById: jest.fn().mockResolvedValue({ id: ORIGEM }),
    nomesPorIds: jest.fn().mockResolvedValue(NOMES),
    idsPorBusca: jest.fn().mockResolvedValue([]),
  };
  const especialidades = {
    findById: jest.fn().mockResolvedValue({ id: ESPECIALIDADE }),
    findLookupById: jest.fn().mockResolvedValue({ id: ESPECIALIDADE, label: 'Cardiologia' }),
  };
  const contratos = {
    profissionaisQuePermitemIndicacao: jest.fn().mockResolvedValue(new Set(permitidos)),
  };
  const agenda = { agendamentosDosPares: jest.fn().mockResolvedValue(agendamentos) };
  const vinculados = {
    garantir: jest.fn().mockImplementation(() => {
      if (!vinculado) throw new ApiException(403, 'FORBIDDEN', 'Sem permissão');
      return Promise.resolve();
    }),
  };
  const service = new EncaminhamentosService(
    { tx } as unknown as TransactionHost<PrismaAdapter>,
    exportService as unknown as ExportService,
    pacientes as unknown as PacientesService,
    profissionais as unknown as ProfissionaisService,
    especialidades as unknown as EspecialidadesService,
    contratos as unknown as ContratosSalaService,
    agenda as unknown as AgendamentosAtendimentoService,
    vinculados as unknown as PacientesVinculadosService,
    escopo,
  );
  return {
    service,
    tx,
    exportService,
    pacientes,
    profissionais,
    especialidades,
    contratos,
    vinculados,
  };
}

const QUERY: ListEncaminhamentosQuery = {
  page: 1,
  pageSize: 10,
  sort: { field: 'data', direction: 'desc' },
  search: undefined,
  situacao: undefined,
  origemProfissionalId: undefined,
  destinoProfissionalId: undefined,
  de: undefined,
  ate: undefined,
};

const INPUT = {
  pacienteId: PACIENTE,
  origemProfissionalId: ORIGEM,
  destinoProfissionalId: DESTINO,
  especialidadeId: null,
  data: '2026-11-20',
  motivo: 'Avaliação',
};

const falha = (promessa: Promise<unknown>) =>
  promessa.then(
    () => null,
    (e: unknown) => e,
  );

describe('EncaminhamentosService', () => {
  describe('situação derivada', () => {
    const situacaoDe = async (opcoes: Opcoes) =>
      (await setup(opcoes).service.list(QUERY)).data[0]?.situacao;

    it('ENCAMINHADO quando o paciente não foi agendado nem atendido pelo destino', async () => {
      expect(await situacaoDe({})).toBe('ENCAMINHADO');
    });

    it('AGENDADO com agendamento ativo no destino a partir da data do encaminhamento', async () => {
      const agendamentos = [
        {
          pacienteId: PACIENTE,
          profissionalId: DESTINO,
          inicio: new Date('2026-11-12T13:00:00Z'),
          atendido: false,
        },
      ];
      expect(await situacaoDe({ agendamentos })).toBe('AGENDADO');
    });

    it('ATENDIDO com atendimento finalizado no destino', async () => {
      const atendimentos = [
        {
          pacienteId: PACIENTE,
          profissionalId: DESTINO,
          finalizadoEm: new Date('2026-11-15T13:00:00Z'),
        },
      ];
      expect(await situacaoDe({ atendimentos })).toBe('ATENDIDO');
    });

    it('ATENDIDO com agendamento já atendido', async () => {
      const agendamentos = [
        {
          pacienteId: PACIENTE,
          profissionalId: DESTINO,
          inicio: new Date('2026-11-12T13:00:00Z'),
          atendido: true,
        },
      ];
      expect(await situacaoDe({ agendamentos })).toBe('ATENDIDO');
    });

    it('ignora o que aconteceu antes do dia do encaminhamento ou com outro profissional', async () => {
      const agendamentos = [
        {
          pacienteId: PACIENTE,
          profissionalId: DESTINO,
          inicio: new Date('2026-11-09T12:00:00Z'),
          atendido: true,
        },
        {
          pacienteId: PACIENTE,
          profissionalId: OUTRO,
          inicio: new Date('2026-11-12T12:00:00Z'),
          atendido: true,
        },
      ];
      const atendimentos = [
        {
          pacienteId: PACIENTE,
          profissionalId: OUTRO,
          finalizadoEm: new Date('2026-11-15T12:00:00Z'),
        },
      ];
      expect(await situacaoDe({ agendamentos, atendimentos })).toBe('ENCAMINHADO');
    });

    it('o dia do encaminhamento começa à 00:00 de Brasília', async () => {
      const antes = [
        {
          pacienteId: PACIENTE,
          profissionalId: DESTINO,
          inicio: new Date('2026-11-10T02:59:00Z'),
          atendido: false,
        },
      ];
      const depois = [
        {
          pacienteId: PACIENTE,
          profissionalId: DESTINO,
          inicio: new Date('2026-11-10T03:00:00Z'),
          atendido: false,
        },
      ];
      expect(await situacaoDe({ agendamentos: antes })).toBe('ENCAMINHADO');
      expect(await situacaoDe({ agendamentos: depois })).toBe('AGENDADO');
    });
  });

  describe('list', () => {
    const dois = [
      registro({ id: 'a', data: new Date('2026-11-01T00:00:00Z') }),
      registro({ id: 'b', data: new Date('2026-11-05T00:00:00Z'), especialidadeId: ESPECIALIDADE }),
    ];

    it('devolve nomes e meta, mais recente primeiro', async () => {
      const { service, especialidades } = setup({ registros: dois });
      const pagina = await service.list(QUERY);
      expect(pagina.data.map((e) => e.id)).toEqual(['b', 'a']);
      expect(pagina.data[0]).toMatchObject({
        pacienteNome: 'Paciente Teste',
        origemProfissionalNome: 'Dr. Origem',
        destinoProfissionalNome: 'Dra. Destino',
        especialidadeNome: 'Cardiologia',
        data: '2026-11-05',
      });
      expect(pagina.meta).toEqual({ page: 1, pageSize: 10, total: 2, totalPages: 1 });
      expect(especialidades.findLookupById).toHaveBeenCalledTimes(1);
    });

    it('ordena e pagina', async () => {
      const { service } = setup({ registros: dois });
      const pagina = await service.list({
        ...QUERY,
        pageSize: 1,
        page: 2,
        sort: { field: 'data', direction: 'asc' },
      });
      expect(pagina.data.map((e) => e.id)).toEqual(['b']);
      expect(pagina.meta.totalPages).toBe(2);
    });

    it('filtra pela situação depois de derivá-la', async () => {
      const agendamentos = [
        {
          pacienteId: PACIENTE,
          profissionalId: DESTINO,
          inicio: new Date('2026-11-12T13:00:00Z'),
          atendido: false,
        },
      ];
      const { service } = setup({
        registros: [
          registro({ id: 'a', data: new Date('2026-11-20T00:00:00Z') }),
          dois[1] as ReturnType<typeof registro>,
        ],
        agendamentos,
      });
      const agendados = await service.list({ ...QUERY, situacao: 'AGENDADO' });
      expect(agendados.data).toHaveLength(1);
      expect(agendados.data[0]?.id).toBe('b');
      expect((await service.list({ ...QUERY, situacao: 'ATENDIDO' })).data).toEqual([]);
    });

    it('mantém o nome da especialidade nulo quando ela foi excluída', async () => {
      const { service, especialidades } = setup({ registros: dois });
      especialidades.findLookupById.mockRejectedValue(new Error('404'));
      expect((await service.list(QUERY)).data[0]?.especialidadeNome).toBeNull();
    });

    it('a busca olha o motivo e os nomes de paciente e profissionais', async () => {
      const { service, tx, pacientes, profissionais } = setup({ registros: dois });
      pacientes.idsPorBusca.mockResolvedValue([PACIENTE]);
      profissionais.idsPorBusca.mockResolvedValue([OUTRO]);
      await service.list({ ...QUERY, search: 'abc' });
      expect(tx.encaminhamento.findMany).toHaveBeenCalledWith({
        where: {
          deletedAt: null,
          AND: [
            {
              OR: [
                { motivo: { contains: 'abc', mode: 'insensitive' } },
                { pacienteId: { in: [PACIENTE] } },
                { origemProfissionalId: { in: [OUTRO] } },
                { destinoProfissionalId: { in: [OUTRO] } },
              ],
            },
          ],
        },
      });
    });

    it('usuário restrito só pesquisa onde um dos seus profissionais é origem ou destino', async () => {
      const { service, tx } = setup({ escopo: escopoFalso([DESTINO]) });
      await service.list({ ...QUERY, de: '2026-11-01', ate: '2026-11-30' });
      expect(tx.encaminhamento.findMany).toHaveBeenCalledWith({
        where: {
          deletedAt: null,
          data: {
            gte: new Date('2026-11-01T00:00:00Z'),
            lte: new Date('2026-11-30T00:00:00Z'),
          },
          AND: [
            {
              OR: [
                { origemProfissionalId: { in: [DESTINO] } },
                { destinoProfissionalId: { in: [DESTINO] } },
              ],
            },
          ],
        },
      });
    });

    it('lista vazia sem consultar outros módulos', async () => {
      const { service, pacientes } = setup({ registros: [] });
      expect((await service.list(QUERY)).data).toEqual([]);
      expect(pacientes.nomesPorIds).not.toHaveBeenCalled();
    });
  });

  describe('findById', () => {
    it('404 quando não existe', async () => {
      const { service, tx } = setup();
      tx.encaminhamento.findFirst.mockResolvedValue(null);
      expect(await falha(service.findById(ID))).toMatchObject({ status: 404 });
    });

    it('o destino vê o encaminhamento; quem não é origem nem destino recebe 403', async () => {
      expect((await setup({ escopo: escopoFalso([DESTINO]) }).service.findById(ID)).id).toBe(ID);
      expect(
        await falha(setup({ escopo: escopoFalso([OUTRO]) }).service.findById(ID)),
      ).toMatchObject({
        status: 403,
      });
    });
  });

  describe('profissionaisSelecionaveis', () => {
    it('lista só quem tem contrato com indicação, em ordem alfabética', async () => {
      const { service } = setup({ permitidos: [DESTINO, ORIGEM] });
      const { origens, destinos } = await service.profissionaisSelecionaveis();
      expect(destinos.map((p) => p.label)).toEqual(['Dr. Origem', 'Dra. Destino']);
      expect(origens).toEqual(destinos);
    });

    it('as origens respeitam o escopo; os destinos trazem todos', async () => {
      const { service } = setup({ permitidos: [DESTINO, ORIGEM], escopo: escopoFalso([ORIGEM]) });
      const { origens, destinos } = await service.profissionaisSelecionaveis();
      expect(origens.map((p) => p.id)).toEqual([ORIGEM]);
      expect(destinos).toHaveLength(2);
    });
  });

  describe('create', () => {
    it('grava com a data informada e devolve o DTO', async () => {
      const { service, tx } = setup();
      const criado = await service.create(INPUT);
      expect(tx.encaminhamento.create).toHaveBeenCalledWith({
        data: {
          pacienteId: PACIENTE,
          origemProfissionalId: ORIGEM,
          destinoProfissionalId: DESTINO,
          especialidadeId: null,
          data: new Date('2026-11-20T00:00:00.000Z'),
          motivo: 'Avaliação',
        },
      });
      expect(criado.situacao).toBe('ENCAMINHADO');
    });

    it('sem data, grava o dia de hoje na clínica', async () => {
      const { service, tx } = setup();
      await service.create({ ...INPUT, data: null });
      const { data } = tx.encaminhamento.create.mock.calls[0][0] as { data: { data: Date } };
      expect(data.data.toISOString().slice(0, 10)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('valida paciente, profissionais e especialidade nos outros módulos', async () => {
      const { service, pacientes, profissionais, especialidades } = setup();
      await service.create({ ...INPUT, especialidadeId: ESPECIALIDADE });
      expect(pacientes.findById).toHaveBeenCalledWith(PACIENTE);
      expect(profissionais.findById).toHaveBeenCalledWith(ORIGEM);
      expect(profissionais.findById).toHaveBeenCalledWith(DESTINO);
      expect(especialidades.findById).toHaveBeenCalledWith(ESPECIALIDADE);
    });

    it('422 quando o destino não tem contrato que permita indicação', async () => {
      const { service, tx } = setup({ permitidos: [ORIGEM] });
      expect(await falha(service.create(INPUT))).toMatchObject({
        status: 422,
        code: 'DESTINO_SEM_INDICACAO',
        message: DESTINO_SEM_INDICACAO,
      });
      expect(tx.encaminhamento.create).not.toHaveBeenCalled();
    });

    it('422 quando a origem não tem contrato que permita indicação', async () => {
      const { service } = setup({ permitidos: [DESTINO] });
      expect(await falha(service.create(INPUT))).toMatchObject({
        code: 'ORIGEM_SEM_INDICACAO',
        message: ORIGEM_SEM_INDICACAO,
      });
    });

    it('403 quando a origem é de um profissional fora do escopo', async () => {
      const { service, tx } = setup({ escopo: escopoFalso([OUTRO]) });
      expect(await falha(service.create(INPUT))).toMatchObject({ status: 403 });
      expect(tx.encaminhamento.create).not.toHaveBeenCalled();
    });

    it('403 quando o paciente não é vinculado ao escopo do usuário', async () => {
      const { service } = setup({ escopo: escopoFalso([ORIGEM]), vinculado: false });
      expect(await falha(service.create(INPUT))).toMatchObject({ status: 403 });
    });

    it('recepção com profissionais vinculados registra pela origem', async () => {
      const { service, vinculados } = setup({ escopo: escopoFalso([ORIGEM, OUTRO]) });
      await service.create(INPUT);
      expect(vinculados.garantir).toHaveBeenCalledWith(PACIENTE);
    });
  });

  describe('update', () => {
    it('só exige contrato de quem mudou: ajustar o motivo não depende do contrato atual', async () => {
      const { service, tx } = setup({ permitidos: [] });
      await service.update(ID, { ...INPUT, data: null, motivo: 'Novo motivo' });
      expect(tx.encaminhamento.update).toHaveBeenCalledWith({
        where: { id: ID },
        data: expect.objectContaining({
          motivo: 'Novo motivo',
          data: new Date('2026-11-10T00:00:00.000Z'),
        }),
      });
    });

    it('trocar o destino exige contrato que permita indicação', async () => {
      const { service } = setup({ permitidos: [ORIGEM] });
      expect(
        await falha(service.update(ID, { ...INPUT, destinoProfissionalId: OUTRO })),
      ).toMatchObject({
        code: 'DESTINO_SEM_INDICACAO',
      });
    });

    it('404 quando não existe e 403 quando a origem não é do usuário', async () => {
      const inexistente = setup();
      inexistente.tx.encaminhamento.findFirst.mockResolvedValue(null);
      expect(await falha(inexistente.service.update(ID, INPUT))).toMatchObject({ status: 404 });
      const destino = setup({ escopo: escopoFalso([DESTINO]) });
      expect(await falha(destino.service.update(ID, INPUT))).toMatchObject({ status: 403 });
    });
  });

  describe('remove', () => {
    it('exclusão lógica', async () => {
      const { service, tx } = setup();
      await service.remove(ID);
      expect(tx.encaminhamento.update).toHaveBeenCalledWith({
        where: { id: ID },
        data: { deletedAt: expect.any(Date) },
      });
    });

    it('o destino não exclui o encaminhamento', async () => {
      const { service, tx } = setup({ escopo: escopoFalso([DESTINO]) });
      expect(await falha(service.remove(ID))).toMatchObject({ status: 403 });
      expect(tx.encaminhamento.update).not.toHaveBeenCalled();
    });
  });

  describe('export', () => {
    it('exporta as linhas filtradas nas colunas pedidas', async () => {
      const { service, exportService } = setup();
      await service.export({ ...QUERY, format: 'xlsx', columns: ['paciente', 'situacao'] });
      expect(exportService.ensureWithinLimit).toHaveBeenCalledWith(1);
      const arg = exportService.export.mock.calls[0][0] as {
        columns: { key: string }[];
        rows: unknown[];
      };
      expect(arg.columns.map((c) => c.key)).toEqual(['paciente', 'situacao']);
      expect(arg.rows).toHaveLength(1);
    });

    it('as colunas exportadas formatam os valores', async () => {
      const dto = (await setup().service.list(QUERY)).data[0];
      const valores = ENCAMINHAMENTO_EXPORT_DEFINITIONS.map((c) => c.value(dto as never));
      expect(valores).toEqual([
        '2026-11-10',
        'Paciente Teste',
        'Dr. Origem',
        'Dra. Destino',
        '',
        'Encaminhado',
      ]);
    });
  });

  describe('relatorio', () => {
    const QUERY_REL: RelatorioEncaminhamentosQuery = {
      page: 1,
      pageSize: 10,
      sort: { field: 'profissional', direction: 'asc' },
      search: undefined,
      de: undefined,
      ate: undefined,
    };
    const registros = [
      registro({ id: 'a' }),
      registro({ id: 'b', pacienteId: 'p2' }),
      registro({ id: 'c', origemProfissionalId: DESTINO, destinoProfissionalId: ORIGEM }),
    ];
    const atendimentos = [
      {
        pacienteId: PACIENTE,
        profissionalId: DESTINO,
        finalizadoEm: new Date('2026-11-15T13:00:00Z'),
      },
    ];

    it('conta enviados, recebidos e a conversão em atendimento por profissional', async () => {
      const { service } = setup({ registros, atendimentos });
      const { data, meta } = await service.relatorio(QUERY_REL);
      expect(meta.total).toBe(2);
      expect(data).toEqual([
        {
          profissionalId: ORIGEM,
          profissionalNome: 'Dr. Origem',
          enviados: 2,
          enviadosAtendidos: 1,
          taxaEnviados: 50,
          recebidos: 1,
          recebidosAtendidos: 0,
          taxaRecebidos: 0,
        },
        {
          profissionalId: DESTINO,
          profissionalNome: 'Dra. Destino',
          enviados: 1,
          enviadosAtendidos: 0,
          taxaEnviados: 0,
          recebidos: 2,
          recebidosAtendidos: 1,
          taxaRecebidos: 50,
        },
      ]);
    });

    it('ordena pelas colunas numéricas', async () => {
      const { service } = setup({ registros, atendimentos });
      const { data } = await service.relatorio({
        ...QUERY_REL,
        sort: { field: 'recebidos', direction: 'desc' },
      });
      expect(data.map((l) => l.profissionalId)).toEqual([DESTINO, ORIGEM]);
    });

    it('usuário restrito vê só as linhas dos próprios profissionais', async () => {
      const { service } = setup({ registros, atendimentos, escopo: escopoFalso([ORIGEM]) });
      const { data } = await service.relatorio(QUERY_REL);
      expect(data.map((l) => l.profissionalId)).toEqual([ORIGEM]);
    });

    it('sem encaminhamentos, devolve vazio', async () => {
      const { service } = setup({ registros: [] });
      expect((await service.relatorio(QUERY_REL)).meta.total).toBe(0);
    });
  });
});
