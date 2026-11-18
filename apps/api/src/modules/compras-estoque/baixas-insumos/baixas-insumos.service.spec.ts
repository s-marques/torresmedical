import type { TransactionHost } from '@nestjs-cls/transactional';
import type { BaixaInsumoInput, ListBaixasInsumosQuery } from '@torres/shared';
import { Prisma } from '../../../generated/prisma/client';
import type { RequestContextService } from '../../../common/context/request-context.service';
import { BusinessException } from '../../../common/errors/api.exception';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import type { PacientesService } from '../../comercial-atendimento/pacientes/pacientes.service';
import type { UnidadesService } from '../../configuracoes-gestao/unidades/unidades.service';
import type { UsuariosLookupService } from '../../configuracoes-gestao/usuarios/usuarios.service';
import type { ProfissionaisService } from '../../gestao-profissionais/profissionais/profissionais.service';
import type { EstoqueService } from '../estoque/estoque.service';
import { BaixasInsumosService } from './baixas-insumos.service';

const USUARIO_ID = '7b1d9c2e-3f4a-4b5c-8d6e-1a2b3c4d5e6f';
const PRODUTO_A = '2d9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const PRODUTO_B = '3e0d2a8f-2b3c-4d4e-9fa0-1b2c3d4e5f60';
const PACIENTE_ID = '4f1e3b90-3c4d-4e5f-a0b1-2c3d4e5f6071';
const AGORA = new Date('2026-11-17T12:00:00.000Z');

function input(extra: Partial<BaixaInsumoInput> = {}): BaixaInsumoInput {
  return {
    pacienteId: null,
    profissionalId: null,
    unidadeId: null,
    pressaoArterial: null,
    dextro: null,
    observacao: null,
    itens: [
      { produtoId: PRODUTO_A, quantidade: 2 },
      { produtoId: PRODUTO_B, quantidade: 1 },
    ],
    ...extra,
  };
}

function baixa(data: Record<string, unknown>) {
  return {
    id: 'b1',
    pacienteId: null,
    profissionalId: null,
    unidadeId: null,
    pressaoArterial: null,
    dextro: null,
    observacao: null,
    usuarioId: USUARIO_ID,
    createdAt: AGORA,
    paciente: null,
    profissional: null,
    unidade: null,
    itens: [{ produtoId: PRODUTO_A, quantidade: new Prisma.Decimal(2), produto: { nome: 'Luva' } }],
    ...data,
  };
}

function setup() {
  const tx = {
    baixaInsumo: {
      create: jest
        .fn()
        .mockImplementation(({ data }) => Promise.resolve(baixa({ usuarioId: data.usuarioId }))),
      findMany: jest.fn().mockResolvedValue([baixa({})]),
      count: jest.fn().mockResolvedValue(1),
    },
  };
  const contexto = { getUserId: jest.fn().mockReturnValue(USUARIO_ID) };
  const estoque = { saidaComMotivo: jest.fn().mockResolvedValue({}) };
  const pacientes = {
    nomesPorIds: jest.fn().mockResolvedValue(new Map([[PACIENTE_ID, 'Fulana']])),
  };
  const profissionais = { nomesPorIds: jest.fn().mockResolvedValue(new Map()) };
  const unidades = { findById: jest.fn().mockResolvedValue({}) };
  const usuarios = {
    nomesPorIds: jest.fn().mockResolvedValue(new Map([[USUARIO_ID, 'Beltrano']])),
  };
  const service = new BaixasInsumosService(
    { tx } as unknown as TransactionHost<PrismaAdapter>,
    contexto as unknown as RequestContextService,
    estoque as unknown as EstoqueService,
    pacientes as unknown as PacientesService,
    profissionais as unknown as ProfissionaisService,
    unidades as unknown as UnidadesService,
    usuarios as unknown as UsuariosLookupService,
  );
  return { service, tx, estoque, pacientes, profissionais, unidades };
}

const QUERY = (extra: Partial<ListBaixasInsumosQuery> = {}): ListBaixasInsumosQuery => ({
  page: 1,
  pageSize: 10,
  sort: { field: 'data', direction: 'desc' },
  search: undefined,
  ...extra,
});

describe('BaixasInsumosService', () => {
  describe('create', () => {
    it('baixa o saldo de cada insumo e grava a baixa com o responsável do contexto', async () => {
      const { service, tx, estoque } = setup();

      const dto = await service.create(input());

      expect(estoque.saidaComMotivo).toHaveBeenNthCalledWith(1, PRODUTO_A, 2, 'Baixa de Insumos');
      expect(estoque.saidaComMotivo).toHaveBeenNthCalledWith(2, PRODUTO_B, 1, 'Baixa de Insumos');
      expect(tx.baixaInsumo.create.mock.calls[0][0].data).toMatchObject({ usuarioId: USUARIO_ID });
      expect(dto).toMatchObject({
        responsavelId: USUARIO_ID,
        responsavelNome: 'Beltrano',
        itens: [{ produtoId: PRODUTO_A, produtoNome: 'Luva', quantidade: '2' }],
      });
    });

    it('não grava a baixa quando um insumo falha (ex.: saldo insuficiente)', async () => {
      const { service, tx, estoque } = setup();
      estoque.saidaComMotivo
        .mockResolvedValueOnce({})
        .mockRejectedValueOnce(new BusinessException('ESTOQUE_INSUFICIENTE', 'sem saldo'));

      await expect(service.create(input())).rejects.toMatchObject({ code: 'ESTOQUE_INSUFICIENTE' });
      expect(tx.baixaInsumo.create).not.toHaveBeenCalled();
    });

    it('404 para paciente, profissional ou unidade que não existem', async () => {
      const { service, pacientes, unidades } = setup();
      pacientes.nomesPorIds.mockResolvedValueOnce(new Map());
      await expect(service.create(input({ pacienteId: PACIENTE_ID }))).rejects.toMatchObject({
        status: 404,
      });
      await expect(service.create(input({ profissionalId: PACIENTE_ID }))).rejects.toMatchObject({
        status: 404,
      });
      unidades.findById.mockRejectedValueOnce(
        new BusinessException('NOT_FOUND', 'x', { status: 404 }),
      );
      await expect(service.create(input({ unidadeId: PACIENTE_ID }))).rejects.toMatchObject({
        status: 404,
      });
    });

    it('não consulta paciente, profissional e unidade quando não informados', async () => {
      const { service, pacientes, profissionais, unidades } = setup();
      await service.create(input());
      expect(pacientes.nomesPorIds).not.toHaveBeenCalled();
      expect(profissionais.nomesPorIds).not.toHaveBeenCalled();
      expect(unidades.findById).not.toHaveBeenCalled();
    });
  });

  describe('list', () => {
    it('sem período, não filtra pela data', async () => {
      const { service, tx } = setup();
      await service.list(QUERY());
      expect(tx.baixaInsumo.findMany.mock.calls[0][0].where).toEqual({});
    });

    it('filtra Data Início e Data Fim como dias inteiros (fuso da clínica)', async () => {
      const { service, tx } = setup();
      await service.list(QUERY({ dataInicio: '2026-11-01', dataFim: '2026-11-30' }));
      const { createdAt } = tx.baixaInsumo.findMany.mock.calls[0][0].where;
      expect(createdAt.gte.toISOString()).toBe('2026-11-01T03:00:00.000Z');
      expect(createdAt.lt.toISOString()).toBe('2026-12-01T03:00:00.000Z');
    });

    it('só Data Início não limita o fim', async () => {
      const { service, tx } = setup();
      await service.list(QUERY({ dataInicio: '2026-11-01' }));
      expect(tx.baixaInsumo.findMany.mock.calls[0][0].where.createdAt).toEqual({
        gte: expect.any(Date),
      });
    });

    it('ordena pelo campo pedido e desempata pela data e pelo id', async () => {
      const { service, tx } = setup();
      await service.list(QUERY({ sort: { field: 'paciente', direction: 'asc' } }));
      expect(tx.baixaInsumo.findMany.mock.calls[0][0].orderBy).toEqual([
        { paciente: { nome: 'asc' } },
        { createdAt: 'desc' },
        { id: 'asc' },
      ]);
    });
  });
});
