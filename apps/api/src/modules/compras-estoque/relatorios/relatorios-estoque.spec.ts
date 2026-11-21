import type { TransactionHost } from '@nestjs-cls/transactional';
import { Prisma } from '../../../generated/prisma/client';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import type { ConsultaRelatorio } from '../../../common/relatorios/relatorio.types';
import { COBERTURA_PADRAO_DIAS, RelatoriosEstoque } from './relatorios-estoque';

const consulta = (filtros: ConsultaRelatorio['filtros'] = {}): ConsultaRelatorio => ({
  periodo: { de: '2026-01-01', ate: '2026-01-31' },
  intervalo: { gte: new Date('2026-01-01T03:00:00Z'), lt: new Date('2026-02-01T03:00:00Z') },
  filtros,
});

const decimal = (n: number) => new Prisma.Decimal(n);

function criar(tx: Record<string, unknown>) {
  return new RelatoriosEstoque({ tx } as unknown as TransactionHost<PrismaAdapter>);
}

describe('RelatoriosEstoque', () => {
  it('registra EST-01, EST-04 a EST-14 com a permissão da tela dona dos dados', () => {
    const { relatorios } = criar({});

    expect(relatorios.map((r) => [r.id, r.permissao])).toEqual([
      ['EST-01', 'compras-estoque.lotes-validade.ver'],
      ['EST-04', 'compras-estoque.lotes-validade.ver'],
      ['EST-05', 'compras-estoque.estoque.ver'],
      ['EST-06', 'compras-estoque.estoque.ver'],
      ['EST-07', 'compras-estoque.estoque.ver'],
      ['EST-08', 'compras-estoque.entrada-compras.ver'],
      ['EST-09', 'compras-estoque.entrada-compras.ver'],
      ['EST-10', 'compras-estoque.entrada-compras.ver'],
      ['EST-11', 'compras-estoque.estoque.ver'],
      ['EST-12', 'compras-estoque.entrada-compras.ver'],
      ['EST-13', 'compras-estoque.estoque.ver'],
      ['EST-14', 'compras-estoque.estoque.ver'],
    ]);
    // Falha C7: todo relatório de produto traz o nome do produto.
    const comProduto = [
      'EST-01',
      'EST-04',
      'EST-05',
      'EST-06',
      'EST-07',
      'EST-09',
      'EST-10',
      'EST-11',
      'EST-14',
    ];
    for (const id of comProduto) {
      expect(relatorios.find((r) => r.id === id)?.colunas.map((c) => c.key)).toContain('produto');
    }
  });

  it('linhasPrevisao usa a cobertura padrão e o filtro "cobertura"', async () => {
    const produto = {
      id: 'p1',
      nome: 'Gaze',
      estoqueAtual: decimal(10),
      categoria: null,
      unidadeMedida: null,
    };
    const groupBy = jest
      .fn()
      .mockResolvedValue([{ produtoId: 'p1', _sum: { quantidade: decimal(90) } }]);
    const service = criar({
      movimentacaoEstoque: { groupBy },
      produto: { findMany: jest.fn().mockResolvedValue([produto]) },
    });

    const padrao = await service.linhasPrevisao(consulta());
    const noventa = await service.linhasPrevisao(consulta({ cobertura: '90' }));

    expect(COBERTURA_PADRAO_DIAS).toBe(30);
    expect(padrao[0]).toMatchObject({
      produto: 'Gaze',
      necessidade: 20,
      sugestao: 20,
      diasDeEstoque: 10,
    });
    expect(noventa[0]).toMatchObject({ necessidade: 80 });
  });

  it('linhasPrevisao ignora produto sem consumo e sem necessidade', async () => {
    const produto = {
      id: 'p1',
      nome: 'Parado',
      estoqueAtual: decimal(0),
      categoria: null,
      unidadeMedida: null,
    };
    const service = criar({
      movimentacaoEstoque: { groupBy: jest.fn().mockResolvedValue([]) },
      produto: { findMany: jest.fn().mockResolvedValue([produto]) },
    });

    expect(await service.linhasPrevisao(consulta())).toEqual([]);
  });

  it('linhasCurvaAbc devolve vazio sem compras (sem dividir por zero)', async () => {
    const service = criar({
      compraItem: { findMany: jest.fn().mockResolvedValue([]) },
      produto: { findMany: jest.fn().mockResolvedValue([]) },
    });

    expect(await service.linhasCurvaAbc(consulta())).toEqual([]);
  });

  it('linhasVencimento calcula os dias para vencer a partir de "hoje"', async () => {
    const lote = {
      numero: 'L1',
      dataVencimento: new Date('2026-01-20T00:00:00Z'),
      quantidade: decimal(3),
      produto: { nome: 'Soro', precoCusto: null },
    };
    const findMany = jest.fn().mockResolvedValue([lote]);
    const service = criar({ lote: { findMany } });

    const [linha] = await service.linhasVencimento(consulta(), '2026-01-10');

    expect(linha).toMatchObject({ produto: 'Soro', lote: 'L1', diasParaVencer: 10, quantidade: 3 });
    const { gte, lte } = findMany.mock.calls[0][0].where.dataVencimento;
    expect(gte).toEqual(new Date('2026-01-10T00:00:00Z'));
    expect(lte).toEqual(new Date('2026-01-31T00:00:00Z'));
  });
});
