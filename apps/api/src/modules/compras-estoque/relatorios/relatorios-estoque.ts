import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import type { FiltroRelatorio, Sort } from '@torres/shared';
import { LOTE_DIAS_VENCENDO } from '@torres/shared';
import type { Prisma } from '../../../generated/prisma/client';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import {
  definirRelatorio,
  type ColunaRelatorioDef,
  type ConsultaRelatorio,
  type ProvedorRelatorios,
  type ReportDefinition,
} from '../../../common/relatorios/relatorio.types';
import { ordenarEPaginar } from '../../comercial-atendimento/relatorios/relatorios-comercial';
import { hojeNaClinica } from '../../comercial-atendimento/pacotes/pacotes.service';

export const SEM_CATEGORIA = 'Sem categoria';

/** Meses da média de consumo do EST-13 e dias da média do EST-14 (inferência a confirmar com o dev). */
export const DIAS_MEDIA_CONSUMO = 90;
export const COBERTURA_PADRAO_DIAS = 30;
/** Limites da curva ABC (EST-10): A até 80% do valor acumulado, B até 95%, C o restante. */
export const LIMITE_CLASSE_A = 80;
export const LIMITE_CLASSE_B = 95;

const DIA_MS = 86_400_000;

const FILTRO_AGRUPAR: FiltroRelatorio = {
  tipo: 'select',
  parametro: 'agrupar',
  rotulo: 'Agrupar por',
  opcoes: [
    { valor: 'produto', rotulo: 'Produto' },
    { valor: 'categoria', rotulo: 'Categoria' },
  ],
};

const FILTRO_COBERTURA: FiltroRelatorio = {
  tipo: 'select',
  parametro: 'cobertura',
  rotulo: 'Cobertura desejada',
  opcoes: [15, 30, 60, 90].map((d) => ({ valor: String(d), rotulo: `${d} dias` })),
};

export interface LinhaLote {
  produto: string;
  lote: string;
  vencimento: Date;
  diasParaVencer: number;
  quantidade: number;
}

export interface LinhaPerdaValidade {
  produto: string;
  lote: string;
  vencimento: Date;
  quantidade: number;
  custoUnitario: number;
  valorPerdido: number;
}

export interface LinhaPosicao {
  produto: string;
  categoria: string;
  unidade: string | null;
  saldo: number;
  estoqueMinimo: number;
  custoUnitario: number;
  valorEmEstoque: number;
}

export interface LinhaAbaixoMinimo {
  produto: string;
  categoria: string;
  saldo: number;
  estoqueMinimo: number;
  falta: number;
}

export interface LinhaMovimentacao {
  data: Date;
  produto: string;
  tipo: string;
  quantidade: number;
  saldoAnterior: number | null;
  saldoPosterior: number | null;
  motivo: string | null;
  documento: string | null;
}

export interface LinhaComprasFornecedor {
  fornecedor: string;
  compras: number;
  valor: number;
  ticketMedio: number;
}

export interface LinhaComprasProduto {
  produto: string;
  quantidade: number;
  valor: number;
  custoMedio: number;
}

export interface LinhaCurvaAbc {
  produto: string;
  valor: number;
  participacao: number;
  acumulado: number;
  classe: 'A' | 'B' | 'C';
}

export interface LinhaSemMovimentacao {
  produto: string;
  categoria: string;
  saldo: number;
  ultimaMovimentacao: Date | null;
}

export interface LinhaEvolucaoCompras {
  mes: string;
  compras: number;
  valor: number;
  variacao: number | null;
}

export interface LinhaConsumo {
  item: string;
  categoria: string;
  consumo: number;
  mediaEsperada: number;
  variacao: number | null;
}

export interface LinhaPrevisaoCompra {
  produto: string;
  saldo: number;
  consumoDiario: number;
  diasDeEstoque: number | null;
  necessidade: number;
  sugestao: number;
}

const num = (valor: { toNumber(): number } | null | undefined): number => valor?.toNumber() ?? 0;
const arredondar = (valor: number, casas = 2): number => {
  const fator = 10 ** casas;
  return Math.round(valor * fator) / fator;
};
const percentual = (parte: number, total: number): number =>
  total === 0 ? 0 : arredondar((parte / total) * 100, 1);

/** `AAAA-MM-DD` como data de calendário (UTC), para as colunas `@db.Date`. */
const diaUtc = (data: string): Date => new Date(`${data}T00:00:00Z`);
const somarDias = (data: string, dias: number): string =>
  new Date(diaUtc(data).getTime() + dias * DIA_MS).toISOString().slice(0, 10);
const diasEntre = (de: Date, ate: Date): number =>
  Math.round((ate.getTime() - de.getTime()) / DIA_MS);

const coluna = <T>(
  key: keyof T & string,
  header: string,
  extra: Partial<ColunaRelatorioDef<T>> = {},
): ColunaRelatorioDef<T> => ({
  key,
  header,
  value: (linha) => linha[key] as never,
  ordenavel: true,
  ...extra,
});

/**
 * Relatórios da tela Relatórios de Estoque (`/estoque/relatorios`): EST-01, EST-04 a EST-14.
 * EST-02 (Ruptura vs Agenda) e EST-03 (Giro por Protocolo) aguardam a regra do dev: o schema não
 * liga agendamento nem atendimento a protocolo ou produto (ver a descrição do PR da #25).
 * Cada relatório lê os dados do próprio módulo e traz sempre o nome do produto (falha C7).
 */
@Injectable()
export class RelatoriosEstoque implements ProvedorRelatorios {
  readonly relatorios: readonly ReportDefinition[];

  constructor(private readonly txHost: TransactionHost<PrismaAdapter>) {
    this.relatorios = [
      this.vencimentoProximo(),
      this.perdaPorValidade(),
      this.posicaoDeEstoque(),
      this.abaixoDoMinimo(),
      this.movimentacao(),
      this.comprasPorFornecedor(),
      this.comprasPorProduto(),
      this.curvaAbc(),
      this.semMovimentacao(),
      this.evolucaoDeCompras(),
      this.consumoPorProduto(),
      this.previsaoDeCompras(),
    ];
  }

  /** Lotes (não excluídos, com saldo) com vencimento no período. */
  private lotes(consulta: ConsultaRelatorio, vencimento: Prisma.DateTimeFilter) {
    return this.txHost.tx.lote.findMany({
      where: {
        deletedAt: null,
        quantidade: { gt: 0 },
        produto: { deletedAt: null },
        dataVencimento: {
          gte: diaUtc(consulta.periodo.de),
          lte: diaUtc(consulta.periodo.ate),
          ...vencimento,
        },
      },
      include: { produto: { select: { nome: true, precoCusto: true } } },
    });
  }

  /** EST-01: lotes que vencem nos próximos 60 dias (a mesma janela do status "Vencendo"). */
  async linhasVencimento(
    consulta: ConsultaRelatorio,
    hoje = hojeNaClinica(),
  ): Promise<LinhaLote[]> {
    const lotes = await this.lotes(consulta, {
      gte: diaUtc(consulta.periodo.de) > diaUtc(hoje) ? diaUtc(consulta.periodo.de) : diaUtc(hoje),
      lte: [diaUtc(consulta.periodo.ate), diaUtc(somarDias(hoje, LOTE_DIAS_VENCENDO))].reduce(
        (a, b) => (a < b ? a : b),
      ),
    });
    return lotes.map((l) => ({
      produto: l.produto.nome,
      lote: l.numero,
      vencimento: l.dataVencimento,
      diasParaVencer: diasEntre(diaUtc(hoje), l.dataVencimento),
      quantidade: num(l.quantidade),
    }));
  }

  /** EST-04: lotes já vencidos (vencimento no período e antes de hoje), com o custo perdido. */
  async linhasPerdaValidade(
    consulta: ConsultaRelatorio,
    hoje = hojeNaClinica(),
  ): Promise<LinhaPerdaValidade[]> {
    const ate = diaUtc(consulta.periodo.ate);
    const ontem = diaUtc(somarDias(hoje, -1));
    const lotes = await this.lotes(consulta, { lte: ate < ontem ? ate : ontem });
    return lotes.map((l) => {
      const custoUnitario = num(l.produto.precoCusto);
      return {
        produto: l.produto.nome,
        lote: l.numero,
        vencimento: l.dataVencimento,
        quantidade: num(l.quantidade),
        custoUnitario,
        valorPerdido: arredondar(num(l.quantidade) * custoUnitario),
      };
    });
  }

  private produtosControlados() {
    return this.txHost.tx.produto.findMany({
      where: { deletedAt: null, ativo: true, controlaEstoque: true, tipo: { not: 'SERVICO' } },
      include: {
        categoria: { select: { nome: true } },
        unidadeMedida: { select: { sigla: true } },
      },
    });
  }

  /** EST-05: foto do saldo de hoje (o período não se aplica). */
  async linhasPosicao(): Promise<LinhaPosicao[]> {
    const produtos = await this.produtosControlados();
    return produtos.map((p) => {
      const custoUnitario = num(p.precoCusto);
      return {
        produto: p.nome,
        categoria: p.categoria?.nome ?? SEM_CATEGORIA,
        unidade: p.unidadeMedida?.sigla ?? null,
        saldo: num(p.estoqueAtual),
        estoqueMinimo: num(p.estoqueMinimo),
        custoUnitario,
        valorEmEstoque: arredondar(num(p.estoqueAtual) * custoUnitario),
      };
    });
  }

  /** EST-06: produtos com saldo abaixo do mínimo (foto de hoje). */
  async linhasAbaixoMinimo(): Promise<LinhaAbaixoMinimo[]> {
    const produtos = await this.produtosControlados();
    return produtos
      .filter((p) => num(p.estoqueAtual) < num(p.estoqueMinimo))
      .map((p) => ({
        produto: p.nome,
        categoria: p.categoria?.nome ?? SEM_CATEGORIA,
        saldo: num(p.estoqueAtual),
        estoqueMinimo: num(p.estoqueMinimo),
        falta: arredondar(num(p.estoqueMinimo) - num(p.estoqueAtual), 3),
      }));
  }

  private ordemMovimentacao(
    sort: Sort | undefined,
  ): Prisma.MovimentacaoEstoqueOrderByWithRelationInput {
    const direcao = sort?.direction ?? 'desc';
    switch (sort?.field) {
      case 'produto':
        return { produto: { nome: direcao } };
      case 'tipo':
      case 'quantidade':
        return { [sort.field]: direcao };
      default:
        return { createdAt: direcao };
    }
  }

  /** EST-07: movimentações do período, paginadas no banco (a tabela só cresce). */
  async linhasMovimentacao(
    { intervalo, sort }: ConsultaRelatorio,
    pagina?: { skip: number; take: number },
  ): Promise<LinhaMovimentacao[]> {
    const movimentacoes = await this.txHost.tx.movimentacaoEstoque.findMany({
      where: { createdAt: intervalo },
      include: { produto: { select: { nome: true } } },
      orderBy: [this.ordemMovimentacao(sort), { id: 'asc' }],
      ...(pagina ? { skip: pagina.skip, take: pagina.take } : {}),
    });
    return movimentacoes.map((m) => ({
      data: m.createdAt,
      produto: m.produto.nome,
      tipo: m.tipo,
      quantidade: num(m.quantidade),
      saldoAnterior: m.saldoAnterior ? num(m.saldoAnterior) : null,
      saldoPosterior: m.saldoPosterior ? num(m.saldoPosterior) : null,
      motivo: m.motivo,
      documento: m.documento,
    }));
  }

  private comprasRecebidas({ periodo }: ConsultaRelatorio): Prisma.CompraWhereInput {
    return {
      deletedAt: null,
      status: 'RECEBIDA',
      dataEntrada: { gte: diaUtc(periodo.de), lte: diaUtc(periodo.ate) },
    };
  }

  /** EST-08: compras recebidas no período, por fornecedor. */
  async linhasComprasFornecedor(consulta: ConsultaRelatorio): Promise<LinhaComprasFornecedor[]> {
    const grupos = await this.txHost.tx.compra.groupBy({
      by: ['fornecedorId'],
      where: this.comprasRecebidas(consulta),
      _count: { _all: true },
      _sum: { valorTotal: true },
    });
    const fornecedores = await this.txHost.tx.fornecedor.findMany({
      where: { id: { in: grupos.map((g) => g.fornecedorId) } },
      select: { id: true, nome: true },
    });
    const nomes = new Map(fornecedores.map((f) => [f.id, f.nome]));
    return grupos.map((g) => {
      const valor = num(g._sum.valorTotal);
      return {
        fornecedor: nomes.get(g.fornecedorId) ?? 'Fornecedor removido',
        compras: g._count._all,
        valor,
        ticketMedio: arredondar(valor / g._count._all),
      };
    });
  }

  /** Itens das compras recebidas no período somados por produto. */
  private async itensPorProduto(consulta: ConsultaRelatorio) {
    const itens = await this.txHost.tx.compraItem.findMany({
      where: { compra: this.comprasRecebidas(consulta) },
      select: { produtoId: true, quantidade: true, valorUnitario: true },
    });
    const porProduto = new Map<string, { quantidade: number; valor: number }>();
    for (const item of itens) {
      const atual = porProduto.get(item.produtoId) ?? { quantidade: 0, valor: 0 };
      atual.quantidade += num(item.quantidade);
      atual.valor += num(item.quantidade) * num(item.valorUnitario);
      porProduto.set(item.produtoId, atual);
    }
    const nomes = await this.nomesProdutos([...porProduto.keys()]);
    return [...porProduto].map(([id, total]) => ({
      produto: nomes.get(id) ?? 'Produto removido',
      quantidade: arredondar(total.quantidade, 3),
      valor: arredondar(total.valor),
    }));
  }

  private async nomesProdutos(ids: readonly string[]): Promise<Map<string, string>> {
    const produtos = await this.txHost.tx.produto.findMany({
      where: { id: { in: [...ids] } },
      select: { id: true, nome: true },
    });
    return new Map(produtos.map((p) => [p.id, p.nome]));
  }

  /** EST-09: compras recebidas no período, por produto. */
  async linhasComprasProduto(consulta: ConsultaRelatorio): Promise<LinhaComprasProduto[]> {
    const itens = await this.itensPorProduto(consulta);
    return itens.map((i) => ({
      ...i,
      custoMedio: i.quantidade === 0 ? 0 : arredondar(i.valor / i.quantidade),
    }));
  }

  /** EST-10: curva ABC pelo valor comprado no período (A até 80%, B até 95%, C o restante). */
  async linhasCurvaAbc(consulta: ConsultaRelatorio): Promise<LinhaCurvaAbc[]> {
    const itens = (await this.itensPorProduto(consulta)).sort((a, b) => b.valor - a.valor);
    const total = itens.reduce((soma, i) => soma + i.valor, 0);
    let acumulado = 0;
    return itens.map((i) => {
      const antes = percentual(acumulado, total);
      acumulado += i.valor;
      const classe = antes < LIMITE_CLASSE_A ? 'A' : antes < LIMITE_CLASSE_B ? 'B' : 'C';
      return {
        produto: i.produto,
        valor: i.valor,
        participacao: percentual(i.valor, total),
        acumulado: percentual(acumulado, total),
        classe,
      };
    });
  }

  /** EST-11: produtos controlados e ativos sem nenhuma movimentação no período. */
  async linhasSemMovimentacao({ intervalo }: ConsultaRelatorio): Promise<LinhaSemMovimentacao[]> {
    const movimentados = await this.txHost.tx.movimentacaoEstoque.groupBy({
      by: ['produtoId'],
      where: { createdAt: intervalo },
    });
    const ids = new Set(movimentados.map((m) => m.produtoId));
    const produtos = (await this.produtosControlados()).filter((p) => !ids.has(p.id));
    const ultimas = await this.txHost.tx.movimentacaoEstoque.groupBy({
      by: ['produtoId'],
      where: { produtoId: { in: produtos.map((p) => p.id) } },
      _max: { createdAt: true },
    });
    const ultimaPorProduto = new Map(ultimas.map((u) => [u.produtoId, u._max.createdAt]));
    return produtos.map((p) => ({
      produto: p.nome,
      categoria: p.categoria?.nome ?? SEM_CATEGORIA,
      saldo: num(p.estoqueAtual),
      ultimaMovimentacao: ultimaPorProduto.get(p.id) ?? null,
    }));
  }

  /** EST-12: valor comprado por mês (pela data de entrada), com a variação sobre o mês anterior. */
  async linhasEvolucaoCompras(consulta: ConsultaRelatorio): Promise<LinhaEvolucaoCompras[]> {
    const compras = await this.txHost.tx.compra.findMany({
      where: this.comprasRecebidas(consulta),
      select: { dataEntrada: true, valorTotal: true },
    });
    const porMes = new Map<string, { compras: number; valor: number }>();
    for (const compra of compras) {
      const mes = compra.dataEntrada.toISOString().slice(0, 7);
      const atual = porMes.get(mes) ?? { compras: 0, valor: 0 };
      atual.compras += 1;
      atual.valor += num(compra.valorTotal);
      porMes.set(mes, atual);
    }
    const meses = [...porMes].sort(([a], [b]) => a.localeCompare(b));
    return meses.map(([mes, total], i) => {
      const anterior = meses[i - 1]?.[1].valor ?? 0;
      const variacao =
        anterior > 0 ? arredondar(((total.valor - anterior) / anterior) * 100, 1) : null;
      return { mes, compras: total.compras, valor: arredondar(total.valor), variacao };
    });
  }

  /** Saídas de estoque por produto no intervalo. */
  private async saidasPorProduto(intervalo: { gte: Date; lt: Date }): Promise<Map<string, number>> {
    const grupos = await this.txHost.tx.movimentacaoEstoque.groupBy({
      by: ['produtoId'],
      where: { tipo: 'SAIDA', createdAt: intervalo },
      _sum: { quantidade: true },
    });
    return new Map(grupos.map((g) => [g.produtoId, num(g._sum.quantidade)]));
  }

  /**
   * EST-13: consumo (saídas) do período, por produto ou categoria, contra o esperado pela média
   * diária dos {@link DIAS_MEDIA_CONSUMO} dias anteriores ao início do período.
   */
  async linhasConsumo({ intervalo, periodo, filtros }: ConsultaRelatorio): Promise<LinhaConsumo[]> {
    const anteriores = {
      gte: new Date(intervalo.gte.getTime() - DIAS_MEDIA_CONSUMO * DIA_MS),
      lt: intervalo.gte,
    };
    const [atual, base] = await Promise.all([
      this.saidasPorProduto(intervalo),
      this.saidasPorProduto(anteriores),
    ]);
    const ids = [...new Set([...atual.keys(), ...base.keys()])];
    const produtos = await this.txHost.tx.produto.findMany({
      where: { id: { in: ids } },
      select: { id: true, nome: true, categoria: { select: { nome: true } } },
    });
    const diasPeriodo = diasEntre(diaUtc(periodo.de), diaUtc(periodo.ate)) + 1;
    const porCategoria = filtros.agrupar === 'categoria';
    const agrupado = new Map<string, LinhaConsumo>();
    for (const p of produtos) {
      const categoria = p.categoria?.nome ?? SEM_CATEGORIA;
      const chave = porCategoria ? categoria : p.nome;
      const linha = agrupado.get(chave) ?? {
        item: chave,
        categoria,
        consumo: 0,
        mediaEsperada: 0,
        variacao: null,
      };
      linha.consumo += atual.get(p.id) ?? 0;
      linha.mediaEsperada += ((base.get(p.id) ?? 0) / DIAS_MEDIA_CONSUMO) * diasPeriodo;
      agrupado.set(chave, linha);
    }
    return [...agrupado.values()].map((l) => ({
      ...l,
      consumo: arredondar(l.consumo, 3),
      mediaEsperada: arredondar(l.mediaEsperada, 3),
      variacao:
        l.mediaEsperada > 0
          ? arredondar(((l.consumo - l.mediaEsperada) / l.mediaEsperada) * 100, 1)
          : null,
    }));
  }

  /**
   * EST-14: sugestão de compra de hoje. Consumo diário = saídas dos últimos
   * {@link DIAS_MEDIA_CONSUMO} dias ÷ esses dias; necessidade = consumo diário × cobertura − saldo.
   * O período da tela não se aplica.
   */
  async linhasPrevisao(
    { filtros }: ConsultaRelatorio,
    agora = new Date(),
  ): Promise<LinhaPrevisaoCompra[]> {
    const cobertura = Number(filtros.cobertura ?? COBERTURA_PADRAO_DIAS);
    const saidas = await this.saidasPorProduto({
      gte: new Date(agora.getTime() - DIAS_MEDIA_CONSUMO * DIA_MS),
      lt: agora,
    });
    const produtos = await this.produtosControlados();
    return produtos.flatMap((p) => {
      const consumoDiario = (saidas.get(p.id) ?? 0) / DIAS_MEDIA_CONSUMO;
      const saldo = num(p.estoqueAtual);
      const necessidade = Math.max(0, consumoDiario * cobertura - saldo);
      if (necessidade <= 0) return [];
      return [
        {
          produto: p.nome,
          saldo,
          consumoDiario: arredondar(consumoDiario, 3),
          diasDeEstoque: consumoDiario > 0 ? arredondar(saldo / consumoDiario, 1) : null,
          necessidade: arredondar(necessidade, 3),
          sugestao: Math.ceil(necessidade),
        },
      ];
    });
  }

  private vencimentoProximo(): ReportDefinition {
    return definirRelatorio<LinhaLote>({
      id: 'EST-01',
      nome: 'Vencimento proximo (60 dias)',
      permissao: 'compras-estoque.lotes-validade.ver',
      colunas: [
        coluna('produto', 'Produto', { width: 3 }),
        coluna('lote', 'Lote'),
        coluna('vencimento', 'Vencimento', { type: 'date' }),
        coluna('diasParaVencer', 'Dias para vencer', { type: 'number' }),
        coluna('quantidade', 'Quantidade', { type: 'number' }),
      ],
      ordenacaoPadrao: 'vencimento:asc',
      buscar: async (c, p) => ordenarEPaginar(await this.linhasVencimento(c), c.sort, p),
      contar: async (c) => (await this.linhasVencimento(c)).length,
    });
  }

  private perdaPorValidade(): ReportDefinition {
    return definirRelatorio<LinhaPerdaValidade>({
      id: 'EST-04',
      nome: 'Perda por Validade',
      permissao: 'compras-estoque.lotes-validade.ver',
      colunas: [
        coluna('produto', 'Produto', { width: 3 }),
        coluna('lote', 'Lote'),
        coluna('vencimento', 'Vencimento', { type: 'date' }),
        coluna('quantidade', 'Quantidade', { type: 'number' }),
        coluna('custoUnitario', 'Custo unitário (R$)', { type: 'currency' }),
        coluna('valorPerdido', 'Valor perdido (R$)', { type: 'currency' }),
      ],
      ordenacaoPadrao: 'valorPerdido:desc',
      buscar: async (c, p) => ordenarEPaginar(await this.linhasPerdaValidade(c), c.sort, p),
      contar: async (c) => (await this.linhasPerdaValidade(c)).length,
    });
  }

  private posicaoDeEstoque(): ReportDefinition {
    return definirRelatorio<LinhaPosicao>({
      id: 'EST-05',
      nome: 'Posição de Estoque',
      permissao: 'compras-estoque.estoque.ver',
      colunas: [
        coluna('produto', 'Produto', { width: 3 }),
        coluna('categoria', 'Categoria', { width: 2 }),
        coluna('unidade', 'Unidade'),
        coluna('saldo', 'Saldo', { type: 'number' }),
        coluna('estoqueMinimo', 'Mínimo', { type: 'number' }),
        coluna('custoUnitario', 'Custo unitário (R$)', { type: 'currency' }),
        coluna('valorEmEstoque', 'Valor em estoque (R$)', { type: 'currency' }),
      ],
      ordenacaoPadrao: 'produto:asc',
      buscar: async (c, p) => ordenarEPaginar(await this.linhasPosicao(), c.sort, p),
      contar: async () => (await this.linhasPosicao()).length,
    });
  }

  private abaixoDoMinimo(): ReportDefinition {
    return definirRelatorio<LinhaAbaixoMinimo>({
      id: 'EST-06',
      nome: 'Estoque Abaixo do Mínimo',
      permissao: 'compras-estoque.estoque.ver',
      colunas: [
        coluna('produto', 'Produto', { width: 3 }),
        coluna('categoria', 'Categoria', { width: 2 }),
        coluna('saldo', 'Saldo', { type: 'number' }),
        coluna('estoqueMinimo', 'Mínimo', { type: 'number' }),
        coluna('falta', 'Falta', { type: 'number' }),
      ],
      ordenacaoPadrao: 'falta:desc',
      buscar: async (c, p) => ordenarEPaginar(await this.linhasAbaixoMinimo(), c.sort, p),
      contar: async () => (await this.linhasAbaixoMinimo()).length,
    });
  }

  private movimentacao(): ReportDefinition {
    return definirRelatorio<LinhaMovimentacao>({
      id: 'EST-07',
      nome: 'Movimentação de Estoque',
      permissao: 'compras-estoque.estoque.ver',
      colunas: [
        coluna('data', 'Data', { type: 'date' }),
        coluna('produto', 'Produto', { width: 3 }),
        coluna('tipo', 'Tipo'),
        coluna('quantidade', 'Quantidade', { type: 'number' }),
        coluna('saldoAnterior', 'Saldo anterior', { type: 'number', ordenavel: false }),
        coluna('saldoPosterior', 'Saldo posterior', { type: 'number', ordenavel: false }),
        coluna('motivo', 'Motivo', { width: 2, ordenavel: false }),
        coluna('documento', 'Documento', { ordenavel: false }),
      ],
      ordenacaoPadrao: 'data:desc',
      buscar: (c, p) => this.linhasMovimentacao(c, p),
      contar: ({ intervalo }) =>
        this.txHost.tx.movimentacaoEstoque.count({ where: { createdAt: intervalo } }),
    });
  }

  private comprasPorFornecedor(): ReportDefinition {
    return definirRelatorio<LinhaComprasFornecedor>({
      id: 'EST-08',
      nome: 'Compras por Fornecedor',
      permissao: 'compras-estoque.entrada-compras.ver',
      colunas: [
        coluna('fornecedor', 'Fornecedor', { width: 3 }),
        coluna('compras', 'Compras', { type: 'number' }),
        coluna('valor', 'Valor (R$)', { type: 'currency' }),
        coluna('ticketMedio', 'Ticket médio (R$)', { type: 'currency' }),
      ],
      ordenacaoPadrao: 'valor:desc',
      buscar: async (c, p) => ordenarEPaginar(await this.linhasComprasFornecedor(c), c.sort, p),
      contar: async (c) => (await this.linhasComprasFornecedor(c)).length,
    });
  }

  private comprasPorProduto(): ReportDefinition {
    return definirRelatorio<LinhaComprasProduto>({
      id: 'EST-09',
      nome: 'Compras por Produto',
      permissao: 'compras-estoque.entrada-compras.ver',
      colunas: [
        coluna('produto', 'Produto', { width: 3 }),
        coluna('quantidade', 'Quantidade', { type: 'number' }),
        coluna('valor', 'Valor (R$)', { type: 'currency' }),
        coluna('custoMedio', 'Custo médio (R$)', { type: 'currency' }),
      ],
      ordenacaoPadrao: 'valor:desc',
      buscar: async (c, p) => ordenarEPaginar(await this.linhasComprasProduto(c), c.sort, p),
      contar: async (c) => (await this.linhasComprasProduto(c)).length,
    });
  }

  private curvaAbc(): ReportDefinition {
    return definirRelatorio<LinhaCurvaAbc>({
      id: 'EST-10',
      nome: 'Curva ABC de Produtos',
      permissao: 'compras-estoque.entrada-compras.ver',
      colunas: [
        coluna('produto', 'Produto', { width: 3 }),
        coluna('valor', 'Valor comprado (R$)', { type: 'currency' }),
        coluna('participacao', 'Participação (%)', { type: 'number' }),
        coluna('acumulado', 'Acumulado (%)', { type: 'number' }),
        coluna('classe', 'Classe'),
      ],
      ordenacaoPadrao: 'valor:desc',
      buscar: async (c, p) => ordenarEPaginar(await this.linhasCurvaAbc(c), c.sort, p),
      contar: async (c) => (await this.linhasCurvaAbc(c)).length,
    });
  }

  private semMovimentacao(): ReportDefinition {
    return definirRelatorio<LinhaSemMovimentacao>({
      id: 'EST-11',
      nome: 'Produtos sem Movimentação',
      permissao: 'compras-estoque.estoque.ver',
      colunas: [
        coluna('produto', 'Produto', { width: 3 }),
        coluna('categoria', 'Categoria', { width: 2 }),
        coluna('saldo', 'Saldo', { type: 'number' }),
        coluna('ultimaMovimentacao', 'Última movimentação', { type: 'date' }),
      ],
      ordenacaoPadrao: 'produto:asc',
      buscar: async (c, p) => ordenarEPaginar(await this.linhasSemMovimentacao(c), c.sort, p),
      contar: async (c) => (await this.linhasSemMovimentacao(c)).length,
    });
  }

  private evolucaoDeCompras(): ReportDefinition {
    return definirRelatorio<LinhaEvolucaoCompras>({
      id: 'EST-12',
      nome: 'Evolução de Compras',
      permissao: 'compras-estoque.entrada-compras.ver',
      colunas: [
        coluna('mes', 'Mês'),
        coluna('compras', 'Compras', { type: 'number' }),
        coluna('valor', 'Valor (R$)', { type: 'currency' }),
        coluna('variacao', 'Variação (%)', { type: 'number', ordenavel: false }),
      ],
      ordenacaoPadrao: 'mes:asc',
      buscar: async (c, p) => ordenarEPaginar(await this.linhasEvolucaoCompras(c), c.sort, p),
      contar: async (c) => (await this.linhasEvolucaoCompras(c)).length,
    });
  }

  private consumoPorProduto(): ReportDefinition {
    return definirRelatorio<LinhaConsumo>({
      id: 'EST-13',
      nome: 'Consumo por Produto/Categoria',
      permissao: 'compras-estoque.estoque.ver',
      colunas: [
        coluna('item', 'Produto / Categoria', { width: 3 }),
        coluna('categoria', 'Categoria', { width: 2 }),
        coluna('consumo', 'Consumo', { type: 'number' }),
        coluna('mediaEsperada', `Esperado pela média de ${DIAS_MEDIA_CONSUMO} dias`, {
          type: 'number',
        }),
        coluna('variacao', 'Variação (%)', { type: 'number' }),
      ],
      ordenacaoPadrao: 'consumo:desc',
      filtros: [FILTRO_AGRUPAR],
      buscar: async (c, p) => ordenarEPaginar(await this.linhasConsumo(c), c.sort, p),
      contar: async (c) => (await this.linhasConsumo(c)).length,
    });
  }

  private previsaoDeCompras(): ReportDefinition {
    return definirRelatorio<LinhaPrevisaoCompra>({
      id: 'EST-14',
      nome: 'Previsão de Compras',
      permissao: 'compras-estoque.estoque.ver',
      colunas: [
        coluna('produto', 'Produto', { width: 3 }),
        coluna('saldo', 'Saldo', { type: 'number' }),
        coluna('consumoDiario', 'Consumo diário', { type: 'number' }),
        coluna('diasDeEstoque', 'Dias de estoque', { type: 'number' }),
        coluna('necessidade', 'Necessidade', { type: 'number' }),
        coluna('sugestao', 'Sugestão de compra', { type: 'number' }),
      ],
      ordenacaoPadrao: 'sugestao:desc',
      filtros: [FILTRO_COBERTURA],
      buscar: async (c, p) => ordenarEPaginar(await this.linhasPrevisao(c), c.sort, p),
      contar: async (c) => (await this.linhasPrevisao(c)).length,
    });
  }
}
