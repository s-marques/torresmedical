import type { TransactionHost } from '@nestjs-cls/transactional';
import type { CreateFormaPagamentoInput } from '@torres/shared';
import { CONSULTA_LOOKUP } from '../../../../test/utils/tx-host-falso';
import type { ExportService } from '../../../common/export/export.service';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import {
  FORMA_PAGAMENTO_EXPORT_DEFINITIONS,
  FormasPagamentoService,
} from './formas-pagamento.service';

const ID = '0b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const FORMA = {
  id: ID,
  nome: 'Boleto',
  finalidade: 'PAGAR',
  tipo: 'BOLETO',
  prazoRecebimentoDias: 2,
  maxParcelas: 3,
  movimentaContaBancaria: true,
  ativo: true,
  deletedAt: null,
};

function setup() {
  const formaPagamento = {
    findMany: jest.fn().mockResolvedValue([FORMA]),
    findFirst: jest.fn().mockResolvedValue(FORMA),
    count: jest.fn().mockResolvedValue(1),
    create: jest.fn().mockResolvedValue(FORMA),
    update: jest.fn().mockResolvedValue(FORMA),
  };
  const txHost = { tx: { formaPagamento } } as unknown as TransactionHost<PrismaAdapter>;
  const exportService = {
    ensureWithinLimit: jest.fn(),
    export: jest.fn().mockResolvedValue({ filename: 'formas-pagamento.xlsx' }),
  };
  const service = new FormasPagamentoService(txHost, exportService as unknown as ExportService);
  return { service, formaPagamento, exportService };
}

describe('FormasPagamentoService', () => {
  it('lookup: ativas, filtro por finalidade, descrição com a finalidade', async () => {
    const { service, formaPagamento } = setup();

    const page = await service.lookup({ ...CONSULTA_LOOKUP, finalidade: 'pagar' });

    expect(formaPagamento.count).toHaveBeenCalledWith({
      where: { deletedAt: null, ativo: true, finalidade: 'PAGAR' },
    });
    expect(page.data[0]).toEqual({ id: ID, label: 'Boleto', descricao: 'Pagar' });
  });

  it('lookup sem finalidade não filtra; 404 quando não existe', async () => {
    const { service, formaPagamento } = setup();

    await service.lookup(CONSULTA_LOOKUP);
    expect(formaPagamento.count.mock.calls[0][0].where.finalidade).toBeUndefined();

    formaPagamento.findFirst.mockResolvedValue(null);
    await expect(service.findById(ID)).rejects.toMatchObject({
      message: 'Forma de pagamento não encontrada',
    });
  });

  describe('list', () => {
    it('filtra excluídas, status, finalidade, tipo e busca; ordena e pagina', async () => {
      const { service, formaPagamento } = setup();

      const page = await service.list({
        page: 2,
        pageSize: 5,
        sort: { field: 'prazoRecebimentoDias', direction: 'desc' },
        search: 'bol',
        status: 'inativo',
        finalidade: 'receber',
        tipo: 'cartao_credito',
      });

      const where = {
        deletedAt: null,
        ativo: false,
        finalidade: 'RECEBER',
        tipo: 'CARTAO_CREDITO',
        OR: [{ nome: { contains: 'bol', mode: 'insensitive' } }],
      };
      expect(formaPagamento.findMany).toHaveBeenCalledWith({
        where,
        orderBy: [{ prazoRecebimentoDias: 'desc' }, { id: 'desc' }],
        skip: 5,
        take: 5,
      });
      expect(formaPagamento.count).toHaveBeenCalledWith({ where });
      expect(page.meta).toEqual({ page: 2, pageSize: 5, total: 1, totalPages: 1 });
    });

    it('sem filtros só exclui as removidas', async () => {
      const { service, formaPagamento } = setup();

      await service.list({
        page: 1,
        pageSize: 10,
        sort: { field: 'nome', direction: 'asc' },
        search: undefined,
      });

      expect(formaPagamento.count).toHaveBeenCalledWith({ where: { deletedAt: null } });
    });
  });

  describe('create / update / remove', () => {
    const INPUT: CreateFormaPagamentoInput = {
      nome: 'Pix',
      finalidade: 'receber',
      tipo: 'pix',
      prazoRecebimentoDias: 0,
      maxParcelas: 1,
      movimentaContaBancaria: true,
    };

    it('create grava finalidade e tipo como enum do banco', async () => {
      const { service, formaPagamento } = setup();

      await service.create(INPUT);

      expect(formaPagamento.create).toHaveBeenCalledWith({
        data: { ...INPUT, finalidade: 'RECEBER', tipo: 'PIX' },
      });
    });

    it('update altera só o que veio, inclusive o ativo (Ativar/Desativar)', async () => {
      const { service, formaPagamento } = setup();

      await service.update(ID, { ativo: false });
      await service.update(ID, { tipo: 'permuta', movimentaContaBancaria: false });

      expect(formaPagamento.update).toHaveBeenNthCalledWith(1, {
        where: { id: ID },
        data: { ativo: false, finalidade: undefined, tipo: undefined },
      });
      expect(formaPagamento.update).toHaveBeenNthCalledWith(2, {
        where: { id: ID },
        data: { tipo: 'PERMUTA', movimentaContaBancaria: false, finalidade: undefined },
      });
    });

    it('update e remove dão 404 quando não existe', async () => {
      const { service, formaPagamento } = setup();
      formaPagamento.findFirst.mockResolvedValue(null);

      await expect(service.update(ID, { ativo: true })).rejects.toMatchObject({
        message: 'Forma de pagamento não encontrada',
      });
      await expect(service.remove(ID)).rejects.toMatchObject({
        message: 'Forma de pagamento não encontrada',
      });
      expect(formaPagamento.update).not.toHaveBeenCalled();
    });

    it('remove é exclusão lógica', async () => {
      const { service, formaPagamento } = setup();

      await service.remove(ID);

      expect(formaPagamento.update).toHaveBeenCalledWith({
        where: { id: ID },
        data: { deletedAt: expect.any(Date) },
      });
    });
  });

  describe('export', () => {
    it('usa o mesmo filtro da listagem e as colunas pedidas', async () => {
      const { service, formaPagamento, exportService } = setup();

      await service.export({
        format: 'xlsx',
        sort: { field: 'nome', direction: 'asc' },
        search: undefined,
        columns: ['nome', 'tipo'],
      } as never);

      expect(exportService.ensureWithinLimit).toHaveBeenCalledWith(1);
      expect(formaPagamento.findMany).toHaveBeenCalledWith({
        where: { deletedAt: null },
        orderBy: [{ nome: 'asc' }, { id: 'asc' }],
      });
      expect(exportService.export).toHaveBeenCalledWith(
        expect.objectContaining({
          format: 'xlsx',
          filename: 'formas-pagamento',
          columns: FORMA_PAGAMENTO_EXPORT_DEFINITIONS.filter((c) =>
            ['nome', 'tipo'].includes(c.key),
          ),
          rows: [FORMA],
        }),
      );
    });

    it('rotula finalidade, tipo e status nas colunas', () => {
      const valor = (key: string) =>
        FORMA_PAGAMENTO_EXPORT_DEFINITIONS.find((c) => c.key === key)?.value(FORMA as never);
      expect(valor('finalidade')).toBe('Pagar');
      expect(valor('tipo')).toBe('Boleto');
      expect(valor('ativo')).toBe('Ativo');
      expect(valor('prazoRecebimentoDias')).toBe(2);
    });
  });
});
