import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import type { ContaReceberStatus, FiltroRelatorio } from '@torres/shared';
import { EscopoDadosService, semPermissao } from '../../../common/auth/escopo-dados.service';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import {
  definirRelatorio,
  type ColunaRelatorioDef,
  type ConsultaRelatorio,
  type ProvedorRelatorios,
  type ReportDefinition,
} from '../../../common/relatorios/relatorio.types';
import { ordenarEPaginar } from '../../comercial-atendimento/relatorios/relatorios-comercial';
import { DO_TORRES, NAO_EXCLUIDAS } from '../conta-financeira';
import { hojeNaClinica } from '../inadimplencia/inadimplencia.service';
import {
  diasEmAtraso,
  diasEntre,
  saldoEmAberto,
  somarDias,
} from '../inadimplencia/inadimplencia.regras';

export const SEM_CLIENTE = 'Sem cliente';
export const SEM_CONTA = 'Sem conta contábil';
export const SEM_CENTRO_CUSTO = 'Sem centro de custo';
export const SEM_FORMA_PAGAMENTO = 'Sem forma de pagamento';
export const SEM_FORNECEDOR = 'Sem fornecedor';

/** Janela da média do relatório de despesas por centro de custo (decisão do dev: 90 dias). */
export const DIAS_MEDIA_DESPESA = 90;
/** "Da semana" no relatório semanal de contas a pagar: hoje e os 6 dias seguintes. */
export const DIAS_DA_SEMANA = 7;

/** Contas que valem como faturamento/despesa: as canceladas e as renegociadas ficam de fora. */
const VALIDAS: { notIn: ContaReceberStatus[] } = { notIn: ['CANCELADO', 'RENEGOCIADO'] };
const VALIDAS_PAGAR = { not: 'CANCELADO' } as const;

const ROTULO_STATUS: Readonly<Record<string, string>> = {
  PENDENTE: 'Pendente',
  RECEBIDO: 'Pago',
  PAGO: 'Pago',
  PARCIAL: 'Parcial',
  CANCELADO: 'Cancelado',
  RENEGOCIADO: 'Renegociado',
};
const rotuloStatus = (status: string): string => ROTULO_STATUS[status] ?? status;

const FILTRO_SITUACAO: FiltroRelatorio = {
  tipo: 'select',
  parametro: 'situacao',
  rotulo: 'Situação',
  opcoes: [
    { valor: 'vencidas', rotulo: 'Vencidas' },
    { valor: 'semana', rotulo: 'Da semana' },
    { valor: 'pendentes', rotulo: 'Pendentes' },
  ],
};

const FILTRO_TIPO_CONTA: FiltroRelatorio = {
  tipo: 'select',
  parametro: 'tipo',
  rotulo: 'Tipo',
  opcoes: [
    { valor: 'receita', rotulo: 'Receitas' },
    { valor: 'despesa', rotulo: 'Despesas' },
  ],
};

export interface LinhaInadimplencia {
  numero: number;
  cliente: string;
  descricao: string;
  vencimento: Date;
  diasAtraso: number;
  valor: number;
  saldo: number;
}

export interface LinhaFaturamentoDia {
  data: Date;
  titulos: number;
  valor: number;
}

export interface LinhaFormaPagamento {
  formaPagamento: string;
  recebimentos: number;
  valor: number;
  participacao: number;
}

export interface LinhaFaturamentoPaciente {
  paciente: string;
  titulos: number;
  valor: number;
}

export interface LinhaVencimento {
  tipo: 'Receber' | 'Pagar';
  vencimento: Date;
  descricao: string;
  valor: number;
  status: string;
}

export interface LinhaCentroCusto {
  centroCusto: string;
  valor: number;
  mediaPeriodo: number;
  variacao: number | null;
}

export interface LinhaExtratoPlano {
  data: Date;
  codigo: string;
  conta: string;
  descricao: string;
  valor: number;
  status: string;
}

export interface LinhaExtratoFornecedor {
  fornecedor: string;
  vencimento: Date;
  descricao: string;
  documento: string | null;
  valor: number;
  status: string;
}

export interface LinhaPagarDetalhado {
  numero: number;
  descricao: string;
  beneficiario: string;
  vencimento: Date;
  valor: number;
  pago: number;
  saldo: number;
  status: string;
}

export interface LinhaReceberDetalhado {
  numero: number;
  cliente: string;
  descricao: string;
  vencimento: Date;
  valor: number;
  recebido: number;
  saldo: number;
  status: string;
}

export interface LinhaReceitaTotal {
  mes: string;
  faturamento: number;
  recebido: number;
}

export interface LinhaDre {
  secao: 'Receitas' | 'Despesas' | 'Resultado';
  codigo: string;
  conta: string;
  valor: number;
}

export interface LinhaContaContabil {
  codigo: string;
  conta: string;
  tipo: string;
  lancamentos: number;
  valor: number;
}

export interface LinhaPagarSemanal {
  vencimento: Date;
  descricao: string;
  fornecedor: string;
  valor: number;
  situacao: 'Vencida' | 'Da semana' | 'Pendente';
}

const num = (valor: { toNumber(): number } | null | undefined): number => valor?.toNumber() ?? 0;
const arredondar = (valor: number): number => Math.round(valor * 100) / 100;
const percentual = (parte: number, total: number): number =>
  total === 0 ? 0 : Math.round((parte / total) * 1000) / 10;

/** `AAAA-MM-DD` como data de calendário (UTC), para as colunas `@db.Date`. */
const diaUtc = (data: string): Date => new Date(`${data}T00:00:00Z`);
const dia = (data: Date): string => data.toISOString().slice(0, 10);
const faixa = (de: string, ate: string) => ({ gte: diaUtc(de), lte: diaUtc(ate) });
const faixaDe = ({ periodo }: ConsultaRelatorio) => faixa(periodo.de, periodo.ate);

/** Competência (`AAAA-MM`) do vencimento: a do campo, ou o mês do vencimento quando não há. */
const mesDe = (data: Date): string => data.toISOString().slice(0, 7);

/**
 * Títulos da competência do período (DRE e conta contábil): o campo `competencia` dentro dos meses
 * de De a Até; sem competência, vale o mês do vencimento.
 */
function naCompetencia({ periodo }: ConsultaRelatorio) {
  return {
    OR: [
      { competencia: { gte: periodo.de.slice(0, 7), lte: periodo.ate.slice(0, 7) } },
      { competencia: null, dataVencimento: faixa(periodo.de, periodo.ate) },
    ],
  };
}

interface ContaDoExtrato {
  dataVencimento: Date;
  descricao: string;
  valor: { toNumber(): number };
  status: string;
  planoConta: { codigo: string; nome: string } | null;
}

/** Total de uma conta do plano (ou das sem conta): lançamentos e valor. */
interface TotalConta {
  planoContaId: string | null;
  lancamentos: number;
  valor: number;
}

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
 * Relatórios da tela Relatórios do Financeiro (`/financeiro/relatorios`).
 *
 * Do inventário saem os que têm dados no sistema: FIN-01, 06, 07, 10, 11, 12, 13, 14, 17, 19 e
 * 20. Ficam de fora, sem fonte de dados ou regra confirmada: FIN-02, 03 (definição), FIN-04,
 * FIN-05 (não há unidade nos títulos), FIN-08, FIN-09, FIN-15, FIN-16, FIN-18 e FIN-21 (#169).
 * Dos requisitos do cliente entram FIN-22 (receita total), FIN-23 (DRE por competência), FIN-24
 * (por conta contábil) e FIN-25 (contas a pagar semanal). A provisão de recebimentos é a #167.
 * Tudo é do caixa do coworking: as receitas dos profissionais ficam de fora (falha C8).
 */
@Injectable()
export class RelatoriosFinanceiro implements ProvedorRelatorios {
  readonly relatorios: readonly ReportDefinition[];

  constructor(
    private readonly txHost: TransactionHost<PrismaAdapter>,
    private readonly escopo: EscopoDadosService,
  ) {
    this.relatorios = [
      this.inadimplencia(),
      this.faturamentoPorPeriodo(),
      this.faturamentoPorFormaPagamento(),
      this.faturamentoPorPaciente(),
      this.porVencimento(),
      this.despesaPorCentroCusto(),
      this.extratoPlano('FIN-13', 'Extrato por Plano de Contas (Despesas)', 'DESPESA'),
      this.extratoPlano('FIN-14', 'Extrato por Plano de Contas (Receitas)', 'RECEITA'),
      this.extratoFornecedor(),
      this.pagarDetalhado(),
      this.receberDetalhado(),
      this.receitaTotal(),
      this.dre(),
      this.porContaContabil(),
      this.pagarSemanal(),
    ];
  }

  /** Relatórios financeiros são da administração: perfil restrito a profissionais recebe 403. */
  private somenteAdministracao(): void {
    if (this.escopo.restrito()) throw semPermissao();
  }

  /** FIN-01: títulos vencidos com saldo em aberto, com vencimento no período. */
  async linhasInadimplencia(
    consulta: ConsultaRelatorio,
    hoje = hojeNaClinica(),
  ): Promise<LinhaInadimplencia[]> {
    this.somenteAdministracao();
    const contas = await this.txHost.tx.contaReceber.findMany({
      where: {
        ...DO_TORRES,
        status: { in: ['PENDENTE', 'PARCIAL'] },
        dataVencimento: faixa(consulta.periodo.de, consulta.periodo.ate),
      },
      include: {
        paciente: { select: { nome: true } },
        profissionalSacado: { select: { nome: true } },
        baixas: { where: NAO_EXCLUIDAS, select: { valorRecebido: true } },
      },
    });
    return contas
      .map((c) => ({ c, saldo: saldoEmAberto(c.valor, c.baixas) }))
      .filter(({ c, saldo }) => saldo.greaterThan(0) && dia(c.dataVencimento) < hoje)
      .map(({ c, saldo }) => ({
        numero: c.numero,
        cliente: c.paciente?.nome ?? c.profissionalSacado?.nome ?? SEM_CLIENTE,
        descricao: c.descricao,
        vencimento: c.dataVencimento,
        diasAtraso: diasEmAtraso(dia(c.dataVencimento), hoje),
        valor: num(c.valor),
        saldo: num(saldo),
      }));
  }

  /** FIN-06: faturamento (competência pelo vencimento) do período, dia a dia. */
  async linhasFaturamentoDia(consulta: ConsultaRelatorio): Promise<LinhaFaturamentoDia[]> {
    this.somenteAdministracao();
    const grupos = await this.txHost.tx.contaReceber.groupBy({
      by: ['dataVencimento'],
      where: { ...DO_TORRES, status: VALIDAS, dataVencimento: faixaDe(consulta) },
      _count: { _all: true },
      _sum: { valor: true },
    });
    return grupos.map((g) => ({
      data: g.dataVencimento,
      titulos: g._count._all,
      valor: num(g._sum.valor),
    }));
  }

  /** FIN-07: o que foi recebido no período (baixas), por forma de pagamento. */
  async linhasFormaPagamento(consulta: ConsultaRelatorio): Promise<LinhaFormaPagamento[]> {
    this.somenteAdministracao();
    const grupos = await this.txHost.tx.contaReceberBaixa.groupBy({
      by: ['formaPagamentoId'],
      where: {
        ...NAO_EXCLUIDAS,
        dataRecebimento: faixaDe(consulta),
        contaReceber: { ...DO_TORRES },
      },
      _count: { _all: true },
      _sum: { valorRecebido: true },
    });
    const formas = await this.txHost.tx.formaPagamento.findMany({
      where: {
        id: { in: grupos.flatMap((g) => (g.formaPagamentoId ? [g.formaPagamentoId] : [])) },
      },
      select: { id: true, nome: true },
    });
    const nomes = new Map(formas.map((f) => [f.id, f.nome]));
    const total = grupos.reduce((soma, g) => soma + num(g._sum.valorRecebido), 0);
    return grupos.map((g) => ({
      formaPagamento: (g.formaPagamentoId && nomes.get(g.formaPagamentoId)) || SEM_FORMA_PAGAMENTO,
      recebimentos: g._count._all,
      valor: num(g._sum.valorRecebido),
      participacao: percentual(num(g._sum.valorRecebido), total),
    }));
  }

  /** FIN-10: faturamento do período por paciente (cliente). */
  async linhasFaturamentoPaciente(
    consulta: ConsultaRelatorio,
  ): Promise<LinhaFaturamentoPaciente[]> {
    this.somenteAdministracao();
    const grupos = await this.txHost.tx.contaReceber.groupBy({
      by: ['pacienteId'],
      where: { ...DO_TORRES, status: VALIDAS, dataVencimento: faixaDe(consulta) },
      _count: { _all: true },
      _sum: { valor: true },
    });
    const pacientes = await this.txHost.tx.paciente.findMany({
      where: { id: { in: grupos.flatMap((g) => (g.pacienteId ? [g.pacienteId] : [])) } },
      select: { id: true, nome: true },
    });
    const nomes = new Map(pacientes.map((p) => [p.id, p.nome]));
    return grupos.map((g) => ({
      paciente: (g.pacienteId && nomes.get(g.pacienteId)) || SEM_CLIENTE,
      titulos: g._count._all,
      valor: num(g._sum.valor),
    }));
  }

  /** FIN-11: contas a receber e a pagar com vencimento no período, lado a lado. */
  async linhasVencimento(consulta: ConsultaRelatorio): Promise<LinhaVencimento[]> {
    this.somenteAdministracao();
    const where = { dataVencimento: faixaDe(consulta) };
    const [receber, pagar] = await Promise.all([
      this.txHost.tx.contaReceber.findMany({
        where: { ...DO_TORRES, status: { not: 'CANCELADO' }, ...where },
      }),
      this.txHost.tx.contaPagar.findMany({
        where: { ...NAO_EXCLUIDAS, status: VALIDAS_PAGAR, ...where },
      }),
    ]);
    return [
      ...receber.map((c) => ({
        tipo: 'Receber' as const,
        vencimento: c.dataVencimento,
        descricao: c.descricao,
        valor: num(c.valor),
        status: rotuloStatus(c.status),
      })),
      ...pagar.map((c) => ({
        tipo: 'Pagar' as const,
        vencimento: c.dataVencimento,
        descricao: c.descricao,
        valor: num(c.valor),
        status: rotuloStatus(c.status),
      })),
    ];
  }

  /**
   * FIN-12: despesas (contas a pagar não canceladas) do período por centro de custo, contra a média
   * dos 90 dias anteriores ao período, proporcional à duração dele.
   */
  async linhasCentroCusto(consulta: ConsultaRelatorio): Promise<LinhaCentroCusto[]> {
    this.somenteAdministracao();
    const { de, ate } = consulta.periodo;
    const base = { ...NAO_EXCLUIDAS, status: VALIDAS_PAGAR };
    const [atual, anterior] = await Promise.all([
      this.txHost.tx.contaPagar.groupBy({
        by: ['centroCustoId'],
        where: { ...base, dataVencimento: faixa(de, ate) },
        _sum: { valor: true },
      }),
      this.txHost.tx.contaPagar.groupBy({
        by: ['centroCustoId'],
        where: {
          ...base,
          dataVencimento: faixa(somarDias(de, -DIAS_MEDIA_DESPESA), somarDias(de, -1)),
        },
        _sum: { valor: true },
      }),
    ]);
    const diasDoPeriodo = diasEntre(de, ate) + 1;
    const media = new Map(
      anterior.map((g) => [
        g.centroCustoId,
        arredondar((num(g._sum.valor) / DIAS_MEDIA_DESPESA) * diasDoPeriodo),
      ]),
    );
    const centros = await this.txHost.tx.centroCusto.findMany({ select: { id: true, nome: true } });
    const nomes = new Map(centros.map((c) => [c.id, c.nome]));
    return atual.map((g) => {
      const valor = num(g._sum.valor);
      const mediaPeriodo = media.get(g.centroCustoId) ?? 0;
      return {
        centroCusto: (g.centroCustoId && nomes.get(g.centroCustoId)) || SEM_CENTRO_CUSTO,
        valor,
        mediaPeriodo,
        variacao:
          mediaPeriodo === 0 ? null : arredondar(((valor - mediaPeriodo) / mediaPeriodo) * 100),
      };
    });
  }

  /** FIN-13 e FIN-14: lançamentos do período em contas do plano do tipo pedido, por vencimento. */
  async linhasExtratoPlano(
    consulta: ConsultaRelatorio,
    tipo: 'DESPESA' | 'RECEITA',
  ): Promise<LinhaExtratoPlano[]> {
    this.somenteAdministracao();
    const where = { planoConta: { tipo }, dataVencimento: faixaDe(consulta) };
    const include = { planoConta: { select: { codigo: true, nome: true } } };
    const contas: ContaDoExtrato[] =
      tipo === 'DESPESA'
        ? await this.txHost.tx.contaPagar.findMany({
            where: { ...NAO_EXCLUIDAS, status: VALIDAS_PAGAR, ...where },
            include,
          })
        : await this.txHost.tx.contaReceber.findMany({
            where: { ...DO_TORRES, status: VALIDAS, ...where },
            include,
          });
    return contas.map((c) => ({
      data: c.dataVencimento,
      codigo: c.planoConta?.codigo ?? '',
      conta: c.planoConta?.nome ?? SEM_CONTA,
      descricao: c.descricao,
      valor: num(c.valor),
      status: rotuloStatus(c.status),
    }));
  }

  /** FIN-17: contas a pagar de fornecedores no período, por fornecedor. */
  async linhasExtratoFornecedor(consulta: ConsultaRelatorio): Promise<LinhaExtratoFornecedor[]> {
    this.somenteAdministracao();
    const contas = await this.txHost.tx.contaPagar.findMany({
      where: {
        ...NAO_EXCLUIDAS,
        status: VALIDAS_PAGAR,
        beneficiarioTipo: 'FORNECEDOR',
        dataVencimento: faixaDe(consulta),
      },
    });
    const nomes = await this.nomesFornecedores(contas.map((c) => c.fornecedorId));
    return contas.map((c) => ({
      fornecedor: (c.fornecedorId && nomes.get(c.fornecedorId)) || SEM_FORNECEDOR,
      vencimento: c.dataVencimento,
      descricao: c.descricao,
      documento: c.documento,
      valor: num(c.valor),
      status: rotuloStatus(c.status),
    }));
  }

  private async nomesFornecedores(ids: readonly (string | null)[]): Promise<Map<string, string>> {
    const fornecedores = await this.txHost.tx.fornecedor.findMany({
      where: { id: { in: ids.flatMap((id) => (id ? [id] : [])) } },
      select: { id: true, nome: true },
    });
    return new Map(fornecedores.map((f) => [f.id, f.nome]));
  }

  private async nomesFuncionarios(ids: readonly (string | null)[]): Promise<Map<string, string>> {
    const funcionarios = await this.txHost.tx.funcionario.findMany({
      where: { id: { in: ids.flatMap((id) => (id ? [id] : [])) } },
      select: { id: true, nome: true },
    });
    return new Map(funcionarios.map((f) => [f.id, f.nome]));
  }

  /** FIN-19: contas a pagar do período, com o pago e o saldo. */
  async linhasPagarDetalhado(consulta: ConsultaRelatorio): Promise<LinhaPagarDetalhado[]> {
    this.somenteAdministracao();
    const contas = await this.txHost.tx.contaPagar.findMany({
      where: { ...NAO_EXCLUIDAS, dataVencimento: faixaDe(consulta) },
      include: { baixas: { where: NAO_EXCLUIDAS, select: { valorPago: true } } },
    });
    const [fornecedores, funcionarios] = await Promise.all([
      this.nomesFornecedores(contas.map((c) => c.fornecedorId)),
      this.nomesFuncionarios(contas.map((c) => c.funcionarioId)),
    ]);
    return contas.map((c) => {
      const pago = c.baixas.reduce((soma, b) => soma + num(b.valorPago), 0);
      const beneficiarioId = c.beneficiarioTipo === 'FORNECEDOR' ? c.fornecedorId : c.funcionarioId;
      const nomes = c.beneficiarioTipo === 'FORNECEDOR' ? fornecedores : funcionarios;
      return {
        numero: c.numero,
        descricao: c.descricao,
        beneficiario: (beneficiarioId && nomes.get(beneficiarioId)) || SEM_FORNECEDOR,
        vencimento: c.dataVencimento,
        valor: num(c.valor),
        pago: arredondar(pago),
        saldo: c.status === 'CANCELADO' ? 0 : arredondar(Math.max(num(c.valor) - pago, 0)),
        status: rotuloStatus(c.status),
      };
    });
  }

  /** FIN-20: contas a receber do período, com o recebido e o saldo. */
  async linhasReceberDetalhado(consulta: ConsultaRelatorio): Promise<LinhaReceberDetalhado[]> {
    this.somenteAdministracao();
    const contas = await this.txHost.tx.contaReceber.findMany({
      where: { ...DO_TORRES, dataVencimento: faixaDe(consulta) },
      include: {
        paciente: { select: { nome: true } },
        profissionalSacado: { select: { nome: true } },
        baixas: { where: NAO_EXCLUIDAS, select: { valorRecebido: true } },
      },
    });
    return contas.map((c) => {
      const recebido = c.baixas.reduce((soma, b) => soma + num(b.valorRecebido), 0);
      const encerrada = c.status === 'CANCELADO' || c.status === 'RENEGOCIADO';
      return {
        numero: c.numero,
        cliente: c.paciente?.nome ?? c.profissionalSacado?.nome ?? SEM_CLIENTE,
        descricao: c.descricao,
        vencimento: c.dataVencimento,
        valor: num(c.valor),
        recebido: arredondar(recebido),
        saldo: encerrada ? 0 : arredondar(Math.max(num(c.valor) - recebido, 0)),
        status: rotuloStatus(c.status),
      };
    });
  }

  /** FIN-22: por mês, o faturamento (competência) e o recebido (baixas), como nos Indicadores. */
  async linhasReceitaTotal(consulta: ConsultaRelatorio): Promise<LinhaReceitaTotal[]> {
    this.somenteAdministracao();
    const [contas, baixas] = await Promise.all([
      this.txHost.tx.contaReceber.findMany({
        where: { ...DO_TORRES, status: VALIDAS, dataVencimento: faixaDe(consulta) },
        select: { dataVencimento: true, valor: true },
      }),
      this.txHost.tx.contaReceberBaixa.findMany({
        where: {
          ...NAO_EXCLUIDAS,
          dataRecebimento: faixaDe(consulta),
          contaReceber: { ...DO_TORRES },
        },
        select: { dataRecebimento: true, valorRecebido: true },
      }),
    ]);
    const meses = new Map<string, LinhaReceitaTotal>();
    const linha = (mes: string) => {
      const existente = meses.get(mes) ?? { mes, faturamento: 0, recebido: 0 };
      meses.set(mes, existente);
      return existente;
    };
    for (const c of contas) linha(mesDe(c.dataVencimento)).faturamento += num(c.valor);
    for (const b of baixas) linha(mesDe(b.dataRecebimento)).recebido += num(b.valorRecebido);
    return [...meses.values()].map((l) => ({
      ...l,
      faturamento: arredondar(l.faturamento),
      recebido: arredondar(l.recebido),
    }));
  }

  /** Totais por conta do plano, na competência do período, das receitas e das despesas. */
  private async totaisPorConta(consulta: ConsultaRelatorio) {
    const competencia = naCompetencia(consulta);
    const [gruposReceber, gruposPagar] = await Promise.all([
      this.txHost.tx.contaReceber.groupBy({
        by: ['planoContaId'],
        where: { ...DO_TORRES, status: VALIDAS, ...competencia },
        _count: { _all: true },
        _sum: { valor: true },
      }),
      this.txHost.tx.contaPagar.groupBy({
        by: ['planoContaId'],
        where: { ...NAO_EXCLUIDAS, status: VALIDAS_PAGAR, ...competencia },
        _count: { _all: true },
        _sum: { valor: true },
      }),
    ]);
    const normalizar = (
      grupos: readonly {
        planoContaId: string | null;
        _count: { _all: number };
        _sum: { valor: { toNumber(): number } | null };
      }[],
    ): TotalConta[] =>
      grupos.map((g) => ({
        planoContaId: g.planoContaId,
        lancamentos: g._count._all,
        valor: num(g._sum.valor),
      }));
    const receitas = normalizar(gruposReceber);
    const despesas = normalizar(gruposPagar);
    const ids = [...receitas, ...despesas].flatMap((g) => (g.planoContaId ? [g.planoContaId] : []));
    const planos = await this.txHost.tx.planoConta.findMany({
      where: { id: { in: ids } },
      select: { id: true, codigo: true, nome: true },
    });
    return { receitas, despesas, planos: new Map(planos.map((p) => [p.id, p])) };
  }

  /** FIN-23: DRE por competência: receitas e despesas por conta do plano e o resultado. */
  async linhasDre(consulta: ConsultaRelatorio): Promise<LinhaDre[]> {
    this.somenteAdministracao();
    const { receitas, despesas, planos } = await this.totaisPorConta(consulta);
    const linhas = (secao: 'Receitas' | 'Despesas', grupos: readonly TotalConta[]): LinhaDre[] =>
      grupos
        .map((g) => ({
          secao,
          codigo: (g.planoContaId && planos.get(g.planoContaId)?.codigo) || '',
          conta: (g.planoContaId && planos.get(g.planoContaId)?.nome) || SEM_CONTA,
          valor: g.valor,
        }))
        .sort(
          (a, b) => a.codigo.localeCompare(b.codigo, 'pt-BR') || a.conta.localeCompare(b.conta),
        );
    const dasReceitas = linhas('Receitas', receitas);
    const dasDespesas = linhas('Despesas', despesas);
    const soma = (itens: LinhaDre[]) => itens.reduce((total, l) => total + l.valor, 0);
    return [
      ...dasReceitas,
      ...dasDespesas,
      {
        secao: 'Resultado',
        codigo: '',
        conta: 'Receitas menos despesas',
        valor: arredondar(soma(dasReceitas) - soma(dasDespesas)),
      },
    ];
  }

  /** FIN-24: lançamentos e valor por conta contábil, na competência do período. */
  async linhasContaContabil(consulta: ConsultaRelatorio): Promise<LinhaContaContabil[]> {
    this.somenteAdministracao();
    const { receitas, despesas, planos } = await this.totaisPorConta(consulta);
    const tipo = consulta.filtros.tipo;
    const mapear = (tipoConta: 'Receita' | 'Despesa', grupos: readonly TotalConta[]) =>
      grupos.map((g) => ({
        codigo: (g.planoContaId && planos.get(g.planoContaId)?.codigo) || '',
        conta: (g.planoContaId && planos.get(g.planoContaId)?.nome) || SEM_CONTA,
        tipo: tipoConta,
        lancamentos: g.lancamentos,
        valor: g.valor,
      }));
    return [
      ...(tipo === 'despesa' ? [] : mapear('Receita', receitas)),
      ...(tipo === 'receita' ? [] : mapear('Despesa', despesas)),
    ];
  }

  /** FIN-25: contas a pagar em aberto: vencidas, da semana e as demais pendentes até "Até". */
  async linhasPagarSemanal(
    consulta: ConsultaRelatorio,
    hoje = hojeNaClinica(),
  ): Promise<LinhaPagarSemanal[]> {
    this.somenteAdministracao();
    const { de, ate } = consulta.periodo;
    const contas = await this.txHost.tx.contaPagar.findMany({
      where: {
        ...NAO_EXCLUIDAS,
        status: 'PENDENTE',
        dataVencimento: { lte: diaUtc(ate) },
        OR: [{ dataVencimento: { lt: diaUtc(hoje) } }, { dataVencimento: { gte: diaUtc(de) } }],
      },
    });
    const fornecedores = await this.nomesFornecedores(contas.map((c) => c.fornecedorId));
    const fimSemana = somarDias(hoje, DIAS_DA_SEMANA - 1);
    const linhas = contas.map((c): LinhaPagarSemanal => {
      const vencimento = dia(c.dataVencimento);
      const situacao =
        vencimento < hoje ? 'Vencida' : vencimento <= fimSemana ? 'Da semana' : 'Pendente';
      return {
        vencimento: c.dataVencimento,
        descricao: c.descricao,
        fornecedor: (c.fornecedorId && fornecedores.get(c.fornecedorId)) || SEM_FORNECEDOR,
        valor: num(c.valor),
        situacao,
      };
    });
    const escolhida = { vencidas: 'Vencida', semana: 'Da semana', pendentes: 'Pendente' }[
      consulta.filtros.situacao ?? ''
    ];
    return escolhida ? linhas.filter((l) => l.situacao === escolhida) : linhas;
  }

  private inadimplencia(): ReportDefinition {
    return definirRelatorio<LinhaInadimplencia>({
      id: 'FIN-01',
      nome: 'Inadimplência',
      permissao: 'financeiro.contas-receber.ver',
      colunas: [
        coluna('numero', '#', { type: 'number' }),
        coluna('cliente', 'Cliente', { width: 2 }),
        coluna('descricao', 'Descrição', { width: 3 }),
        coluna('vencimento', 'Vencimento', { type: 'date' }),
        coluna('diasAtraso', 'Dias em atraso', { type: 'number' }),
        coluna('valor', 'Valor (R$)', { type: 'currency' }),
        coluna('saldo', 'Saldo em aberto (R$)', { type: 'currency' }),
      ],
      ordenacaoPadrao: 'vencimento:asc',
      buscar: async (c, p) => ordenarEPaginar(await this.linhasInadimplencia(c), c.sort, p),
      contar: async (c) => (await this.linhasInadimplencia(c)).length,
    });
  }

  private faturamentoPorPeriodo(): ReportDefinition {
    return definirRelatorio<LinhaFaturamentoDia>({
      id: 'FIN-06',
      nome: 'Faturamento por Período',
      permissao: 'financeiro.contas-receber.ver',
      colunas: [
        coluna('data', 'Data', { type: 'date' }),
        coluna('titulos', 'Títulos', { type: 'number' }),
        coluna('valor', 'Valor (R$)', { type: 'currency' }),
      ],
      ordenacaoPadrao: 'data:asc',
      buscar: async (c, p) => ordenarEPaginar(await this.linhasFaturamentoDia(c), c.sort, p),
      contar: async (c) => (await this.linhasFaturamentoDia(c)).length,
    });
  }

  private faturamentoPorFormaPagamento(): ReportDefinition {
    return definirRelatorio<LinhaFormaPagamento>({
      id: 'FIN-07',
      nome: 'Faturamento por Tipo de Pagamento',
      permissao: 'financeiro.contas-receber.ver',
      colunas: [
        coluna('formaPagamento', 'Forma de pagamento', { width: 3 }),
        coluna('recebimentos', 'Recebimentos', { type: 'number' }),
        coluna('valor', 'Valor (R$)', { type: 'currency' }),
        coluna('participacao', 'Participação (%)', { type: 'number' }),
      ],
      ordenacaoPadrao: 'valor:desc',
      buscar: async (c, p) => ordenarEPaginar(await this.linhasFormaPagamento(c), c.sort, p),
      contar: async (c) => (await this.linhasFormaPagamento(c)).length,
    });
  }

  private faturamentoPorPaciente(): ReportDefinition {
    return definirRelatorio<LinhaFaturamentoPaciente>({
      id: 'FIN-10',
      nome: 'Faturamento por Paciente',
      permissao: 'financeiro.contas-receber.ver',
      colunas: [
        coluna('paciente', 'Paciente', { width: 3 }),
        coluna('titulos', 'Títulos', { type: 'number' }),
        coluna('valor', 'Valor (R$)', { type: 'currency' }),
      ],
      ordenacaoPadrao: 'valor:desc',
      buscar: async (c, p) => ordenarEPaginar(await this.linhasFaturamentoPaciente(c), c.sort, p),
      contar: async (c) => (await this.linhasFaturamentoPaciente(c)).length,
    });
  }

  private porVencimento(): ReportDefinition {
    return definirRelatorio<LinhaVencimento>({
      id: 'FIN-11',
      nome: 'Contas a Receber e Pagar por Vencimento',
      permissao: 'financeiro.contas-receber.ver',
      colunas: [
        coluna('tipo', 'Tipo'),
        coluna('vencimento', 'Vencimento', { type: 'date' }),
        coluna('descricao', 'Descrição', { width: 3 }),
        coluna('valor', 'Valor (R$)', { type: 'currency' }),
        coluna('status', 'Status'),
      ],
      ordenacaoPadrao: 'vencimento:asc',
      buscar: async (c, p) => ordenarEPaginar(await this.linhasVencimento(c), c.sort, p),
      contar: async (c) => (await this.linhasVencimento(c)).length,
    });
  }

  private despesaPorCentroCusto(): ReportDefinition {
    return definirRelatorio<LinhaCentroCusto>({
      id: 'FIN-12',
      nome: 'Despesa por Centro de Custo',
      permissao: 'financeiro.contas-pagar.ver',
      colunas: [
        coluna('centroCusto', 'Centro de custo', { width: 3 }),
        coluna('valor', 'Despesa (R$)', { type: 'currency' }),
        coluna('mediaPeriodo', 'Média dos 90 dias anteriores (R$)', { type: 'currency' }),
        coluna('variacao', 'Variação (%)', { type: 'number' }),
      ],
      ordenacaoPadrao: 'valor:desc',
      buscar: async (c, p) => ordenarEPaginar(await this.linhasCentroCusto(c), c.sort, p),
      contar: async (c) => (await this.linhasCentroCusto(c)).length,
    });
  }

  private extratoPlano(id: string, nome: string, tipo: 'DESPESA' | 'RECEITA'): ReportDefinition {
    return definirRelatorio<LinhaExtratoPlano>({
      id,
      nome,
      permissao: 'financeiro.plano-contas.ver',
      colunas: [
        coluna('data', 'Vencimento', { type: 'date' }),
        coluna('codigo', 'Código'),
        coluna('conta', 'Conta', { width: 2 }),
        coluna('descricao', 'Descrição', { width: 3 }),
        coluna('valor', 'Valor (R$)', { type: 'currency' }),
        coluna('status', 'Status'),
      ],
      ordenacaoPadrao: 'data:asc',
      buscar: async (c, p) => ordenarEPaginar(await this.linhasExtratoPlano(c, tipo), c.sort, p),
      contar: async (c) => (await this.linhasExtratoPlano(c, tipo)).length,
    });
  }

  private extratoFornecedor(): ReportDefinition {
    return definirRelatorio<LinhaExtratoFornecedor>({
      id: 'FIN-17',
      nome: 'Extrato por Fornecedor',
      permissao: 'financeiro.contas-pagar.ver',
      colunas: [
        coluna('fornecedor', 'Fornecedor', { width: 2 }),
        coluna('vencimento', 'Vencimento', { type: 'date' }),
        coluna('descricao', 'Descrição', { width: 3 }),
        coluna('documento', 'Documento'),
        coluna('valor', 'Valor (R$)', { type: 'currency' }),
        coluna('status', 'Status'),
      ],
      ordenacaoPadrao: 'fornecedor:asc',
      buscar: async (c, p) => ordenarEPaginar(await this.linhasExtratoFornecedor(c), c.sort, p),
      contar: async (c) => (await this.linhasExtratoFornecedor(c)).length,
    });
  }

  private pagarDetalhado(): ReportDefinition {
    return definirRelatorio<LinhaPagarDetalhado>({
      id: 'FIN-19',
      nome: 'Contas a Pagar (Detalhado)',
      permissao: 'financeiro.contas-pagar.ver',
      colunas: [
        coluna('numero', '#', { type: 'number' }),
        coluna('descricao', 'Descrição', { width: 3 }),
        coluna('beneficiario', 'Beneficiário', { width: 2 }),
        coluna('vencimento', 'Vencimento', { type: 'date' }),
        coluna('valor', 'Valor (R$)', { type: 'currency' }),
        coluna('pago', 'Pago (R$)', { type: 'currency' }),
        coluna('saldo', 'Saldo (R$)', { type: 'currency' }),
        coluna('status', 'Status'),
      ],
      ordenacaoPadrao: 'vencimento:asc',
      buscar: async (c, p) => ordenarEPaginar(await this.linhasPagarDetalhado(c), c.sort, p),
      contar: async (c) => (await this.linhasPagarDetalhado(c)).length,
    });
  }

  private receberDetalhado(): ReportDefinition {
    return definirRelatorio<LinhaReceberDetalhado>({
      id: 'FIN-20',
      nome: 'Contas a Receber (Detalhado)',
      permissao: 'financeiro.contas-receber.ver',
      colunas: [
        coluna('numero', '#', { type: 'number' }),
        coluna('cliente', 'Cliente', { width: 2 }),
        coluna('descricao', 'Descrição', { width: 3 }),
        coluna('vencimento', 'Vencimento', { type: 'date' }),
        coluna('valor', 'Valor (R$)', { type: 'currency' }),
        coluna('recebido', 'Recebido (R$)', { type: 'currency' }),
        coluna('saldo', 'Saldo (R$)', { type: 'currency' }),
        coluna('status', 'Status'),
      ],
      ordenacaoPadrao: 'vencimento:asc',
      buscar: async (c, p) => ordenarEPaginar(await this.linhasReceberDetalhado(c), c.sort, p),
      contar: async (c) => (await this.linhasReceberDetalhado(c)).length,
    });
  }

  private receitaTotal(): ReportDefinition {
    return definirRelatorio<LinhaReceitaTotal>({
      id: 'FIN-22',
      nome: 'Receita Total',
      permissao: 'financeiro.indicadores.ver',
      colunas: [
        coluna('mes', 'Mês'),
        coluna('faturamento', 'Faturamento (R$)', { type: 'currency' }),
        coluna('recebido', 'Recebido (R$)', { type: 'currency' }),
      ],
      ordenacaoPadrao: 'mes:asc',
      buscar: async (c, p) => ordenarEPaginar(await this.linhasReceitaTotal(c), c.sort, p),
      contar: async (c) => (await this.linhasReceitaTotal(c)).length,
    });
  }

  private dre(): ReportDefinition {
    return definirRelatorio<LinhaDre>({
      id: 'FIN-23',
      nome: 'DRE (por competência)',
      permissao: 'financeiro.indicadores.ver',
      colunas: [
        coluna('secao', 'Seção', { ordenavel: false }),
        coluna('codigo', 'Código', { ordenavel: false }),
        coluna('conta', 'Conta', { width: 3, ordenavel: false }),
        coluna('valor', 'Valor (R$)', { type: 'currency', ordenavel: false }),
      ],
      buscar: async (c, p) => ordenarEPaginar(await this.linhasDre(c), undefined, p),
      contar: async (c) => (await this.linhasDre(c)).length,
    });
  }

  private porContaContabil(): ReportDefinition {
    return definirRelatorio<LinhaContaContabil>({
      id: 'FIN-24',
      nome: 'Relatório por Conta Contábil',
      permissao: 'financeiro.plano-contas.ver',
      filtros: [FILTRO_TIPO_CONTA],
      colunas: [
        coluna('codigo', 'Código'),
        coluna('conta', 'Conta', { width: 3 }),
        coluna('tipo', 'Tipo'),
        coluna('lancamentos', 'Lançamentos', { type: 'number' }),
        coluna('valor', 'Valor (R$)', { type: 'currency' }),
      ],
      ordenacaoPadrao: 'codigo:asc',
      buscar: async (c, p) => ordenarEPaginar(await this.linhasContaContabil(c), c.sort, p),
      contar: async (c) => (await this.linhasContaContabil(c)).length,
    });
  }

  private pagarSemanal(): ReportDefinition {
    return definirRelatorio<LinhaPagarSemanal>({
      id: 'FIN-25',
      nome: 'Contas a Pagar Semanal',
      permissao: 'financeiro.contas-pagar.ver',
      filtros: [FILTRO_SITUACAO],
      colunas: [
        coluna('vencimento', 'Vencimento', { type: 'date' }),
        coluna('descricao', 'Descrição', { width: 3 }),
        coluna('fornecedor', 'Fornecedor', { width: 2 }),
        coluna('valor', 'Valor (R$)', { type: 'currency' }),
        coluna('situacao', 'Situação'),
      ],
      ordenacaoPadrao: 'vencimento:asc',
      buscar: async (c, p) => ordenarEPaginar(await this.linhasPagarSemanal(c), c.sort, p),
      contar: async (c) => (await this.linhasPagarSemanal(c)).length,
    });
  }
}
