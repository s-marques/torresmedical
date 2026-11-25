import type { TransactionHost } from '@nestjs-cls/transactional';
import { auditLogQuerySchema, exportAuditLogQuerySchema } from '@torres/shared';
import type { RequestContextService } from '../context/request-context.service';
import type { ExportService } from '../export/export.service';
import type { PrismaAdapter } from '../prisma/prisma-transaction';
import { AUDIT_EXPORT_DEFINITIONS, AuditConsultaService } from './audit-consulta.service';

const USUARIO_ID = '7a1d3c52-8d0f-4b8e-9f4c-2b2f3c4d5e6f';

function registro(parcial: Record<string, unknown> = {}) {
  return {
    id: 'a-1',
    userId: USUARIO_ID,
    occurredAt: new Date('2026-10-14T12:00:00.000Z'),
    action: 'UPDATE',
    entity: 'ContratoSala',
    entityId: 'c-1',
    before: { valorUnitario: '100', status: 'ATIVO', updatedAt: 'a' },
    after: { valorUnitario: '150', status: 'ATIVO', updatedAt: 'b' },
    requestId: 'req-1',
    ip: '10.0.0.1',
    ...parcial,
  };
}

function setup(verProntuario = false) {
  const auditLog = {
    findMany: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
  };
  const usuario = {
    findMany: jest.fn().mockResolvedValue([{ id: USUARIO_ID, nome: 'Maria Teste' }]),
  };
  const exportService = {
    ensureWithinLimit: jest.fn(),
    export: jest.fn().mockResolvedValue({ buffer: Buffer.from('x') }),
  };
  const txHost = { tx: { auditLog, usuario } } as unknown as TransactionHost<PrismaAdapter>;
  const context = { getVerProntuario: () => verProntuario } as RequestContextService;
  const service = new AuditConsultaService(
    txHost,
    context,
    exportService as unknown as ExportService,
  );
  return { service, auditLog, usuario, exportService };
}

const consulta = (query: Record<string, unknown> = {}) => auditLogQuerySchema.parse(query);

describe('AuditConsultaService.findMany', () => {
  it('pagina, ordena e devolve usuário, campos alterados e meta', async () => {
    const { service, auditLog } = setup();
    auditLog.findMany.mockResolvedValue([registro()]);
    auditLog.count.mockResolvedValue(21);

    const page = await service.findMany(consulta({ page: 3, pageSize: 10 }));

    expect(auditLog.findMany).toHaveBeenCalledWith({
      where: {},
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      skip: 20,
      take: 10,
    });
    expect(page.meta).toEqual({ page: 3, pageSize: 10, total: 21, totalPages: 3 });
    expect(page.data[0]).toMatchObject({
      userNome: 'Maria Teste',
      occurredAt: '2026-10-14T12:00:00.000Z',
      campos: ['valorUnitario'],
      restrito: false,
      after: { valorUnitario: '150', status: 'ATIVO', updatedAt: 'b' },
    });
  });

  it('combina filtros com E e converte o dia inteiro do período no fuso da clínica', async () => {
    const { service, auditLog } = setup();

    await service.findMany(
      consulta({
        entity: 'ContaReceber',
        entityId: 'x-1',
        userId: USUARIO_ID,
        action: 'DELETE',
        de: '2026-10-01',
        ate: '2026-10-02',
      }),
    );

    const { where } = auditLog.findMany.mock.calls[0][0];
    expect(where.AND).toEqual(
      expect.arrayContaining([
        { entity: 'ContaReceber' },
        { entityId: 'x-1' },
        { userId: USUARIO_ID },
        { action: 'DELETE' },
        {
          occurredAt: {
            gte: new Date('2026-10-01T03:00:00.000Z'),
            lte: new Date('2026-10-03T02:59:59.999Z'),
          },
        },
      ]),
    );
  });

  it('busca no nome da entidade e no id do registro', async () => {
    const { service, auditLog } = setup();

    await service.findMany(consulta({ search: 'abc' }));

    expect(auditLog.findMany.mock.calls[0][0].where.AND).toEqual([
      {
        OR: [
          { entity: { contains: 'abc', mode: 'insensitive' } },
          { entityId: { contains: 'abc', mode: 'insensitive' } },
        ],
      },
    ]);
  });

  it.each([
    ['exclusoes', [{ action: 'DELETE' }]],
    ['contrato', [{ entity: { in: ['ContratoSala', 'ContratoSalaHora'] } }]],
    [
      'cancelamentos',
      [
        { action: 'UPDATE' },
        {
          OR: [
            { after: { path: ['status'], equals: 'CANCELADO' } },
            { after: { path: ['status'], equals: 'CANCELADA' } },
          ],
        },
      ],
    ],
  ])('atalho %s vira filtro de ação, entidades ou status final', async (grupo, esperado) => {
    const { service, auditLog } = setup();

    await service.findMany(consulta({ grupo }));

    expect(auditLog.findMany.mock.calls[0][0].where.AND).toEqual(esperado);
  });

  it('não consulta usuários para system, anonymous ou ids que não são uuid', async () => {
    const { service, auditLog, usuario } = setup();
    auditLog.findMany.mockResolvedValue([registro({ userId: 'system' })]);

    const page = await service.findMany(consulta());

    expect(usuario.findMany).not.toHaveBeenCalled();
    expect(page.data[0]?.userNome).toBeNull();
  });

  describe('conteúdo clínico', () => {
    const clinico = registro({
      entity: 'Atendimento',
      before: { queixa: 'dor' },
      after: { queixa: 'dor forte', conduta: 'repouso' },
    });

    it('sem a permissão de prontuário omite antes/depois e mantém os nomes dos campos', async () => {
      const { service, auditLog } = setup(false);
      auditLog.findMany.mockResolvedValue([clinico, registro()]);

      const [atendimento, contrato] = (await service.findMany(consulta())).data;

      expect(atendimento).toMatchObject({
        restrito: true,
        before: null,
        after: null,
        campos: ['queixa', 'conduta'],
        userNome: 'Maria Teste',
      });
      expect(contrato).toMatchObject({ restrito: false });
      expect(contrato?.after).not.toBeNull();
    });

    it('com a permissão de prontuário devolve o conteúdo', async () => {
      const { service, auditLog } = setup(true);
      auditLog.findMany.mockResolvedValue([clinico]);

      const [atendimento] = (await service.findMany(consulta())).data;

      expect(atendimento).toMatchObject({
        restrito: false,
        after: { queixa: 'dor forte', conduta: 'repouso' },
      });
    });
  });
});

describe('AuditConsultaService.entidades', () => {
  it('devolve só os nomes, em ordem', async () => {
    const { service, auditLog } = setup();
    (auditLog as Record<string, unknown>).groupBy = jest
      .fn()
      .mockResolvedValue([{ entity: 'Agendamento' }, { entity: 'Sala' }]);

    expect(await service.entidades()).toEqual({ data: ['Agendamento', 'Sala'] });
  });
});

describe('AuditConsultaService.export', () => {
  it('confere o limite, usa os filtros e exporta só as colunas pedidas, sem antes/depois', async () => {
    const { service, auditLog, exportService } = setup();
    auditLog.count.mockResolvedValue(5);
    auditLog.findMany.mockResolvedValue([registro()]);

    await service.export(
      exportAuditLogQuerySchema.parse({ format: 'pdf', columns: 'data,campos', grupo: 'contrato' }),
    );

    expect(exportService.ensureWithinLimit).toHaveBeenCalledWith(5);
    const pedido = exportService.export.mock.calls[0][0];
    expect(pedido).toMatchObject({ format: 'pdf', title: 'Auditoria', filename: 'auditoria' });
    expect(pedido.columns.map((c: { key: string }) => c.key)).toEqual(['data', 'campos']);
    expect(pedido.rows).toHaveLength(1);
  });

  it('as colunas mostram o nome do usuário, a ação em português e os campos', () => {
    const item = {
      ...registro(),
      occurredAt: '2026-10-14T12:00:00.000Z',
      userNome: 'Maria Teste',
      campos: ['valorUnitario', 'status'],
    } as never;
    const valor = (key: string) => AUDIT_EXPORT_DEFINITIONS.find((c) => c.key === key)?.value(item);

    expect(valor('usuario')).toBe('Maria Teste');
    expect(valor('acao')).toBe('Alteração');
    expect(valor('campos')).toBe('valorUnitario, status');
    expect(valor('registro')).toBe('c-1');
  });
});
