import type { TransactionHost } from '@nestjs-cls/transactional';
import { createSalaBloqueioSchema, type ListSalaBloqueiosQuery } from '@torres/shared';
import { escopoFalso } from '../../../../test/utils/escopo-falso';
import { BusinessException } from '../../../common/errors/api.exception';
import type { RequestContextService } from '../../../common/context/request-context.service';
import type { ExportService } from '../../../common/export/export.service';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import type { UsuariosLookupService } from '../../configuracoes-gestao/usuarios/usuarios.service';
import type { ProfissionaisService } from '../profissionais/profissionais.service';
import { descreverPeriodoBloqueio, SalasBloqueiosService } from './salas-bloqueios.service';

const SALA = '11111111-1111-4111-8111-111111111111';
const BLOQ = '22222222-2222-4222-8222-222222222222';
const OUTRO = '33333333-3333-4333-8333-333333333333';
const PROF_A = '44444444-4444-4444-8444-444444444444';
const PROF_B = '55555555-5555-4555-8555-555555555555';
const USUARIO = '66666666-6666-4666-8666-666666666666';

/** Registro do banco com as relações do `INCLUDE`. */
function registro(dados: Record<string, unknown> = {}) {
  return {
    id: BLOQ,
    salaId: SALA,
    tipo: 'MANUTENCAO',
    profissionalId: null,
    recorrente: false,
    dataInicio: new Date('2026-12-10T00:00:00.000Z'),
    dataFim: new Date('2026-12-10T00:00:00.000Z'),
    horaInicio: '08:00',
    horaFim: '12:00',
    motivo: 'Troca do ar-condicionado',
    criadoPorId: USUARIO,
    canceladoEm: null,
    canceladoPorId: null,
    motivoCancelamento: null,
    createdAt: new Date('2026-11-19T10:00:00.000Z'),
    updatedAt: new Date('2026-11-19T10:00:00.000Z'),
    sala: { nome: 'Sala 1' },
    profissional: null,
    dias: [],
    ...dados,
  };
}

const ENTRADA = createSalaBloqueioSchema.parse({
  salaId: SALA,
  tipo: 'MANUTENCAO',
  dataInicio: '2026-12-10',
  dataFim: '2026-12-10',
  horaInicio: '10:00',
  horaFim: '14:00',
  motivo: 'Pintura',
});

function setup({
  escopo,
  existentes = [],
  atual = registro(),
}: {
  escopo?: string[];
  existentes?: unknown[];
  atual?: unknown;
} = {}) {
  const salaBloqueio = {
    findMany: jest.fn().mockResolvedValue(existentes),
    findFirst: jest.fn().mockResolvedValue(atual),
    count: jest.fn().mockResolvedValue(existentes.length),
    create: jest
      .fn()
      .mockImplementation(({ data }) =>
        Promise.resolve(registro({ ...data, id: OUTRO, dias: [] })),
      ),
    update: jest
      .fn()
      .mockImplementation(({ data }) =>
        Promise.resolve(registro({ ...(atual as object), ...data, dias: data.dias?.create ?? [] })),
      ),
  };
  const tx = {
    salaBloqueio,
    sala: { count: jest.fn().mockResolvedValue(1) },
    contratoSala: { findMany: jest.fn().mockResolvedValue([{ salaId: SALA }]) },
    $queryRaw: jest.fn().mockResolvedValue([]),
  };
  const txHost = { tx } as unknown as TransactionHost<PrismaAdapter>;
  const profissionais = { garantirExiste: jest.fn().mockResolvedValue(undefined) };
  const usuarios = { nomesPorIds: jest.fn().mockResolvedValue(new Map([[USUARIO, 'Ana']])) };
  const contexto = { getUserId: () => USUARIO };
  const service = new SalasBloqueiosService(
    txHost,
    profissionais as unknown as ProfissionaisService,
    usuarios as unknown as UsuariosLookupService,
    {} as ExportService,
    escopoFalso(escopo),
    contexto as unknown as RequestContextService,
  );
  return { service, tx, profissionais };
}

/** Query da listagem já validada (com os campos opcionais ausentes). */
function consulta(extra: Partial<ListSalaBloqueiosQuery> = {}): ListSalaBloqueiosQuery {
  return {
    page: 1,
    pageSize: 10,
    sort: { field: 'dataInicio', direction: 'desc' },
    search: undefined,
    de: undefined,
    ate: undefined,
    ...extra,
  };
}

describe('SalasBloqueiosService (issue #138)', () => {
  it('cria gravando o usuário como responsável e travando a sala', async () => {
    const { service, tx } = setup();
    const criado = await service.create(ENTRADA);
    expect(tx.$queryRaw).toHaveBeenCalled();
    expect(tx.salaBloqueio.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ criadoPorId: USUARIO, salaId: SALA, horaInicio: '10:00' }),
      }),
    );
    expect(criado).toMatchObject({ id: OUTRO, status: 'ATIVO', criadoPorNome: 'Ana' });
  });

  it('recusa com 409 o bloqueio sobreposto na mesma sala', async () => {
    const { service, tx } = setup({ existentes: [registro()] });
    await expect(service.create(ENTRADA)).rejects.toMatchObject({
      status: 409,
      response: expect.objectContaining({
        code: 'SALA_BLOQUEIO_CONFLITO',
        message: 'A sala Sala 1 já tem manutenção em 10/12/2026 (08:00-12:00).',
      }),
    });
    expect(tx.salaBloqueio.create).not.toHaveBeenCalled();
  });

  it('aceita horário que só encosta no bloqueio existente', async () => {
    const { service } = setup({ existentes: [registro({ horaFim: '10:00' })] });
    await expect(service.create(ENTRADA)).resolves.toMatchObject({ status: 'ATIVO' });
  });

  it('na alteração, ignora o próprio bloqueio na busca de conflitos', async () => {
    const { service, tx } = setup();
    await service.update(BLOQ, ENTRADA);
    expect(tx.salaBloqueio.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: { not: BLOQ } }) }),
    );
  });

  it('sala ou profissional inexistente: 400 no campo', async () => {
    const semSala = setup();
    semSala.tx.sala.count.mockResolvedValue(0);
    await expect(semSala.service.create(ENTRADA)).rejects.toMatchObject({ status: 400 });

    const semProf = setup();
    semProf.profissionais.garantirExiste.mockRejectedValue(
      new BusinessException('NOT_FOUND', 'x', { status: 404 }),
    );
    await expect(
      semProf.service.create({ ...ENTRADA, profissionalId: PROF_A }),
    ).rejects.toMatchObject({
      status: 400,
      response: expect.objectContaining({
        details: [{ field: 'profissionalId', message: 'Profissional inválido' }],
      }),
    });
  });

  it('cancela sem excluir, gravando quem, quando e o motivo', async () => {
    const { service, tx } = setup();
    const cancelado = await service.cancelar(BLOQ, { motivo: 'Obra adiada' });
    expect(tx.salaBloqueio.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          canceladoEm: expect.any(Date),
          canceladoPorId: USUARIO,
          motivoCancelamento: 'Obra adiada',
        },
      }),
    );
    expect(cancelado).toMatchObject({ status: 'CANCELADO', motivoCancelamento: 'Obra adiada' });
  });

  it('bloqueio cancelado não muda: 409', async () => {
    const { service } = setup({ atual: registro({ canceladoEm: new Date() }) });
    await expect(service.cancelar(BLOQ, { motivo: 'x' })).rejects.toMatchObject({ status: 409 });
    await expect(service.update(BLOQ, ENTRADA)).rejects.toMatchObject({ status: 409 });
  });

  it('não encontrado: 404', async () => {
    const { service } = setup({ atual: null });
    await expect(service.findById(BLOQ)).rejects.toMatchObject({ status: 404 });
    await expect(service.findById('nao-e-uuid')).rejects.toMatchObject({ status: 404 });
  });

  describe('escopo restrito (issue #153)', () => {
    it('não cria, não altera e não cancela', async () => {
      const { service } = setup({ escopo: [PROF_A] });
      await expect(service.create(ENTRADA)).rejects.toMatchObject({ status: 403 });
      await expect(service.update(BLOQ, ENTRADA)).rejects.toMatchObject({ status: 403 });
      await expect(service.cancelar(BLOQ, { motivo: 'x' })).rejects.toMatchObject({ status: 403 });
    });

    it('bloqueio de outro profissional vem oculto', async () => {
      const { service } = setup({
        escopo: [PROF_A],
        existentes: [
          registro({ profissionalId: PROF_B, profissional: { nome: 'Dr. B' }, tipo: 'RESERVA' }),
        ],
      });
      const pagina = await service.list(consulta());
      expect(pagina.data[0]).toMatchObject({
        oculto: true,
        profissionalId: null,
        profissionalNome: null,
        motivo: null,
        criadoPorNome: null,
        tipo: 'RESERVA',
      });
    });

    it('o do seu profissional e o sem profissional vêm completos', async () => {
      const { service } = setup({
        escopo: [PROF_A],
        existentes: [
          registro({ profissionalId: PROF_A, profissional: { nome: 'Dra. A' } }),
          registro({ id: OUTRO }),
        ],
      });
      const pagina = await service.list(consulta());
      expect(pagina.data.map((b) => b.oculto)).toEqual([false, false]);
      expect(pagina.data[0]?.profissionalNome).toBe('Dra. A');
    });

    it('detalhe de sala fora do escopo: 403', async () => {
      const { service, tx } = setup({ escopo: [PROF_A] });
      tx.contratoSala.findMany.mockResolvedValue([]);
      await expect(service.findById(BLOQ)).rejects.toMatchObject({ status: 403 });
    });
  });

  it('filtro de status vira o filtro de cancelamento', async () => {
    const { service, tx } = setup();
    await service.list(consulta({ status: 'ATIVO' }));
    await service.list(consulta({ status: 'CANCELADO', de: '2026-12-01', ate: '2026-12-31' }));
    const wheres = tx.salaBloqueio.findMany.mock.calls.map((c) => c[0].where);
    expect(wheres[0]).toMatchObject({ canceladoEm: null });
    expect(wheres[1]).toMatchObject({
      canceladoEm: { not: null },
      dataInicio: { lte: new Date('2026-12-31T00:00:00.000Z') },
      dataFim: { gte: new Date('2026-12-01T00:00:00.000Z') },
    });
  });

  it('sobrepostosAoHorario: só os que cruzam o horário pedido (#136)', async () => {
    const { service } = setup({ existentes: [registro()] });
    await expect(
      service.sobrepostosAoHorario(SALA, '2026-12-10', '11:30', '12:30'),
    ).resolves.toHaveLength(1);
    await expect(
      service.sobrepostosAoHorario(SALA, '2026-12-10', '12:00', '13:00'),
    ).resolves.toHaveLength(0);
  });

  it('descreverPeriodoBloqueio', () => {
    expect(descreverPeriodoBloqueio({ dataInicio: '2026-12-10', dataFim: '2026-12-10' })).toBe(
      '10/12/2026',
    );
    expect(descreverPeriodoBloqueio({ dataInicio: '2026-12-10', dataFim: '2026-12-12' })).toBe(
      '10/12/2026 a 12/12/2026',
    );
  });
});
