import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import type {
  CreateProdutoInput,
  ExportProdutosQuery,
  ListProdutosQuery,
  LookupItem,
  LookupQuery,
  ProdutoExportColumn,
  UpdateProdutoInput,
} from '@torres/shared';
import type { Prisma, Produto } from '../../../generated/prisma/client';
import { BusinessException } from '../../../common/errors/api.exception';
import { ExportService, selectColumns } from '../../../common/export/export.service';
import type { ExportColumn, ExportFile } from '../../../common/export/export.types';
import {
  EntidadeLookupService,
  juntarDescricao,
  SELECIONAVEIS,
  type FonteLookup,
} from '../../../common/lookups/lookup-query';
import { paginate, searchWhere, toOrderBy, type Page } from '../../../common/pagination/paginate';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import { filtroGrupoProduto, rotuloTipoProduto, TIPO_PRODUTO } from '../tipo-produto';

const NAO_EXCLUIDOS = { deletedAt: null } as const;

/** O que o grid mostra em "Código": o SKU ou, sem ele, o código de barras. */
export function codigoDoProduto(produto: Pick<Produto, 'sku' | 'codigoBarras'>): string {
  return produto.sku ?? produto.codigoBarras ?? '';
}

/** Colunas exportáveis, iguais às do grid. */
export const PRODUTO_EXPORT_DEFINITIONS: readonly ExportColumn<Produto, ProdutoExportColumn>[] = [
  { key: 'nome', header: 'Produto/Serviço', value: (p) => p.nome, width: 4 },
  { key: 'tipo', header: 'Tipo', value: (p) => rotuloTipoProduto(p.tipo) },
  { key: 'codigo', header: 'Código', value: codigoDoProduto },
  { key: 'precoVenda', header: 'Preço Venda', type: 'currency', value: (p) => p.precoVenda },
  { key: 'precoCusto', header: 'Custo', type: 'currency', value: (p) => p.precoCusto },
  { key: 'estoqueAtual', header: 'Estoque', type: 'number', value: (p) => p.estoqueAtual },
  { key: 'ativo', header: 'Status', value: (p) => (p.ativo ? 'Ativo' : 'Inativo') },
];

/** Produto ou serviço do catálogo (Vendas, Orçamentos, Pacotes, Estoque, Lotes, Baixa de Insumos). */
@Injectable()
export class ProdutosService extends EntidadeLookupService<
  LookupQuery<'produtos'>,
  Prisma.ProdutoWhereInput,
  Produto
> {
  protected readonly naoEncontrado = 'Produto não encontrado';
  protected readonly fonte: FonteLookup<Prisma.ProdutoWhereInput, Produto> = {
    findMany: (args) => this.txHost.tx.produto.findMany(args),
    count: (args) => this.txHost.tx.produto.count(args),
    findFirst: (args) => this.txHost.tx.produto.findFirst(args),
  };

  constructor(
    private readonly txHost: TransactionHost<PrismaAdapter>,
    private readonly exportService: ExportService,
  ) {
    super();
  }

  list(query: ListProdutosQuery): Promise<Page<Produto>> {
    const where = this.where(query);
    const orderBy = toOrderBy(query.sort, { codigo: 'sku' });
    return paginate(query, {
      findMany: (page) => this.txHost.tx.produto.findMany({ where, orderBy, ...page }),
      count: () => this.txHost.tx.produto.count({ where }),
    });
  }

  /** Nome dos produtos/serviços não excluídos entre os ids (composição de protocolos). */
  async nomesPorIds(ids: readonly string[]): Promise<ReadonlyMap<string, string>> {
    if (ids.length === 0) return new Map();
    const produtos = await this.txHost.tx.produto.findMany({
      where: { id: { in: [...ids] }, ...NAO_EXCLUIDOS },
      select: { id: true, nome: true },
    });
    return new Map(produtos.map((p) => [p.id, p.nome]));
  }

  async create(input: CreateProdutoInput): Promise<Produto> {
    await this.validarReferencias(input);
    return this.txHost.tx.produto.create({ data: this.dados(input) });
  }

  async update(id: string, input: UpdateProdutoInput): Promise<Produto> {
    await this.findById(id);
    await this.validarReferencias(input);
    return this.txHost.tx.produto.update({ where: { id }, data: this.dados(input) });
  }

  /** Exclusão lógica: o produto sai das listagens e dos combos, mas o histórico continua. */
  async remove(id: string): Promise<Produto> {
    await this.findById(id);
    return this.txHost.tx.produto.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  async export(query: ExportProdutosQuery): Promise<ExportFile> {
    const where = this.where(query);
    this.exportService.ensureWithinLimit(await this.txHost.tx.produto.count({ where }));
    const rows = await this.txHost.tx.produto.findMany({
      where,
      orderBy: toOrderBy(query.sort, { codigo: 'sku' }),
    });
    return this.exportService.export({
      format: query.format,
      title: 'Produtos e Serviços',
      filename: 'produtos-servicos',
      columns: selectColumns(PRODUTO_EXPORT_DEFINITIONS, query.columns),
      rows,
    });
  }

  private where(query: Pick<ListProdutosQuery, 'search' | 'tipo'>): Prisma.ProdutoWhereInput {
    return {
      ...NAO_EXCLUIDOS,
      tipo: filtroGrupoProduto(query.tipo),
      ...searchWhere(query.search, ['nome', 'sku', 'codigoBarras']),
    };
  }

  private dados(input: CreateProdutoInput): Prisma.ProdutoUncheckedCreateInput {
    return { ...input, tipo: TIPO_PRODUTO[input.tipo] };
  }

  /** Categoria e unidade escolhidas precisam existir e não estar excluídas. */
  private async validarReferencias(
    input: Pick<CreateProdutoInput, 'categoriaId' | 'unidadeMedidaId'>,
  ): Promise<void> {
    const { categoriaId, unidadeMedidaId } = input;
    if (categoriaId) {
      const existe = await this.txHost.tx.categoria.count({
        where: { id: categoriaId, ...NAO_EXCLUIDOS },
      });
      if (!existe) {
        throw new BusinessException('CATEGORIA_INVALIDA', 'Categoria não encontrada.', {
          status: 400,
        });
      }
    }
    if (unidadeMedidaId) {
      const existe = await this.txHost.tx.unidadeMedida.count({
        where: { id: unidadeMedidaId, ...NAO_EXCLUIDOS },
      });
      if (!existe) {
        throw new BusinessException(
          'UNIDADE_MEDIDA_INVALIDA',
          'Unidade de medida não encontrada.',
          { status: 400 },
        );
      }
    }
  }

  protected filtro(query: LookupQuery<'produtos'>): Prisma.ProdutoWhereInput {
    return {
      ...SELECIONAVEIS,
      tipo: filtroGrupoProduto(query.tipo),
      ...searchWhere(query.search, ['nome', 'sku', 'codigoBarras']),
    };
  }

  protected toItem(produto: Produto): LookupItem {
    return {
      id: produto.id,
      label: produto.nome,
      descricao: juntarDescricao(rotuloTipoProduto(produto.tipo), codigoDoProduto(produto)),
    };
  }
}
