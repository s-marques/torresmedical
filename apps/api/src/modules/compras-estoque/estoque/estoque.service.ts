import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import {
  calcularSugestao,
  ESTOQUE_DIAS_VENCENDO_CARD,
  LOTE_DIAS_VENCENDO,
  ROTULO_MOTIVO_ENTRADA,
  ROTULO_MOTIVO_SAIDA,
  ROTULO_PRIORIDADE_SUGESTAO,
  statusEstoque,
  SUGESTAO_JANELA_DIAS,
  type AjusteEstoqueInput,
  type AlertasEstoque,
  type EntradaEstoqueInput,
  type ExportSugestaoQuery,
  type ListMovimentacoesQuery,
  type ListPosicaoQuery,
  type ListSugestaoQuery,
  type MovimentacaoEstoque,
  type PosicaoEstoque,
  type PrioridadeSugestao,
  type ResumoEstoque,
  type SaidaEstoqueInput,
  type SugestaoCompra,
  type SugestaoExportColumn,
} from '@torres/shared';
import { Prisma } from '../../../generated/prisma/client';
import { RequestContextService } from '../../../common/context/request-context.service';
import { BusinessException } from '../../../common/errors/api.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import { ExportService, selectColumns } from '../../../common/export/export.service';
import type { ExportColumn, ExportFile } from '../../../common/export/export.types';
import { paginate, searchWhere, type Page } from '../../../common/pagination/paginate';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import { intervaloDoPeriodo } from '../../../common/relatorios/periodo';
import { FornecedoresService } from '../fornecedores/fornecedores.service';
import { LotesService } from '../lotes/lotes.service';
import { filtroAbaixoMinimo, PRODUTOS_ESTOQUE as PRODUTOS } from './estoque-filtros';

const DIA_MS = 24 * 60 * 60 * 1000;

const INCLUDE_POSICAO = {
  categoria: { select: { nome: true } },
} as const satisfies Prisma.ProdutoInclude;

type ProdutoPosicao = Prisma.ProdutoGetPayload<{ include: typeof INCLUDE_POSICAO }>;

const INCLUDE_MOVIMENTACAO = {
  produto: { select: { nome: true, sku: true } },
  fornecedor: { select: { nome: true } },
} as const satisfies Prisma.MovimentacaoEstoqueInclude;

type MovimentacaoComRelacoes = Prisma.MovimentacaoEstoqueGetPayload<{
  include: typeof INCLUDE_MOVIMENTACAO;
}>;

const ORDEM_PRIORIDADE: Readonly<Record<PrioridadeSugestao, number>> = {
  CRITICO: 0,
  URGENTE: 1,
  NORMAL: 2,
};

/** Item de compra que movimenta o estoque (entrada ao receber, estorno ao desfazer). */
export interface ItemCompraEstoque {
  produtoId: string;
  quantidade: Prisma.Decimal;
  valorUnitario: Prisma.Decimal;
}

/** Compra de origem, para o motivo e o documento da movimentação. */
export interface CompraEstoque {
  id: string;
  numero: number;
  numeroNf: string | null;
  fornecedorId: string;
}

/** Colunas do "Exportar Excel" da aba Sugestão, iguais às do grid. */
export const SUGESTAO_EXPORT_DEFINITIONS: readonly ExportColumn<
  SugestaoCompra,
  SugestaoExportColumn
>[] = [
  {
    key: 'prioridade',
    header: 'Prioridade',
    value: (s) => ROTULO_PRIORIDADE_SUGESTAO[s.prioridade],
  },
  { key: 'produto', header: 'Produto', value: (s) => s.nome, width: 3 },
  { key: 'sku', header: 'SKU', value: (s) => s.sku ?? '' },
  { key: 'categoria', header: 'Categoria', value: (s) => s.categoriaNome ?? '' },
  { key: 'estoqueAtual', header: 'Atual', type: 'number', value: (s) => s.estoqueAtual },
  { key: 'estoqueMinimo', header: 'Mínimo', type: 'number', value: (s) => s.estoqueMinimo },
  { key: 'qtdSugerida', header: 'Qtd Sugerida', type: 'number', value: (s) => s.qtdSugerida },
  {
    key: 'diasParaAcabar',
    header: 'Dias p/ Acabar',
    type: 'number',
    value: (s) => s.diasParaAcabar ?? '',
  },
  {
    key: 'custoUnitario',
    header: 'Custo Unit.',
    type: 'currency',
    value: (s) => s.custoUnitario ?? '',
  },
  { key: 'custoTotal', header: 'Custo Total', type: 'currency', value: (s) => s.custoTotal ?? '' },
  { key: 'fornecedor', header: 'Fornecedor', value: (s) => s.fornecedorNome ?? '', width: 2 },
];

/**
 * Tela Estoque (`/estoque`, issue #20): posição, movimentações, ajustes, alertas e sugestão de
 * compra. Toda mudança de saldo de `Produto.estoqueAtual` passa por aqui e grava uma
 * `MovimentacaoEstoque` (inclusive as das compras, chamadas pelo `ComprasService`).
 */
@Injectable()
export class EstoqueService {
  constructor(
    private readonly txHost: TransactionHost<PrismaAdapter>,
    private readonly exportService: ExportService,
    private readonly fornecedores: FornecedoresService,
    private readonly contexto: RequestContextService,
    private readonly lotes: LotesService,
  ) {}

  // --- Leitura ---

  async resumo(agora = new Date()): Promise<ResumoEstoque> {
    const produto = this.txHost.tx.produto;
    const controlados = { ...PRODUTOS, controlaEstoque: true } as const;
    const [
      totalProdutos,
      qtdControlados,
      abaixoMinimo,
      zerados,
      comSaldo,
      movimentacoes24h,
      { vencidos, vencendo },
    ] = await Promise.all([
      produto.count({ where: PRODUTOS }),
      produto.count({ where: controlados }),
      produto.count({ where: this.filtroAbaixoMinimo() }),
      produto.count({ where: { ...controlados, estoqueAtual: { lte: 0 } } }),
      produto.findMany({
        where: { ...controlados, estoqueAtual: { gt: 0 }, precoCusto: { not: null } },
        select: { estoqueAtual: true, precoCusto: true },
      }),
      this.txHost.tx.movimentacaoEstoque.count({
        where: { createdAt: { gte: new Date(agora.getTime() - DIA_MS) } },
      }),
      this.lotes.contarVencimentos(ESTOQUE_DIAS_VENCENDO_CARD, agora),
    ]);
    const valorEstoque = comSaldo.reduce(
      (total, p) => total.add(p.estoqueAtual.mul(p.precoCusto ?? 0)),
      new Prisma.Decimal(0),
    );
    return {
      totalProdutos,
      controlados: qtdControlados,
      abaixoMinimo,
      zerados,
      valorEstoque: valorEstoque.toDecimalPlaces(2).toString(),
      // Lotes da tela Lotes / Validade (#22).
      vencendo30d: vencendo,
      vencidos,
      movimentacoes24h,
    };
  }

  async posicao(query: ListPosicaoQuery): Promise<Page<PosicaoEstoque>> {
    const where = this.wherePosicao(query);
    const orderBy = this.orderByPosicao(query.sort);
    const page = await paginate(query, {
      findMany: (p) =>
        this.txHost.tx.produto.findMany({ where, orderBy, include: INCLUDE_POSICAO, ...p }),
      count: () => this.txHost.tx.produto.count({ where }),
    });
    return { ...page, data: await this.toPosicoes(page.data) };
  }

  async alertas(agora = new Date()): Promise<AlertasEstoque> {
    const [produtos, lotesVencendo] = await Promise.all([
      this.txHost.tx.produto.findMany({
        where: this.filtroAbaixoMinimo(),
        orderBy: [{ nome: 'asc' }, { id: 'asc' }],
        include: INCLUDE_POSICAO,
      }),
      this.lotes.vencendo(LOTE_DIAS_VENCENDO, agora),
    ]);
    return { abaixoMinimo: await this.toPosicoes(produtos), lotesVencendo };
  }

  async movimentacoes(query: ListMovimentacoesQuery): Promise<Page<MovimentacaoEstoque>> {
    const where = this.whereMovimentacoes(query);
    const orderBy = this.orderByMovimentacoes(query.sort);
    const page = await paginate(query, {
      findMany: (p) =>
        this.txHost.tx.movimentacaoEstoque.findMany({
          where,
          orderBy,
          include: INCLUDE_MOVIMENTACAO,
          ...p,
        }),
      count: () => this.txHost.tx.movimentacaoEstoque.count({ where }),
    });
    return { ...page, data: page.data.map((m) => this.toMovimentacao(m)) };
  }

  /**
   * Sugestão de compra de cada produto controlado. Calculada em memória (consumo e última
   * compra por produto), então filtro, ordenação e paginação também são aplicados aqui.
   */
  async sugestao(query: ListSugestaoQuery, agora = new Date()): Promise<Page<SugestaoCompra>> {
    const todas = await this.calcularSugestoes(query, agora);
    const inicio = (query.page - 1) * query.pageSize;
    return {
      data: todas.slice(inicio, inicio + query.pageSize),
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total: todas.length,
        totalPages: Math.ceil(todas.length / query.pageSize),
      },
    };
  }

  async exportSugestao(query: ExportSugestaoQuery, agora = new Date()): Promise<ExportFile> {
    const rows = await this.calcularSugestoes(query, agora);
    this.exportService.ensureWithinLimit(rows.length);
    return this.exportService.export({
      format: query.format,
      title: 'Sugestão de Compra',
      filename: 'sugestao-compra',
      columns: selectColumns(SUGESTAO_EXPORT_DEFINITIONS, query.columns),
      rows,
    });
  }

  // --- Escrita ---

  /** "Entrada Manual": soma no saldo e registra a movimentação. */
  async entrada(input: EntradaEstoqueInput): Promise<MovimentacaoEstoque> {
    await this.buscarControlado(input.produtoId);
    if (input.fornecedorId) await this.fornecedores.findById(input.fornecedorId);
    const { anterior, posterior } = await this.somar(input.produtoId, input.quantidade);
    return this.registrar({
      produtoId: input.produtoId,
      tipo: 'ENTRADA',
      quantidade: input.quantidade,
      saldoAnterior: anterior,
      saldoPosterior: posterior,
      motivo: ROTULO_MOTIVO_ENTRADA[input.motivo],
      documento: input.documento,
      custoUnitario: input.custoUnitario,
      lote: input.lote,
      validade: input.validade ? new Date(input.validade) : null,
      fornecedorId: input.fornecedorId,
    });
  }

  /** "Saída Manual": não deixa o saldo ficar negativo (confirmado pelo dev na issue #20). */
  async saida(input: SaidaEstoqueInput): Promise<MovimentacaoEstoque> {
    const produto = await this.buscarControlado(input.produtoId);
    const { count } = await this.txHost.tx.produto.updateMany({
      where: { id: produto.id, estoqueAtual: { gte: input.quantidade } },
      data: { estoqueAtual: { decrement: input.quantidade } },
    });
    if (count === 0) {
      const atual = await this.buscarControlado(input.produtoId);
      const mensagem = `Estoque insuficiente. Saldo atual: ${atual.estoqueAtual.toString()}.`;
      throw new BusinessException('ESTOQUE_INSUFICIENTE', mensagem, {
        status: 400,
        details: [{ field: 'quantidade', message: mensagem }],
      });
    }
    const posterior = (await this.buscarControlado(input.produtoId)).estoqueAtual;
    return this.registrar({
      produtoId: input.produtoId,
      tipo: 'SAIDA',
      quantidade: input.quantidade,
      saldoAnterior: posterior.add(input.quantidade),
      saldoPosterior: posterior,
      motivo: ROTULO_MOTIVO_SAIDA[input.motivo],
      documento: input.documento,
    });
  }

  /** "Ajuste Individual": o saldo passa a ser a quantidade contada fisicamente. */
  async ajuste(input: AjusteEstoqueInput): Promise<MovimentacaoEstoque> {
    const produto = await this.buscarControlado(input.produtoId);
    const real = new Prisma.Decimal(input.quantidadeReal);
    if (real.equals(produto.estoqueAtual)) {
      throw new BusinessException(
        'AJUSTE_SEM_DIFERENCA',
        'A quantidade real é igual ao estoque atual.',
        {
          status: 400,
          details: [
            { field: 'quantidadeReal', message: 'A quantidade real é igual ao estoque atual.' },
          ],
        },
      );
    }
    const { count } = await this.txHost.tx.produto.updateMany({
      where: { id: produto.id, estoqueAtual: produto.estoqueAtual },
      data: { estoqueAtual: real },
    });
    if (count === 0) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        'O estoque do produto mudou durante o ajuste. Tente novamente.',
        { status: 409 },
      );
    }
    return this.registrar({
      produtoId: produto.id,
      tipo: 'AJUSTE',
      quantidade: real.sub(produto.estoqueAtual).abs(),
      saldoAnterior: produto.estoqueAtual,
      saldoPosterior: real,
      motivo: input.motivo,
    });
  }

  /**
   * Entrada (`ENTRADA`) ou estorno (`ESTORNO`, ao cancelar, excluir ou editar) dos itens de uma
   * compra recebida, só nos produtos que controlam estoque. Chamado pelo `ComprasService`.
   */
  async movimentarCompra(
    compra: CompraEstoque,
    itens: readonly ItemCompraEstoque[],
    operacao: 'ENTRADA' | 'ESTORNO',
  ): Promise<void> {
    const referencia = compra.numeroNf ? `NF ${compra.numeroNf}` : `#${compra.numero}`;
    for (const item of itens) {
      const sinal = operacao === 'ENTRADA' ? 1 : -1;
      const { count } = await this.txHost.tx.produto.updateMany({
        where: { id: item.produtoId, controlaEstoque: true },
        data: { estoqueAtual: { [sinal === 1 ? 'increment' : 'decrement']: item.quantidade } },
      });
      if (count === 0) continue;
      const posterior = (
        await this.txHost.tx.produto.findUniqueOrThrow({
          where: { id: item.produtoId },
          select: { estoqueAtual: true },
        })
      ).estoqueAtual;
      await this.registrar({
        produtoId: item.produtoId,
        tipo: operacao === 'ENTRADA' ? 'ENTRADA' : 'SAIDA',
        quantidade: item.quantidade,
        saldoAnterior: posterior.sub(item.quantidade.mul(sinal)),
        saldoPosterior: posterior,
        motivo:
          operacao === 'ENTRADA'
            ? `Entrada por compra ${referencia}`
            : `Estorno da compra ${referencia}`,
        documento: compra.numeroNf,
        custoUnitario: item.valorUnitario,
        fornecedorId: compra.fornecedorId,
        compraId: compra.id,
      });
    }
  }

  // --- Internos ---

  private async buscarControlado(id: string) {
    const produto = await this.txHost.tx.produto.findFirst({ where: { id, ...PRODUTOS } });
    if (!produto) {
      throw new BusinessException(ErrorCode.NOT_FOUND, 'Produto não encontrado', { status: 404 });
    }
    if (!produto.controlaEstoque) {
      throw new BusinessException(
        'ESTOQUE_NAO_CONTROLADO',
        'Este produto não controla estoque. Ative o controle em Produtos/Serviços.',
        {
          status: 400,
          details: [{ field: 'produtoId', message: 'Este produto não controla estoque.' }],
        },
      );
    }
    return produto;
  }

  private async somar(produtoId: string, quantidade: number) {
    const { estoqueAtual } = await this.txHost.tx.produto.update({
      where: { id: produtoId },
      data: { estoqueAtual: { increment: quantidade } },
      select: { estoqueAtual: true },
    });
    return { anterior: estoqueAtual.sub(quantidade), posterior: estoqueAtual };
  }

  private async registrar(
    dados: Omit<Prisma.MovimentacaoEstoqueUncheckedCreateInput, 'usuarioId'>,
  ): Promise<MovimentacaoEstoque> {
    const movimentacao = await this.txHost.tx.movimentacaoEstoque.create({
      data: { ...dados, usuarioId: this.contexto.getUserId() ?? null },
      include: INCLUDE_MOVIMENTACAO,
    });
    return this.toMovimentacao(movimentacao);
  }

  /** Produto controlado, com mínimo definido e saldo ≤ mínimo. */
  private filtroAbaixoMinimo(): Prisma.ProdutoWhereInput {
    return filtroAbaixoMinimo(this.txHost.tx.produto.fields.estoqueMinimo);
  }

  private wherePosicao(
    query: Pick<ListPosicaoQuery, 'search' | 'status' | 'categoriaId'>,
  ): Prisma.ProdutoWhereInput {
    const minimo = this.txHost.tx.produto.fields.estoqueMinimo;
    const porStatus: Record<NonNullable<ListPosicaoQuery['status']>, Prisma.ProdutoWhereInput> = {
      ZERADO: { controlaEstoque: true, estoqueAtual: { lte: 0 } },
      BAIXO: {
        controlaEstoque: true,
        estoqueMinimo: { gt: 0 },
        AND: [{ estoqueAtual: { gt: 0 } }, { estoqueAtual: { lte: minimo } }],
      },
      OK: {
        controlaEstoque: true,
        estoqueAtual: { gt: 0 },
        OR: [{ estoqueMinimo: { lte: 0 } }, { estoqueAtual: { gt: minimo } }],
      },
    };
    const filtros: Prisma.ProdutoWhereInput[] = [PRODUTOS];
    if (query.categoriaId) filtros.push({ categoriaId: query.categoriaId });
    if (query.status) filtros.push(porStatus[query.status]);
    const busca = searchWhere(query.search, ['nome', 'sku', 'codigoBarras']);
    if (busca) filtros.push(busca);
    return { AND: filtros };
  }

  private orderByPosicao(sort: ListPosicaoQuery['sort']): Prisma.ProdutoOrderByWithRelationInput[] {
    const { field, direction } = sort;
    const principal: Record<typeof field, Prisma.ProdutoOrderByWithRelationInput> = {
      produto: { nome: direction },
      sku: { sku: { sort: direction, nulls: 'last' } },
      categoria: { categoria: { nome: direction } },
      estoqueAtual: { estoqueAtual: direction },
      estoqueMinimo: { estoqueMinimo: direction },
    };
    return [principal[field], { nome: 'asc' }, { id: 'asc' }];
  }

  private whereMovimentacoes(query: ListMovimentacoesQuery): Prisma.MovimentacaoEstoqueWhereInput {
    const filtros: Prisma.MovimentacaoEstoqueWhereInput[] = [];
    if (query.tipo) filtros.push({ tipo: query.tipo });
    if (query.de || query.ate) {
      const { gte, lt } = intervaloDoPeriodo(query.de ?? '1900-01-01', query.ate ?? '9999-12-30');
      filtros.push({ createdAt: { ...(query.de && { gte }), ...(query.ate && { lt }) } });
    }
    const busca = searchWhere(query.search, ['nome', 'sku', 'codigoBarras']);
    if (busca) filtros.push({ produto: busca });
    return { AND: filtros };
  }

  private orderByMovimentacoes(
    sort: ListMovimentacoesQuery['sort'],
  ): Prisma.MovimentacaoEstoqueOrderByWithRelationInput[] {
    const { field, direction } = sort;
    const principal: Record<typeof field, Prisma.MovimentacaoEstoqueOrderByWithRelationInput> = {
      data: { createdAt: direction },
      produto: { produto: { nome: direction } },
      tipo: { tipo: direction },
      quantidade: { quantidade: direction },
    };
    return [principal[field], { createdAt: 'desc' }, { id: 'desc' }];
  }

  private async calcularSugestoes(
    query: Pick<ListSugestaoQuery, 'search' | 'categoriaId' | 'prioridade' | 'sort'>,
    agora: Date,
  ): Promise<SugestaoCompra[]> {
    const produtos = await this.txHost.tx.produto.findMany({
      where: {
        AND: [
          this.wherePosicao({ search: query.search, categoriaId: query.categoriaId }),
          { controlaEstoque: true },
        ],
      },
      include: INCLUDE_POSICAO,
    });
    const ids = produtos.map((p) => p.id);
    const [saidas, ultimasCompras] = await Promise.all([
      this.saidasNaJanela(ids, agora),
      this.ultimasCompras(ids),
    ]);

    const sugestoes = produtos.map((p): SugestaoCompra => {
      const calculo = calcularSugestao(
        p.estoqueAtual.toNumber(),
        p.estoqueMinimo.toNumber(),
        saidas.get(p.id) ?? 0,
      );
      const ultima = ultimasCompras.get(p.id);
      const custo = ultima?.valorUnitario ?? p.precoCusto;
      return {
        id: p.id,
        nome: p.nome,
        sku: p.sku,
        categoriaNome: p.categoria?.nome ?? null,
        prioridade: calculo.prioridade,
        estoqueAtual: p.estoqueAtual.toString(),
        estoqueMinimo: p.estoqueMinimo.toString(),
        qtdSugerida: calculo.qtdSugerida,
        diasParaAcabar: calculo.diasParaAcabar,
        custoUnitario: custo ? custo.toDecimalPlaces(2).toString() : null,
        custoTotal: custo ? custo.mul(calculo.qtdSugerida).toDecimalPlaces(2).toString() : null,
        fornecedorNome: ultima?.compra.fornecedor.nome ?? null,
      };
    });

    const filtradas = query.prioridade
      ? sugestoes.filter((s) => s.prioridade === query.prioridade)
      : sugestoes;
    return filtradas.sort(compararSugestoes(query.sort));
  }

  /** Saídas (manuais e de outras telas; não os estornos de compra) por produto, na janela. */
  private async saidasNaJanela(ids: string[], agora: Date): Promise<Map<string, number>> {
    if (ids.length === 0) return new Map();
    const grupos = await this.txHost.tx.movimentacaoEstoque.groupBy({
      by: ['produtoId'],
      where: {
        produtoId: { in: ids },
        tipo: 'SAIDA',
        compraId: null,
        createdAt: { gte: new Date(agora.getTime() - SUGESTAO_JANELA_DIAS * DIA_MS) },
      },
      _sum: { quantidade: true },
    });
    return new Map(grupos.map((g) => [g.produtoId, g._sum.quantidade?.toNumber() ?? 0]));
  }

  /** Último item de compra recebida de cada produto (custo e fornecedor da sugestão). */
  private async ultimasCompras(ids: string[]) {
    if (ids.length === 0) return new Map();
    const itens = await this.txHost.tx.compraItem.findMany({
      where: { produtoId: { in: ids }, compra: { status: 'RECEBIDA', deletedAt: null } },
      orderBy: [{ compra: { dataEntrada: 'desc' } }, { createdAt: 'desc' }],
      distinct: ['produtoId'],
      include: { compra: { select: { fornecedor: { select: { nome: true } } } } },
    });
    return new Map(itens.map((i) => [i.produtoId, i]));
  }

  private async toPosicoes(produtos: readonly ProdutoPosicao[]): Promise<PosicaoEstoque[]> {
    const ultimas = produtos.length
      ? await this.txHost.tx.movimentacaoEstoque.groupBy({
          by: ['produtoId'],
          where: { produtoId: { in: produtos.map((p) => p.id) } },
          _max: { createdAt: true },
        })
      : [];
    const ultimaPorProduto = new Map(ultimas.map((u) => [u.produtoId, u._max.createdAt]));
    return produtos.map((p) => {
      const saldo = {
        controlaEstoque: p.controlaEstoque,
        estoqueAtual: p.estoqueAtual.toNumber(),
        estoqueMinimo: p.estoqueMinimo.toNumber(),
      };
      return {
        id: p.id,
        nome: p.nome,
        descricao: p.descricao,
        sku: p.sku,
        categoriaNome: p.categoria?.nome ?? null,
        controlaEstoque: p.controlaEstoque,
        estoqueAtual: p.estoqueAtual.toString(),
        estoqueMinimo: p.estoqueMinimo.toString(),
        status: statusEstoque(saldo),
        valorEstoque: p.precoCusto
          ? p.estoqueAtual.mul(p.precoCusto).toDecimalPlaces(2).toString()
          : null,
        ultimaMovimentacao: ultimaPorProduto.get(p.id)?.toISOString() ?? null,
      };
    });
  }

  private toMovimentacao(m: MovimentacaoComRelacoes): MovimentacaoEstoque {
    return {
      id: m.id,
      data: m.createdAt.toISOString(),
      tipo: m.tipo,
      produtoId: m.produtoId,
      produtoNome: m.produto.nome,
      produtoSku: m.produto.sku,
      quantidade: m.quantidade.toString(),
      saldoAnterior: m.saldoAnterior?.toString() ?? null,
      saldoPosterior: m.saldoPosterior?.toString() ?? null,
      motivo: m.motivo,
      documento: m.documento,
      custoUnitario: m.custoUnitario?.toString() ?? null,
      lote: m.lote,
      validade: m.validade ? m.validade.toISOString().slice(0, 10) : null,
      fornecedorId: m.fornecedorId,
      fornecedorNome: m.fornecedor?.nome ?? null,
      compraId: m.compraId,
      usuarioId: m.usuarioId,
    };
  }
}

type ValorOrdenavel = number | string | null;

function compararSugestoes(sort: ListSugestaoQuery['sort']) {
  const valor = (s: SugestaoCompra): ValorOrdenavel => {
    switch (sort.field) {
      case 'prioridade':
        return ORDEM_PRIORIDADE[s.prioridade];
      case 'produto':
        return s.nome.toLocaleLowerCase('pt-BR');
      case 'estoqueAtual':
        return Number(s.estoqueAtual);
      case 'qtdSugerida':
        return s.qtdSugerida;
      case 'diasParaAcabar':
        return s.diasParaAcabar;
      case 'custoTotal':
        return s.custoTotal === null ? null : Number(s.custoTotal);
    }
  };
  const fator = sort.direction === 'asc' ? 1 : -1;
  return (a: SugestaoCompra, b: SugestaoCompra): number => {
    const va = valor(a);
    const vb = valor(b);
    // Vazios sempre no fim; empate pelo nome do produto.
    if (va !== vb) {
      if (va === null) return 1;
      if (vb === null) return -1;
      return (va < vb ? -1 : 1) * fator;
    }
    return a.nome.localeCompare(b.nome, 'pt-BR') || a.id.localeCompare(b.id);
  };
}
