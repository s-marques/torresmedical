import type { TransactionHost } from '@nestjs-cls/transactional';
import { PRESCRICAO_EXPORT_COLUMNS, type ListPrescricoesQuery } from '@torres/shared';
import { escopoFalso } from '../../../../test/utils/escopo-falso';
import type { ExportService } from '../../../common/export/export.service';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import type { PacientesService } from '../../comercial-atendimento/pacientes/pacientes.service';
import type { ProfissionaisService } from '../../gestao-profissionais/profissionais/profissionais.service';
import {
  hojeNaClinica,
  PRESCRICAO_EXPORT_DEFINITIONS,
  PrescricoesService,
} from './prescricoes.service';

const MEDICO = '1d9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const OUTRO = '2d9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const PACIENTE = '3d9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const BLOCO = '4d9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
/** 18/11/2026, 23h30 em Brasília: em UTC já é 19/11, mas a prescrição é do dia da clínica. */
const AGORA = new Date('2026-11-19T02:30:00.000Z');

function bloco(extra: Record<string, unknown> = {}) {
  return {
    id: BLOCO,
    tipo: 'AMARELA',
    numeroInicio: 11,
    numeroFim: 13,
    profissionalId: MEDICO,
    usados: 0,
    status: 'ATIVO',
    ...extra,
  };
}

function prescricao(extra: Record<string, unknown> = {}) {
  return {
    id: 'r1',
    blocoId: BLOCO,
    numero: 11,
    pacienteId: PACIENTE,
    profissionalId: MEDICO,
    atendimentoId: null,
    medicacao: 'Medicamento X',
    posologia: null,
    dataPrescricao: new Date('2026-11-18T00:00:00.000Z'),
    createdAt: AGORA,
    bloco: { tipo: 'AMARELA' },
    ...extra,
  };
}

function setup({ atual = bloco(), escopo = escopoFalso() } = {}) {
  let usados = atual.usados as number;
  const tx = {
    receituarioBloco: {
      findFirst: jest.fn().mockResolvedValue(atual),
      update: jest.fn().mockImplementation(({ data }) => {
        if (data.usados) usados += 1;
        return Promise.resolve({ ...atual, usados, ...(data.status && { status: data.status }) });
      }),
    },
    prescricao: {
      create: jest
        .fn()
        .mockImplementation(({ data }) => Promise.resolve(prescricao({ ...data, id: 'nova' }))),
      findMany: jest.fn().mockResolvedValue([prescricao()]),
      count: jest.fn().mockResolvedValue(1),
    },
  };
  const exportService = {
    ensureWithinLimit: jest.fn(),
    export: jest.fn().mockResolvedValue({ filename: 'x.xlsx' }),
  };
  const pacientes = {
    detalhe: jest.fn().mockResolvedValue({ id: PACIENTE }),
    nomesPorIds: jest.fn().mockResolvedValue(new Map([[PACIENTE, 'Paciente Teste']])),
    idsPorBusca: jest.fn().mockResolvedValue([]),
  };
  const profissionais = {
    nomesPorIds: jest.fn().mockResolvedValue(new Map([[MEDICO, 'Dr. Teste']])),
    idsPorBusca: jest.fn().mockResolvedValue([]),
  };
  const service = new PrescricoesService(
    { tx } as unknown as TransactionHost<PrismaAdapter>,
    exportService as unknown as ExportService,
    pacientes as unknown as PacientesService,
    profissionais as unknown as ProfissionaisService,
    escopo,
  );
  return { service, tx, exportService, pacientes, profissionais };
}

const INPUT = {
  blocoId: BLOCO,
  pacienteId: PACIENTE,
  medicacao: 'Medicamento X',
  posologia: null,
  dataPrescricao: null,
};

const QUERY: ListPrescricoesQuery = {
  page: 1,
  pageSize: 10,
  sort: { field: 'dataPrescricao', direction: 'desc' },
  search: undefined,
  de: undefined,
  ate: undefined,
};

describe('PrescricoesService', () => {
  it('hojeNaClinica usa o fuso de São Paulo', () => {
    expect(hojeNaClinica(AGORA)).toBe('2026-11-18');
  });

  describe('create', () => {
    it('usa a próxima folha, o médico do bloco e a data de hoje da clínica', async () => {
      const { service, tx } = setup({ atual: bloco({ usados: 1 }) });
      const criada = await service.create(INPUT, AGORA);
      expect(tx.prescricao.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            numero: 12,
            profissionalId: MEDICO,
            dataPrescricao: new Date('2026-11-18T00:00:00.000Z'),
          }),
        }),
      );
      expect(criada).toMatchObject({
        pacienteNome: 'Paciente Teste',
        profissionalNome: 'Dr. Teste',
      });
      expect(tx.receituarioBloco.update).toHaveBeenCalledTimes(1);
    });

    it('a última folha finaliza o bloco', async () => {
      const { service, tx } = setup({ atual: bloco({ usados: 2 }) });
      await service.create({ ...INPUT, dataPrescricao: '2026-11-10' }, AGORA);
      expect(tx.receituarioBloco.update).toHaveBeenLastCalledWith({
        where: { id: BLOCO },
        data: { status: 'FINALIZADO' },
      });
      expect(tx.prescricao.create.mock.calls[0][0].data.numero).toBe(13);
    });

    it('422 quando outra prescrição levou a última folha', async () => {
      const { service, tx } = setup({ atual: bloco({ usados: 3 }) });
      await expect(service.create(INPUT, AGORA)).rejects.toMatchObject({
        code: 'BLOCO_ESGOTADO',
      });
      expect(tx.prescricao.create).not.toHaveBeenCalled();
    });

    it('404 sem bloco, 422 sem médico ou fora de Ativo, 403 fora do escopo', async () => {
      const semBloco = setup();
      semBloco.tx.receituarioBloco.findFirst.mockResolvedValue(null);
      await expect(semBloco.service.create(INPUT)).rejects.toMatchObject({ code: 'NOT_FOUND' });

      await expect(
        setup({ atual: bloco({ profissionalId: null }) }).service.create(INPUT),
      ).rejects.toMatchObject({ code: 'BLOCO_SEM_MEDICO' });
      await expect(
        setup({ atual: bloco({ status: 'CANCELADO' }) }).service.create(INPUT),
      ).rejects.toMatchObject({
        code: 'BLOCO_INDISPONIVEL',
        message: 'Bloco cancelado não aceita novas prescrições',
      });

      const restrito = setup({ escopo: escopoFalso([OUTRO]) });
      await expect(restrito.service.create(INPUT)).rejects.toMatchObject({ code: 'FORBIDDEN' });
      expect(restrito.tx.receituarioBloco.update).not.toHaveBeenCalled();
    });
  });

  describe('list', () => {
    it('filtra tipo, período e escopo; busca em medicação, nomes e número', async () => {
      const { service, tx, pacientes } = setup({ escopo: escopoFalso([MEDICO]) });
      pacientes.idsPorBusca.mockResolvedValue([PACIENTE]);
      const page = await service.list({
        ...QUERY,
        tipo: 'AZUL',
        de: '2026-11-01',
        ate: '2026-11-30',
        search: '12',
      });
      expect(page.meta).toEqual({ page: 1, pageSize: 10, total: 1, totalPages: 1 });
      const where = tx.prescricao.findMany.mock.calls[0][0].where;
      expect(where).toMatchObject({
        profissionalId: { in: [MEDICO] },
        bloco: { tipo: 'AZUL' },
        dataPrescricao: {
          gte: new Date('2026-11-01T00:00:00.000Z'),
          lte: new Date('2026-11-30T00:00:00.000Z'),
        },
      });
      expect(where.OR).toEqual([
        { medicacao: { contains: '12', mode: 'insensitive' } },
        { pacienteId: { in: [PACIENTE] } },
        { numero: 12 },
      ]);
    });

    it('ordena pelo tipo do bloco e, pelo nome do médico, em memória', async () => {
      const porTipo = setup();
      await porTipo.service.list({ ...QUERY, sort: { field: 'tipo', direction: 'asc' } });
      expect(porTipo.tx.prescricao.findMany.mock.calls[0][0].orderBy[0]).toEqual({
        bloco: { tipo: 'asc' },
      });

      const porMedico = setup();
      porMedico.tx.prescricao.findMany
        .mockResolvedValueOnce([
          { id: 'b', pacienteId: PACIENTE, profissionalId: OUTRO },
          { id: 'a', pacienteId: PACIENTE, profissionalId: MEDICO },
        ])
        .mockResolvedValueOnce([prescricao({ id: 'b' }), prescricao({ id: 'a' })]);
      porMedico.profissionais.nomesPorIds.mockResolvedValue(
        new Map([
          [MEDICO, 'Ana'],
          [OUTRO, 'Bruno'],
        ]),
      );
      const page = await porMedico.service.list({
        ...QUERY,
        sort: { field: 'medico', direction: 'asc' },
      });
      expect(page.data.map((p) => p.id)).toEqual(['a', 'b']);
      expect(page.meta.total).toBe(2);
    });
  });

  it('doPaciente e todasDoPaciente aplicam o escopo', async () => {
    const { service, tx } = setup({ escopo: escopoFalso([MEDICO]) });
    const page = await service.doPaciente(PACIENTE, { page: 2, pageSize: 5 });
    expect(tx.prescricao.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { deletedAt: null, pacienteId: PACIENTE, profissionalId: { in: [MEDICO] } },
        skip: 5,
        take: 5,
      }),
    );
    expect(page.meta.totalPages).toBe(1);
    expect(await service.todasDoPaciente(PACIENTE)).toHaveLength(1);
  });

  it('export: colunas visíveis e limite', async () => {
    const { service, exportService } = setup();
    await service.export({ ...QUERY, format: 'pdf', columns: ['numero', 'paciente'] });
    expect(exportService.ensureWithinLimit).toHaveBeenCalledWith(1);
    const args = exportService.export.mock.calls[0][0];
    expect(args.columns.map((c: { key: string }) => c.key)).toEqual(['numero', 'paciente']);
    expect(args.rows[0]).toMatchObject({ numero: 11, pacienteNome: 'Paciente Teste' });
  });

  it('definições de exportação cobrem todas as colunas, com o número formatado', () => {
    expect(PRESCRICAO_EXPORT_DEFINITIONS.map((c) => c.key)).toEqual([...PRESCRICAO_EXPORT_COLUMNS]);
    const linha = {
      numero: 7,
      tipo: 'BRANCA',
      pacienteNome: null,
      profissionalNome: null,
      medicacao: 'X',
      dataPrescricao: '2026-11-18',
    } as never;
    expect(PRESCRICAO_EXPORT_DEFINITIONS.map((c) => c.value(linha))).toEqual([
      '000007',
      'Branca (C)',
      '',
      '',
      'X',
      '2026-11-18',
    ]);
  });
});
