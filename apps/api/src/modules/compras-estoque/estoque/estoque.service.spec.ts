import type { TransactionHost } from '@nestjs-cls/transactional';
import { Prisma } from '../../../generated/prisma/client';
import type { RequestContextService } from '../../../common/context/request-context.service';
import type { ExportService } from '../../../common/export/export.service';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import type { FornecedoresService } from '../fornecedores/fornecedores.service';
import { EstoqueService, SUGESTAO_EXPORT_DEFINITIONS } from './estoque.service';

const PRODUTO_ID = '2d9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const USUARIO_ID = '4f9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const AGORA = new Date('2026-11-14T12:00:00.000Z');

const dec = (v: number | string) => new Prisma.Decimal(v);

function produto(extra: Record<string, unknown> = {}) {
  return {
    id: PRODUTO_ID,
    nome: 'Luva',
    sku: 'LUV',
    descricao: null,
    tipo: 'PRODUTO',
    controlaEstoque: true,
    estoqueAtual: dec(10),
    estoqueMinimo: dec(2),
    precoCusto: dec(3),
    categoria: null,
    ...extra,
  };
}

function movimentacao(dados: Record<string, unknown>) {
  return {
    id: 'm1',
    createdAt: AGORA,
    produto: { nome: 'Luva', sku: 'LUV' },
    fornecedor: null,
    saldoAnterior: null,
    saldoPosterior: null,
    custoUnitario: null,
    validade: null,
    motivo: null,
    documento: null,
    lote: null,
    fornecedorId: null,
    compraId: null,
    usuarioId: USUARIO_ID,
    ...dados,
  };
}

function setup() {
  const tx = {
    produto: {
      fields: { estoqueMinimo: 'estoque_minimo_ref' },
      findFirst: jest.fn().mockResolvedValue(produto()),
      findMany: jest.fn().mockResolvedValue([]),
      findUniqueOrThrow: jest.fn().mockResolvedValue({ estoqueAtual: dec(12) }),
      update: jest.fn().mockResolvedValue({ estoqueAtual: dec(15) }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      count: jest.fn().mockResolvedValue(0),
    },
    movimentacaoEstoque: {
      create: jest.fn().mockImplementation(({ data }) => Promise.resolve(movimentacao(data))),
      groupBy: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
    compraItem: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const exportService = {
    ensureWithinLimit: jest.fn(),
    export: jest.fn().mockResolvedValue({ filename: 'sugestao-compra.xlsx' }),
  };
  const fornecedores = { findById: jest.fn().mockResolvedValue({ id: 'f1' }) };
  const contexto = { getUserId: jest.fn().mockReturnValue(USUARIO_ID) };
  const service = new EstoqueService(
    { tx } as unknown as TransactionHost<PrismaAdapter>,
    exportService as unknown as ExportService,
    fornecedores as unknown as FornecedoresService,
    contexto as unknown as RequestContextService,
  );
  return { service, tx, exportService, fornecedores };
}

const SUGESTAO_QUERY = {
  page: 1,
  pageSize: 10,
  sort: { field: 'prioridade' as const, direction: 'asc' as const },
  search: undefined,
  prioridade: undefined,
  categoriaId: undefined,
};

describe('EstoqueService', () => {
  it('entrada soma no saldo, valida o fornecedor e grava o responsável', async () => {
    const { service, tx, fornecedores } = setup();
    const res = await service.entrada({
      produtoId: PRODUTO_ID,
      quantidade: 5,
      custoUnitario: null,
      motivo: 'BONIFICACAO',
      lote: null,
      validade: '2027-01-31',
      documento: null,
      fornecedorId: 'f1',
    });
    expect(fornecedores.findById).toHaveBeenCalledWith('f1');
    expect(tx.movimentacaoEstoque.create.mock.calls[0]?.[0].data).toMatchObject({
      tipo: 'ENTRADA',
      motivo: 'Bonificação',
      saldoAnterior: dec(10),
      saldoPosterior: dec(15),
      validade: new Date('2027-01-31'),
      usuarioId: USUARIO_ID,
    });
    expect(res).toMatchObject({ usuarioId: USUARIO_ID, saldoPosterior: '15' });
  });

  it('entrada recusa produto sem controle de estoque com erro no campo', async () => {
    const { service, tx } = setup();
    tx.produto.findFirst.mockResolvedValue(produto({ controlaEstoque: false }));
    await expect(
      service.entrada({ produtoId: PRODUTO_ID, quantidade: 1, motivo: 'COMPRA' } as never),
    ).rejects.toMatchObject({ status: 400 });
    expect(tx.produto.update).not.toHaveBeenCalled();
  });

  it('ajuste 409 quando o saldo mudou entre a leitura e a gravação', async () => {
    const { service, tx } = setup();
    tx.produto.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      service.ajuste({ produtoId: PRODUTO_ID, quantidadeReal: 3, motivo: 'Inventário' }),
    ).rejects.toMatchObject({ status: 409 });
    expect(tx.movimentacaoEstoque.create).not.toHaveBeenCalled();
  });

  it('movimentarCompra ignora produto que não controla estoque e registra o estorno', async () => {
    const { service, tx } = setup();
    tx.produto.updateMany.mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 1 });
    await service.movimentarCompra(
      { id: 'c1', numero: 7, numeroNf: null, fornecedorId: 'f1' },
      [
        { produtoId: 'servico', quantidade: dec(1), valorUnitario: dec(5) },
        { produtoId: PRODUTO_ID, quantidade: dec(2), valorUnitario: dec(5) },
      ],
      'ESTORNO',
    );
    expect(tx.produto.updateMany).toHaveBeenNthCalledWith(2, {
      where: { id: PRODUTO_ID, controlaEstoque: true },
      data: { estoqueAtual: { decrement: dec(2) } },
    });
    expect(tx.movimentacaoEstoque.create).toHaveBeenCalledTimes(1);
    expect(tx.movimentacaoEstoque.create.mock.calls[0]?.[0].data).toMatchObject({
      tipo: 'SAIDA',
      motivo: 'Estorno da compra #7',
      saldoAnterior: dec(14),
      saldoPosterior: dec(12),
      compraId: 'c1',
    });
  });

  it('sugestão ordena por prioridade, depois nome, e pagina em memória', async () => {
    const { service, tx } = setup();
    tx.produto.findMany.mockResolvedValue([
      produto({ id: 'a', nome: 'Normal B', estoqueAtual: dec(50), estoqueMinimo: dec(0) }),
      produto({ id: 'b', nome: 'Zerado', estoqueAtual: dec(0) }),
      produto({ id: 'c', nome: 'Normal A', estoqueAtual: dec(50), estoqueMinimo: dec(0) }),
    ]);
    const page = await service.sugestao({ ...SUGESTAO_QUERY, pageSize: 2 }, AGORA);
    expect(page.meta).toEqual({ page: 1, pageSize: 2, total: 3, totalPages: 2 });
    expect(page.data.map((s) => s.nome)).toEqual(['Zerado', 'Normal A']);

    const desc = await service.sugestao(
      { ...SUGESTAO_QUERY, sort: { field: 'diasParaAcabar', direction: 'desc' } },
      AGORA,
    );
    // Sem consumo não há previsão: vazios sempre no fim.
    expect(desc.data.every((s) => s.diasParaAcabar === null)).toBe(true);
    expect(tx.movimentacaoEstoque.groupBy.mock.calls[0]?.[0].where).toMatchObject({
      tipo: 'SAIDA',
      compraId: null,
      createdAt: { gte: new Date('2026-08-16T12:00:00.000Z') },
    });
  });

  it('sugestão filtra por prioridade e ordena por custo total', async () => {
    const { service, tx } = setup();
    tx.produto.findMany.mockResolvedValue([
      produto({ id: 'a', nome: 'Caro', estoqueAtual: dec(0), precoCusto: dec(10) }),
      produto({ id: 'b', nome: 'Sem custo', estoqueAtual: dec(0), precoCusto: null }),
      produto({ id: 'c', nome: 'Barato', estoqueAtual: dec(0), precoCusto: dec(1) }),
    ]);
    const page = await service.sugestao(
      {
        ...SUGESTAO_QUERY,
        prioridade: 'CRITICO',
        sort: { field: 'custoTotal', direction: 'desc' },
      },
      AGORA,
    );
    expect(page.data.map((s) => [s.nome, s.custoTotal])).toEqual([
      ['Caro', '20'],
      ['Barato', '2'],
      ['Sem custo', null],
    ]);
  });

  it('export da sugestão usa as colunas do grid e respeita o limite', async () => {
    const { service, exportService } = setup();
    await service.exportSugestao({ ...SUGESTAO_QUERY, format: 'xlsx', columns: ['produto'] });
    expect(exportService.ensureWithinLimit).toHaveBeenCalledWith(0);
    expect(exportService.export.mock.calls[0]?.[0]).toMatchObject({
      title: 'Sugestão de Compra',
      columns: [expect.objectContaining({ key: 'produto' })],
    });
    expect(SUGESTAO_EXPORT_DEFINITIONS.map((c) => c.key)).toContain('fornecedor');
  });
});
