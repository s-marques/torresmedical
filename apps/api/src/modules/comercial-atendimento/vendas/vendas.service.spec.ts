import type { TransactionHost } from '@nestjs-cls/transactional';
import { Prisma } from '../../../generated/prisma/client';
import type { ExportService } from '../../../common/export/export.service';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import type { ProdutosService } from '../../compras-estoque/produtos/produtos.service';
import type { FormasPagamentoService } from '../../financeiro/formas-pagamento/formas-pagamento.service';
import type { ProtocolosService } from '../../gestao-profissionais/protocolos/protocolos.service';
import type { PacientesService } from '../pacientes/pacientes.service';
import { toVenda, VENDA_EXPORT_DEFINITIONS, VendasService } from './vendas.service';

const ID = '0b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const PACIENTE = '1c9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const DATA = new Date('2026-10-01T12:00:00.000Z');

const VENDA = {
  id: ID,
  numero: 7,
  pacienteId: PACIENTE,
  formaPagamentoId: null,
  parcelas: 1,
  desconto: new Prisma.Decimal('0'),
  subtotal: new Prisma.Decimal('200'),
  total: new Prisma.Decimal('200'),
  status: 'FINALIZADA' as const,
  createdAt: DATA,
  updatedAt: DATA,
  deletedAt: null,
  paciente: { nome: 'Cliente Teste' },
  formaPagamento: null,
  itens: [
    {
      id: ID,
      vendaId: ID,
      origem: 'PRODUTO' as const,
      origemId: ID,
      descricao: 'Produto',
      quantidade: 2,
      valorUnitario: new Prisma.Decimal('100'),
      total: new Prisma.Decimal('200'),
      posicao: 0,
    },
  ],
};

const ITEM = {
  origem: 'produto' as const,
  origemId: ID,
  descricao: 'Produto',
  quantidade: 2,
  valorUnitario: 100,
};
const ENTRADA = {
  pacienteId: PACIENTE,
  formaPagamentoId: null,
  parcelas: 1,
  desconto: 0,
  itens: [ITEM],
};

const PAGINA = { meta: { page: 1, pageSize: 10, total: 1, totalPages: 1 } };

function setup() {
  const venda = {
    findMany: jest.fn().mockResolvedValue([VENDA]),
    count: jest.fn().mockResolvedValue(1),
    create: jest.fn().mockResolvedValue(VENDA),
  };
  const txHost = { tx: { venda } } as unknown as TransactionHost<PrismaAdapter>;
  const exportService = {
    ensureWithinLimit: jest.fn(),
    export: jest.fn().mockResolvedValue({ filename: 'vendas-pdv.xlsx' }),
  };
  const pacientes = { findLookupById: jest.fn().mockResolvedValue({}) };
  const formas = { findLookupById: jest.fn().mockResolvedValue({}) };
  const produtos = {
    findById: jest.fn().mockResolvedValue({}),
    vendaveis: jest.fn().mockResolvedValue({
      ...PAGINA,
      data: [{ id: ID, nome: 'Soro', categoria: 'Infusão', precoVenda: 250 }],
    }),
  };
  const protocolos = {
    findById: jest.fn().mockResolvedValue({}),
    list: jest.fn().mockResolvedValue({
      ...PAGINA,
      data: [{ id: ID, nome: 'P1', profissionalNome: null, categoria: 'Geral', valorTotal: 90 }],
    }),
  };
  const service = new VendasService(
    txHost,
    exportService as unknown as ExportService,
    pacientes as unknown as PacientesService,
    formas as unknown as FormasPagamentoService,
    produtos as unknown as ProdutosService,
    protocolos as unknown as ProtocolosService,
  );
  return { service, venda, exportService, pacientes, formas, produtos, protocolos };
}

const consulta = (extra: object = {}) => ({
  page: 1,
  pageSize: 10,
  sort: { field: 'data' as const, direction: 'desc' as const },
  search: undefined,
  status: undefined,
  ...extra,
});

describe('VendasService', () => {
  it('toVenda converte decimais em texto, datas em ISO e origem em minúsculas', () => {
    expect(toVenda(VENDA)).toMatchObject({
      numero: 7,
      data: '2026-10-01T12:00:00.000Z',
      cliente: 'Cliente Teste',
      formaPagamento: null,
      total: '200',
      itens: [{ origem: 'produto', valorUnitario: '100', total: '200' }],
    });
  });

  it('list ignora excluídas, filtra status e busca por cliente', async () => {
    const { service, venda } = setup();
    const res = await service.list(consulta({ status: 'finalizada', search: 'ana' }));
    expect(res.data).toHaveLength(1);
    expect(venda.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          deletedAt: null,
          status: 'FINALIZADA',
          paciente: { nome: { contains: 'ana', mode: 'insensitive' } },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: 0,
        take: 10,
      }),
    );
  });

  it.each([
    ['id', { numero: 'asc' }],
    ['cliente', { paciente: { nome: 'asc' } }],
    ['pagamento', { formaPagamento: { nome: 'asc' } }],
    ['total', { total: 'asc' }],
    ['status', { status: 'asc' }],
  ])('list ordena por %s', async (field, esperado) => {
    const { service, venda } = setup();
    await service.list(consulta({ sort: { field, direction: 'asc' } }));
    expect(venda.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: [esperado, { id: 'asc' }] }),
    );
  });

  it('create recalcula os totais no servidor e grava como Finalizada', async () => {
    const { service, venda, pacientes, produtos } = setup();
    await service.create({ ...ENTRADA, desconto: 50, parcelas: 3 });
    expect(pacientes.findLookupById).toHaveBeenCalledWith(PACIENTE);
    expect(produtos.findById).toHaveBeenCalledWith(ID);
    const { data } = venda.create.mock.calls[0][0];
    expect(data).toMatchObject({
      status: 'FINALIZADA',
      parcelas: 3,
      desconto: 50,
      subtotal: 200,
      total: 150,
    });
    expect(data.itens.create).toEqual([
      expect.objectContaining({ origem: 'PRODUTO', total: 200, posicao: 0 }),
    ]);
  });

  it('create limita o desconto ao subtotal', async () => {
    const { service, venda } = setup();
    await service.create({ ...ENTRADA, desconto: 999 });
    expect(venda.create.mock.calls[0][0].data).toMatchObject({ desconto: 200, total: 0 });
  });

  it('create sem cliente nem forma de pagamento não consulta esses cadastros', async () => {
    const { service, pacientes, formas } = setup();
    await service.create({ ...ENTRADA, pacienteId: null });
    expect(pacientes.findLookupById).not.toHaveBeenCalled();
    expect(formas.findLookupById).not.toHaveBeenCalled();
  });

  it('create valida a forma de pagamento e a origem de protocolos', async () => {
    const { service, formas, protocolos } = setup();
    await service.create({
      ...ENTRADA,
      formaPagamentoId: ID,
      itens: [{ ...ITEM, origem: 'protocolo' }],
    });
    expect(formas.findLookupById).toHaveBeenCalledWith(ID);
    expect(protocolos.findById).toHaveBeenCalledWith(ID);
  });

  it('create não grava quando o cadastro de origem não existe', async () => {
    const { service, venda, produtos } = setup();
    produtos.findById.mockRejectedValue(new Error('NOT_FOUND'));
    await expect(service.create(ENTRADA)).rejects.toThrow('NOT_FOUND');
    expect(venda.create).not.toHaveBeenCalled();
  });

  it('catalogo lista produtos/serviços ativos com a categoria e o preço', async () => {
    const { service, produtos } = setup();
    const r = await service.catalogo({ tipo: 'produto', page: 1, pageSize: 20, search: 'soro' });
    expect(produtos.vendaveis).toHaveBeenCalledWith({ page: 1, pageSize: 20, search: 'soro' });
    expect(r.data).toEqual([{ id: ID, nome: 'Soro', detalhe: 'Infusão', valor: 250 }]);
  });

  it('catalogo lista protocolos pelo valor total', async () => {
    const { service } = setup();
    const r = await service.catalogo({
      tipo: 'protocolo',
      page: 1,
      pageSize: 20,
      search: undefined,
    });
    expect(r.data).toEqual([{ id: ID, nome: 'P1', detalhe: 'Geral', valor: 90 }]);
  });

  it('export respeita o limite e usa as colunas do grid', async () => {
    const { service, exportService } = setup();
    await service.export({ ...consulta(), format: 'xlsx', columns: ['id', 'total'] });
    expect(exportService.ensureWithinLimit).toHaveBeenCalledWith(1);
    expect(exportService.export).toHaveBeenCalledWith(
      expect.objectContaining({ filename: 'vendas-pdv', format: 'xlsx' }),
    );
  });

  it('colunas exportadas: cliente e pagamento vazios viram "-" e status ganha rótulo', () => {
    const v = toVenda({ ...VENDA, paciente: null, pacienteId: null });
    const valor = (key: string) => VENDA_EXPORT_DEFINITIONS.find((c) => c.key === key)?.value(v);
    expect(valor('cliente')).toBe('-');
    expect(valor('pagamento')).toBe('-');
    expect(valor('status')).toBe('Finalizada');
    expect(valor('id')).toBe(7);
  });
});
