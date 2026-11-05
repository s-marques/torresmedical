import type { TransactionHost } from '@nestjs-cls/transactional';
import { Prisma } from '../../../generated/prisma/client';
import type { ExportService } from '../../../common/export/export.service';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import type { PlanoContasService } from '../../financeiro/plano-contas/plano-contas.service';
import type { FornecedoresService } from '../fornecedores/fornecedores.service';
import { COMPRA_EXPORT_DEFINITIONS, ComprasService } from './compras.service';

const ID = '0b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const FORNECEDOR_ID = '1c9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const PRODUTO_ID = '2d9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const CONTA_ID = '3e9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';

function compra(status: 'PENDENTE' | 'RECEBIDA' | 'CANCELADA' = 'RECEBIDA') {
  return {
    id: ID,
    numero: 7,
    fornecedorId: FORNECEDOR_ID,
    fornecedor: { nome: 'Distribuidora Alfa' },
    numeroNf: '55252',
    serieNf: null,
    dataEmissao: new Date('2026-11-04T00:00:00.000Z'),
    dataEntrada: new Date('2026-11-05T00:00:00.000Z'),
    frete: new Prisma.Decimal('10'),
    desconto: new Prisma.Decimal('5'),
    valorTotal: new Prisma.Decimal('205'),
    status,
    observacoes: null,
    arquivoNfId: null,
    itens: [
      {
        id: 'i1',
        compraId: ID,
        produtoId: PRODUTO_ID,
        produto: { nome: 'Cadeira' },
        descricao: 'Cadeira Goah',
        quantidade: new Prisma.Decimal('2'),
        valorUnitario: new Prisma.Decimal('100'),
        planoContaId: CONTA_ID,
        createdAt: new Date('2026-11-05T12:00:00.000Z'),
      },
    ],
    createdAt: new Date('2026-11-05T12:00:00.000Z'),
    updatedAt: new Date('2026-11-05T12:00:00.000Z'),
    deletedAt: null,
  };
}

const INPUT = {
  fornecedorId: FORNECEDOR_ID,
  numeroNf: '55252',
  serieNf: null,
  dataEmissao: '2026-11-04',
  dataEntrada: '2026-11-05',
  frete: 10,
  desconto: 5,
  observacoes: null,
  arquivoNfId: null,
  itens: [
    {
      produtoId: PRODUTO_ID,
      descricao: 'Cadeira Goah',
      quantidade: 2,
      valorUnitario: 100,
      planoContaId: CONTA_ID,
    },
  ],
};

function setup(status: 'PENDENTE' | 'RECEBIDA' | 'CANCELADA' = 'RECEBIDA') {
  const registro = compra(status);
  const tx = {
    compra: {
      findMany: jest.fn().mockResolvedValue([registro]),
      findFirst: jest.fn().mockResolvedValue(registro),
      count: jest.fn().mockResolvedValue(1),
      create: jest.fn().mockResolvedValue(registro),
      update: jest.fn().mockResolvedValue(registro),
    },
    compraItem: { deleteMany: jest.fn().mockResolvedValue({}) },
    produto: {
      findMany: jest.fn().mockResolvedValue([{ id: PRODUTO_ID }]),
      findFirst: jest.fn().mockResolvedValue({ id: PRODUTO_ID }),
      updateMany: jest.fn().mockResolvedValue({}),
    },
    fornecedor: { findFirst: jest.fn().mockResolvedValue({ id: FORNECEDOR_ID }) },
  };
  const exportService = {
    ensureWithinLimit: jest.fn(),
    export: jest.fn().mockResolvedValue({ filename: 'compras.xlsx' }),
  };
  const fornecedores = { findById: jest.fn().mockResolvedValue({ id: FORNECEDOR_ID }) };
  const planoContas = { findById: jest.fn().mockResolvedValue({ id: CONTA_ID, nome: 'Móveis' }) };
  const service = new ComprasService(
    { tx } as unknown as TransactionHost<PrismaAdapter>,
    exportService as unknown as ExportService,
    fornecedores as unknown as FornecedoresService,
    planoContas as unknown as PlanoContasService,
  );
  return { service, tx, exportService, fornecedores, planoContas };
}

const incremento = (quantidade: string, op: 'increment' | 'decrement') => ({
  where: { id: PRODUTO_ID, controlaEstoque: true },
  data: { estoqueAtual: { [op]: new Prisma.Decimal(quantidade) } },
});

describe('ComprasService', () => {
  it('findById monta a compra com datas, valores e nome da conta contábil', async () => {
    const { service, planoContas } = setup();
    const res = await service.findById(ID);
    expect(planoContas.findById).toHaveBeenCalledWith(CONTA_ID);
    expect(res).toMatchObject({
      numero: 7,
      fornecedorNome: 'Distribuidora Alfa',
      dataEmissao: '2026-11-04',
      dataEntrada: '2026-11-05',
      valorTotal: '205',
      itens: [{ produtoNome: 'Cadeira', valorTotal: '200', planoContaNome: 'Móveis' }],
    });
  });

  it('o nome da conta contábil fica nulo se a conta foi excluída depois', async () => {
    const { service, planoContas } = setup();
    planoContas.findById.mockRejectedValue(new Error('x'));
    const res = await service.findById(ID);
    expect(res.itens[0]?.planoContaNome).toBeNull();
  });

  it('create valida fornecedor, produto e conta; grava o total e soma no estoque', async () => {
    const { service, tx, fornecedores, planoContas } = setup();
    await service.create(INPUT);
    expect(fornecedores.findById).toHaveBeenCalledWith(FORNECEDOR_ID);
    expect(planoContas.findById).toHaveBeenCalledWith(CONTA_ID);
    expect(tx.compra.create.mock.calls[0]?.[0].data).toMatchObject({
      status: 'RECEBIDA',
      valorTotal: 205,
    });
    expect(tx.produto.updateMany).toHaveBeenCalledWith(incremento('2', 'increment'));
  });

  it('create 404 quando algum produto não existe', async () => {
    const { service, tx } = setup();
    tx.produto.findMany.mockResolvedValue([]);
    await expect(service.create(INPUT)).rejects.toMatchObject({ status: 404 });
    expect(tx.compra.create).not.toHaveBeenCalled();
  });

  it('update devolve a entrada antiga e soma a nova', async () => {
    const { service, tx } = setup();
    await service.update(ID, INPUT);
    expect(tx.compraItem.deleteMany).toHaveBeenCalledWith({ where: { compraId: ID } });
    expect(tx.produto.updateMany).toHaveBeenNthCalledWith(1, incremento('2', 'decrement'));
    expect(tx.produto.updateMany).toHaveBeenNthCalledWith(2, incremento('2', 'increment'));
  });

  it('update recusa compra cancelada', async () => {
    const { service, tx } = setup('CANCELADA');
    await expect(service.update(ID, INPUT)).rejects.toMatchObject({ status: 422 });
    expect(tx.produto.updateMany).not.toHaveBeenCalled();
  });

  it('cancelar devolve a entrada; recusa se já cancelada', async () => {
    const { service, tx } = setup();
    await service.cancelar(ID);
    expect(tx.produto.updateMany).toHaveBeenCalledWith(incremento('2', 'decrement'));
    expect(tx.compra.update.mock.calls[0]?.[0].data).toEqual({ status: 'CANCELADA' });
    await expect(setup('CANCELADA').service.cancelar(ID)).rejects.toMatchObject({ status: 422 });
  });

  it('remove é lógico e não mexe no estoque de compra cancelada', async () => {
    const recebida = setup();
    await recebida.service.remove(ID);
    expect(recebida.tx.compra.update.mock.calls[0]?.[0].data.deletedAt).toBeInstanceOf(Date);
    expect(recebida.tx.produto.updateMany).toHaveBeenCalledTimes(1);

    const cancelada = setup('CANCELADA');
    await cancelada.service.remove(ID);
    expect(cancelada.tx.produto.updateMany).not.toHaveBeenCalled();
  });

  it('404 quando a compra não existe', async () => {
    const { service, tx } = setup();
    tx.compra.findFirst.mockResolvedValue(null);
    await expect(service.findById(ID)).rejects.toMatchObject({ status: 404 });
  });

  it('list ordena por fornecedor e busca por NF, fornecedor ou número', async () => {
    const { service, tx } = setup();
    const query = {
      page: 1,
      pageSize: 10,
      sort: { field: 'fornecedor' as const, direction: 'asc' as const },
      search: '123',
      status: 'RECEBIDA' as const,
    };
    const page = await service.list(query);
    expect(page.data).toHaveLength(1);
    const args = tx.compra.findMany.mock.calls[0]?.[0];
    expect(args.orderBy[0]).toEqual({ fornecedor: { nome: 'asc' } });
    expect(args.where.OR).toHaveLength(3);
    expect(args.where.status).toBe('RECEBIDA');
  });

  it('importarXml casa fornecedor e produto; item sem cadastro fica sem produto', async () => {
    const { service, tx } = setup();
    tx.produto.findFirst.mockResolvedValueOnce({ id: PRODUTO_ID }).mockResolvedValueOnce(null);
    const xml = `<infNFe><ide><nNF>1</nNF></ide><emit><CNPJ>11222333000181</CNPJ><xNome>F</xNome></emit>
      <det><prod><cProd>A</cProd><xProd>Item A</xProd><qCom>1</qCom><vUnCom>2</vUnCom></prod></det>
      <det><prod><cProd>B</cProd><xProd>Item B</xProd><qCom>3</qCom><vUnCom>4</vUnCom></prod></det></infNFe>`;
    const res = await service.importarXml(xml);
    expect(res.fornecedorId).toBe(FORNECEDOR_ID);
    expect(res.itens.map((i) => i.produtoId)).toEqual([PRODUTO_ID, null]);
  });

  it('export usa as colunas do grid', async () => {
    const { service, exportService } = setup();
    await service.export({
      format: 'xlsx',
      columns: ['id', 'numeroNf'],
      sort: { field: 'id', direction: 'desc' },
    } as never);
    expect(exportService.export).toHaveBeenCalled();
    expect(COMPRA_EXPORT_DEFINITIONS.map((c) => c.key)).toEqual([
      'id',
      'dataEntrada',
      'fornecedor',
      'numeroNf',
      'valorTotal',
      'status',
    ]);
  });
});
