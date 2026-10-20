import type { TransactionHost } from '@nestjs-cls/transactional';
import type { AuditService } from '../../../common/audit/audit.service';
import { BusinessException } from '../../../common/errors/api.exception';
import type { ExportService } from '../../../common/export/export.service';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import {
  ORIGEM_CLIENTE_EXPORT_DEFINITIONS,
  OrigensClienteService,
} from './origens-cliente.service';

const ID = '0b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const OUTRO_ID = '7a1d3c52-8d0f-4b8e-9f4c-2b2f3c4d5e6f';
const ORIGEM = {
  id: ID,
  nome: 'Indicação',
  codigo: 'indicacao',
  ordem: 2,
  ativa: true,
  createdAt: new Date('2026-10-14T12:00:00.000Z'),
  updatedAt: new Date('2026-10-14T12:00:00.000Z'),
  deletedAt: null,
};
const VIZINHA = { ...ORIGEM, id: OUTRO_ID, nome: 'Google', codigo: 'google', ordem: 3 };

function setup() {
  const origemCliente = {
    findMany: jest.fn().mockResolvedValue([ORIGEM]),
    findFirst: jest.fn().mockResolvedValue(ORIGEM),
    count: jest.fn().mockResolvedValue(1),
    aggregate: jest.fn().mockResolvedValue({ _max: { ordem: 5 } }),
    create: jest.fn().mockResolvedValue(ORIGEM),
    update: jest.fn().mockResolvedValue(ORIGEM),
  };
  const paciente = { count: jest.fn().mockResolvedValue(0) };
  const txHost = { tx: { origemCliente, paciente } } as unknown as TransactionHost<PrismaAdapter>;
  const exportService = {
    ensureWithinLimit: jest.fn(),
    export: jest.fn().mockResolvedValue({ filename: 'origens-cliente.xlsx' }),
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const service = new OrigensClienteService(
    txHost,
    exportService as unknown as ExportService,
    audit as unknown as AuditService,
  );
  return { service, origemCliente, paciente, exportService, audit };
}

const SORT = { field: 'ordem', direction: 'asc' } as const;

describe('OrigensClienteService', () => {
  describe('lookup (combobox de origem)', () => {
    it('só origens ativas e não excluídas, com busca por nome', async () => {
      const { service, origemCliente } = setup();

      const page = await service.lookup({
        page: 1,
        pageSize: 10,
        sort: { field: 'nome', direction: 'asc' },
        search: 'indic',
      });

      expect(origemCliente.count).toHaveBeenCalledWith({
        where: {
          deletedAt: null,
          ativa: true,
          OR: [{ nome: { contains: 'indic', mode: 'insensitive' } }],
        },
      });
      expect(page.data).toEqual([{ id: ID, label: 'Indicação', descricao: null }]);
    });
  });

  describe('list', () => {
    it('filtra excluídas, status e busca (nome e código); ordena e pagina', async () => {
      const { service, origemCliente } = setup();

      const page = await service.list({
        page: 2,
        pageSize: 5,
        sort: { field: 'nome', direction: 'desc' },
        search: 'goo',
        status: 'inativo',
      });

      const where = {
        deletedAt: null,
        ativa: false,
        OR: [
          { nome: { contains: 'goo', mode: 'insensitive' } },
          { codigo: { contains: 'goo', mode: 'insensitive' } },
        ],
      };
      expect(origemCliente.findMany).toHaveBeenCalledWith({
        where,
        orderBy: [{ nome: 'desc' }, { id: 'desc' }],
        skip: 5,
        take: 5,
      });
      expect(origemCliente.count).toHaveBeenCalledWith({ where });
      expect(page.meta).toEqual({ page: 2, pageSize: 5, total: 1, totalPages: 1 });
    });
  });

  describe('findById', () => {
    it('404 para id inválido ou inexistente', async () => {
      const { service, origemCliente } = setup();
      origemCliente.findFirst.mockResolvedValue(null);

      await expect(service.findById('abc')).rejects.toMatchObject({ status: 404 });
      await expect(service.findById(ID)).rejects.toMatchObject({
        status: 404,
        code: 'NOT_FOUND',
      });
    });
  });

  describe('create', () => {
    it('gera o código do nome e coloca a origem no fim da lista', async () => {
      const { service, origemCliente } = setup();
      origemCliente.findFirst.mockResolvedValue(null);

      await service.create({ nome: 'Evento Finanças 03/10' });

      expect(origemCliente.create).toHaveBeenCalledWith({
        data: { nome: 'Evento Finanças 03/10', codigo: 'evento_financas_03_10', ordem: 6 },
      });
    });

    it('a primeira origem recebe ordem 1', async () => {
      const { service, origemCliente } = setup();
      origemCliente.findFirst.mockResolvedValue(null);
      origemCliente.aggregate.mockResolvedValue({ _max: { ordem: null } });

      await service.create({ nome: 'Google' });

      expect(origemCliente.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ ordem: 1 }),
      });
    });

    it('409 se já existe o nome (sem diferenciar maiúsculas) ou o código', async () => {
      const { service, origemCliente } = setup();

      await expect(service.create({ nome: 'teste' })).rejects.toMatchObject({
        status: 409,
        code: 'ORIGEM_CLIENTE_DUPLICADA',
        message: "Já existe uma origem chamada 'teste'.",
      });
      expect(origemCliente.findFirst).toHaveBeenCalledWith({
        where: {
          deletedAt: null,
          id: undefined,
          OR: [{ nome: { equals: 'teste', mode: 'insensitive' } }, { codigo: 'teste' }],
        },
        select: { id: true },
      });
      expect(origemCliente.create).not.toHaveBeenCalled();
    });

    it('400 para nome que não gera código', async () => {
      const { service, origemCliente } = setup();

      await expect(service.create({ nome: '***' })).rejects.toMatchObject({
        status: 400,
        code: 'ORIGEM_CLIENTE_NOME_INVALIDO',
      });
      expect(origemCliente.create).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('renomeia sem mudar o código e ignora a própria origem na checagem de duplicidade', async () => {
      const { service, origemCliente } = setup();
      origemCliente.findFirst.mockResolvedValueOnce(ORIGEM).mockResolvedValueOnce(null);

      await service.update(ID, { nome: 'Indicação de paciente' });

      expect(origemCliente.findFirst).toHaveBeenLastCalledWith({
        where: {
          deletedAt: null,
          id: { not: ID },
          OR: [{ nome: { equals: 'Indicação de paciente', mode: 'insensitive' } }],
        },
        select: { id: true },
      });
      expect(origemCliente.update).toHaveBeenCalledWith({
        where: { id: ID },
        data: { nome: 'Indicação de paciente' },
      });
    });

    it('409 para o nome de outra origem', async () => {
      const { service, origemCliente } = setup();

      await expect(service.update(ID, { nome: 'Google' })).rejects.toBeInstanceOf(
        BusinessException,
      );
      expect(origemCliente.update).not.toHaveBeenCalled();
    });
  });

  describe('alterarAtiva', () => {
    it('grava o novo valor', async () => {
      const { service, origemCliente } = setup();

      await service.alterarAtiva(ID, false);

      expect(origemCliente.update).toHaveBeenCalledWith({
        where: { id: ID },
        data: { ativa: false },
      });
    });
  });

  describe('mover', () => {
    const lista = [{ ...ORIGEM, id: 'x', ordem: 1 }, ORIGEM, VIZINHA];

    it('para baixo: troca a ordem com a vizinha e audita a vizinha', async () => {
      const { service, origemCliente, audit } = setup();
      origemCliente.findMany.mockResolvedValue(lista);
      origemCliente.update
        .mockResolvedValueOnce({ ...ORIGEM, ordem: 3 })
        .mockResolvedValueOnce({ ...VIZINHA, ordem: 2 });

      const movida = await service.mover(ID, { direcao: 'baixo' });

      expect(origemCliente.update).toHaveBeenNthCalledWith(1, {
        where: { id: ID },
        data: { ordem: 3 },
      });
      expect(origemCliente.update).toHaveBeenNthCalledWith(2, {
        where: { id: OUTRO_ID },
        data: { ordem: 2 },
      });
      expect(audit.record).toHaveBeenCalledWith({
        action: 'UPDATE',
        entity: 'OrigemCliente',
        entityId: OUTRO_ID,
        before: VIZINHA,
        after: { ...VIZINHA, ordem: 2 },
      });
      expect(movida.ordem).toBe(3);
    });

    it('na ponta da lista não altera nada', async () => {
      const { service, origemCliente, audit } = setup();
      origemCliente.findMany.mockResolvedValue([ORIGEM, VIZINHA]);

      const resultado = await service.mover(ID, { direcao: 'cima' });

      expect(resultado).toBe(ORIGEM);
      expect(origemCliente.update).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('exclusão lógica quando nenhum cliente usa a origem', async () => {
      const { service, origemCliente, paciente } = setup();

      await service.remove(ID);

      expect(paciente.count).toHaveBeenCalledWith({
        where: { origemClienteId: ID, deletedAt: null },
      });
      expect(origemCliente.update).toHaveBeenCalledWith({
        where: { id: ID },
        data: { deletedAt: expect.any(Date) },
      });
    });

    it('409 ORIGEM_CLIENTE_EM_USO quando há clientes usando', async () => {
      const { service, origemCliente, paciente } = setup();
      paciente.count.mockResolvedValue(3);

      await expect(service.remove(ID)).rejects.toMatchObject({
        status: 409,
        code: 'ORIGEM_CLIENTE_EM_USO',
      });
      expect(origemCliente.update).not.toHaveBeenCalled();
    });
  });

  describe('export', () => {
    it('usa os mesmos filtros da listagem e só as colunas pedidas', async () => {
      const { service, origemCliente, exportService } = setup();

      await service.export({
        format: 'xlsx',
        sort: SORT,
        status: 'ativo',
        search: undefined,
        columns: ['nome', 'ativa'],
      });

      expect(exportService.ensureWithinLimit).toHaveBeenCalledWith(1);
      expect(origemCliente.findMany).toHaveBeenCalledWith({
        where: { deletedAt: null, ativa: true },
        orderBy: [{ ordem: 'asc' }, { id: 'asc' }],
      });
      expect(exportService.export).toHaveBeenCalledWith(
        expect.objectContaining({
          format: 'xlsx',
          title: 'Origens de Cliente',
          filename: 'origens-cliente',
          columns: ORIGEM_CLIENTE_EXPORT_DEFINITIONS.filter((c) =>
            ['nome', 'ativa'].includes(c.key),
          ),
        }),
      );
    });

    it('formata a coluna Ativa como Sim/Não', () => {
      const ativa = ORIGEM_CLIENTE_EXPORT_DEFINITIONS.find((c) => c.key === 'ativa');

      expect(ativa?.value(ORIGEM)).toBe('Sim');
      expect(ativa?.value({ ...ORIGEM, ativa: false })).toBe('Não');
    });
  });
});
