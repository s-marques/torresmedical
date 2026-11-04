import type { TransactionHost } from '@nestjs-cls/transactional';
import type { ExportService } from '../../../common/export/export.service';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import { PLANO_CONTA_EXPORT_DEFINITIONS, PlanoContasService } from './plano-contas.service';

const AGORA = new Date('2026-10-01T12:00:00.000Z');

function conta(id: string, codigo: string, nivel: number, contaPaiId: string | null = null) {
  return {
    id,
    codigo,
    nome: `Conta ${codigo}`,
    tipo: 'DESPESA' as const,
    nivel,
    contaPaiId,
    ativo: true,
    createdAt: AGORA,
    updatedAt: AGORA,
    deletedAt: null,
  };
}

const RAIZ = conta('11111111-1111-4111-8111-111111111111', '6', 1);
const FILHA = conta('22222222-2222-4222-8222-222222222222', '6.1', 2, RAIZ.id);
const NETA = conta('33333333-3333-4333-8333-333333333333', '6.1.01', 3, FILHA.id);
const TODAS = [RAIZ, FILHA, NETA];

function setup() {
  const planoConta = {
    findMany: jest.fn().mockImplementation(({ where }) => {
      if (where?.contaPaiId) return TODAS.filter((c) => c.contaPaiId === where.contaPaiId);
      return [...TODAS].reverse();
    }),
    findFirst: jest.fn().mockImplementation(({ where }) => TODAS.find((c) => c.id === where.id)),
    count: jest.fn().mockResolvedValue(0),
    create: jest
      .fn()
      .mockImplementation(({ data }) => ({ ...conta('x', data.codigo, 1), ...data })),
    update: jest
      .fn()
      .mockImplementation(({ where, data }) => ({
        ...TODAS.find((c) => c.id === where.id),
        ...data,
      })),
  };
  const txHost = { tx: { planoConta } } as unknown as TransactionHost<PrismaAdapter>;
  const exportService = {
    ensureWithinLimit: jest.fn(),
    export: jest.fn().mockResolvedValue({ filename: 'plano-contas.xlsx' }),
  };
  const service = new PlanoContasService(txHost, exportService as unknown as ExportService);
  return { service, planoConta, exportService };
}

describe('PlanoContasService', () => {
  it('lista em ordem natural de código, com o total', async () => {
    const { service, planoConta } = setup();
    const res = await service.list({ tipo: 'despesa', search: 'abc' });
    expect(res.data.map((c) => c.codigo)).toEqual(['6', '6.1', '6.1.01']);
    expect(res.total).toBe(3);
    expect(planoConta.findMany).toHaveBeenCalledWith({
      where: {
        deletedAt: null,
        tipo: 'DESPESA',
        OR: [
          { codigo: { contains: 'abc', mode: 'insensitive' } },
          { nome: { contains: 'abc', mode: 'insensitive' } },
        ],
      },
    });
  });

  it('cria conta raiz no nível 1', async () => {
    const { service, planoConta } = setup();
    await service.create({ codigo: '7', tipo: 'receita', nome: 'Receitas', contaPaiId: null });
    expect(planoConta.create).toHaveBeenCalledWith({
      data: { codigo: '7', nome: 'Receitas', tipo: 'RECEITA', contaPaiId: null, nivel: 1 },
    });
  });

  it('cria subconta no nível do pai + 1', async () => {
    const { service, planoConta } = setup();
    await service.create({ codigo: '6.2', tipo: 'despesa', nome: 'X', contaPaiId: RAIZ.id });
    expect(planoConta.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ contaPaiId: RAIZ.id, nivel: 2 }),
    });
  });

  it('rejeita pai inexistente com 404', async () => {
    const { service } = setup();
    await expect(
      service.create({
        codigo: '9',
        tipo: 'ativo',
        nome: 'X',
        contaPaiId: '99999999-9999-4999-8999-999999999999',
      }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('o interruptor altera só o campo ativo', async () => {
    const { service, planoConta } = setup();
    const res = await service.update(RAIZ.id, { ativo: false });
    expect(res.ativo).toBe(false);
    expect(planoConta.update).toHaveBeenCalledTimes(1);
    expect(planoConta.update).toHaveBeenCalledWith({
      where: { id: RAIZ.id },
      data: { ativo: false, tipo: undefined },
    });
  });

  it('não deixa a conta virar filha de si mesma ou de uma descendente', async () => {
    const { service } = setup();
    await expect(service.update(RAIZ.id, { contaPaiId: RAIZ.id })).rejects.toMatchObject({
      status: 422,
    });
    await expect(service.update(RAIZ.id, { contaPaiId: NETA.id })).rejects.toMatchObject({
      status: 422,
    });
  });

  it('ao mover a conta, recalcula o nível das descendentes', async () => {
    const { service, planoConta } = setup();
    await service.update(FILHA.id, { contaPaiId: null });
    expect(planoConta.update).toHaveBeenCalledWith({
      where: { id: NETA.id },
      data: { nivel: 2 },
    });
  });

  it('exclui logicamente e libera o código', async () => {
    const { service, planoConta } = setup();
    await service.remove(NETA.id);
    expect(planoConta.update).toHaveBeenCalledWith({
      where: { id: NETA.id },
      data: { deletedAt: expect.any(Date), codigo: '6.1.01#excluida-33333333' },
    });
  });

  it('bloqueia a exclusão de conta com subcontas', async () => {
    const { service, planoConta } = setup();
    planoConta.count.mockResolvedValue(2);
    await expect(service.remove(RAIZ.id)).rejects.toMatchObject({ status: 422 });
    expect(planoConta.update).not.toHaveBeenCalled();
  });

  it('exporta com os mesmos filtros e valida o limite', async () => {
    const { service, exportService } = setup();
    await service.export({
      format: 'pdf',
      columns: ['codigo', 'nome'],
      tipo: undefined,
      search: undefined,
    });
    expect(exportService.ensureWithinLimit).toHaveBeenCalledWith(3);
    expect(exportService.export).toHaveBeenCalledWith(
      expect.objectContaining({ format: 'pdf', filename: 'plano-contas' }),
    );
  });

  it('rótulos de exportação', () => {
    const [codigo, , tipo, , ativo] = PLANO_CONTA_EXPORT_DEFINITIONS;
    expect(codigo?.value(RAIZ)).toBe('6');
    expect(tipo?.value(RAIZ)).toBe('Despesa');
    expect(ativo?.value(RAIZ)).toBe('Sim');
  });
});
