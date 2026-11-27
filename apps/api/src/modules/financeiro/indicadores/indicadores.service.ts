import { TransactionHost } from '@nestjs-cls/transactional';
import { forwardRef, Inject, Injectable } from '@nestjs/common';
import {
  variacaoPercentual,
  type IndicadorFinanceiro,
  type IndicadoresFinanceiros,
  type IndicadoresFinanceirosQuery,
} from '@torres/shared';
import type { Prisma } from '../../../generated/prisma/client';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import { ContratosSalaCobrancaService } from '../../gestao-profissionais/salas/contratos-sala-cobranca.service';
import { DO_TORRES, NAO_EXCLUIDAS } from '../conta-financeira';

/** Base do período: `competencia` pelo vencimento; `recebimento` pela data do recebimento. */
export type BaseReceita = 'competencia' | 'recebimento';

export interface ReceitasEDespesas {
  faturamentoTotal: number;
  receitaRecorrente: number;
  receitaAvulsa: number;
  resultadoOperacional: number;
  despesasPagas: number;
}

/** Títulos com vencimento no período: o que o Painel "Hoje" (#170) mostra e a lista de Contas a Receber filtra. */
export interface ResumoReceber {
  /** Soma dos títulos (cancelado e renegociado ficam fora). */
  contratada: number;
  /** Soma das baixas desses títulos. */
  recebido: number;
  /** Saldo em aberto dos títulos Pendente e Parcial. */
  aReceber: number;
}

const MES = /^\d{4}-\d{2}$/;

/** Mês atual (`AAAA-MM`) no fuso da clínica. */
function mesAtual(agora: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
  })
    .format(agora)
    .slice(0, 7);
}

export function mesAnteriorDe(mes: string): string {
  const [ano = 0, numero = 1] = mes.split('-').map(Number);
  const data = new Date(Date.UTC(ano, numero - 2, 1));
  return `${data.getUTCFullYear()}-${String(data.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function limitesDoMes(mes: string): { de: string; ate: string } {
  if (!MES.test(mes)) throw new Error(`Mês inválido: ${mes}`);
  const [ano = 0, numero = 1] = mes.split('-').map(Number);
  const ultimo = new Date(Date.UTC(ano, numero, 0)).getUTCDate();
  return { de: `${mes}-01`, ate: `${mes}-${String(ultimo).padStart(2, '0')}` };
}

const dia = (valor: string) => new Date(`${valor}T00:00:00.000Z`);
const arredondar = (valor: number) => Math.round(valor * 100) / 100;

function moeda(
  id: string,
  secao: IndicadorFinanceiro['secao'],
  valor: number,
  anterior: number,
): IndicadorFinanceiro {
  return {
    id,
    secao,
    formato: 'moeda',
    valor,
    anterior,
    variacao: variacaoPercentual(valor, anterior),
    detalhe: null,
  };
}

/** Sem fonte de dados ainda (ocupação #139, permutas e clientes): sai sem valor ("—"). */
function semFonte(
  id: string,
  secao: IndicadorFinanceiro['secao'],
  formato: IndicadorFinanceiro['formato'],
): IndicadorFinanceiro {
  return { id, secao, formato, valor: null, anterior: null, variacao: null, detalhe: null };
}

/**
 * Indicadores Financeiros (`/financeiro/indicadores`) e fonte única dos números de receita e
 * despesa do Painel. Só do caixa do coworking: as receitas dos profissionais ficam de fora.
 *
 * Definições (confirmadas pelo dev):
 * - Faturamento Total: contas a receber não canceladas do período;
 * - Receita Recorrente: parte do faturamento gerada por cobrança de contrato de sala;
 * - Receita Avulsa: o restante do faturamento;
 * - Despesas Pagas: baixas de contas a pagar no período;
 * - Resultado Operacional: recebido no período menos despesas pagas.
 */
export function somarReceber(
  titulos: ReadonlyArray<{
    valor: Prisma.Decimal;
    status: string;
    baixas: ReadonlyArray<{ valorRecebido: Prisma.Decimal }>;
  }>,
): ResumoReceber {
  let contratada = 0;
  let recebido = 0;
  let aReceber = 0;
  for (const titulo of titulos) {
    const valor = Number(titulo.valor);
    const baixado = titulo.baixas.reduce((total, b) => total + Number(b.valorRecebido), 0);
    contratada += valor;
    recebido += baixado;
    if (titulo.status === 'PENDENTE' || titulo.status === 'PARCIAL') {
      aReceber += Math.max(valor - baixado, 0);
    }
  }
  return {
    contratada: arredondar(contratada),
    recebido: arredondar(recebido),
    aReceber: arredondar(aReceber),
  };
}

@Injectable()
export class IndicadoresFinanceirosService {
  constructor(
    private readonly txHost: TransactionHost<PrismaAdapter>,
    @Inject(forwardRef(() => ContratosSalaCobrancaService))
    private readonly cobrancas: ContratosSalaCobrancaService,
  ) {}

  async obter(query: IndicadoresFinanceirosQuery): Promise<IndicadoresFinanceiros> {
    const mes = query.mes ?? mesAtual();
    const mesAnterior = mesAnteriorDe(mes);
    const [a, b] = [limitesDoMes(mes), limitesDoMes(mesAnterior)];
    const [atual, anterior] = await Promise.all([
      this.calcular(a.de, a.ate, 'competencia'),
      this.calcular(b.de, b.ate, 'competencia'),
    ]);

    return {
      mes,
      mesAnterior,
      indicadores: [
        moeda('faturamento-total', 'receitas', atual.faturamentoTotal, anterior.faturamentoTotal),
        moeda(
          'receita-recorrente',
          'receitas',
          atual.receitaRecorrente,
          anterior.receitaRecorrente,
        ),
        moeda('receita-avulsa', 'receitas', atual.receitaAvulsa, anterior.receitaAvulsa),
        moeda(
          'resultado-operacional',
          'receitas',
          atual.resultadoOperacional,
          anterior.resultadoOperacional,
        ),
        semFonte('taxa-ocupacao', 'ocupacao-salas', 'percentual'),
        semFonte('vacancia', 'ocupacao-salas', 'percentual'),
        semFonte('permutas', 'ocupacao-salas', 'moeda'),
        semFonte('novos-clientes', 'clientes', 'inteiro'),
        semFonte('contratos-cancelados', 'clientes', 'inteiro'),
        moeda('despesas-pagas', 'clientes', atual.despesasPagas, anterior.despesasPagas),
      ],
    };
  }

  /**
   * Receita contratada, recebido e a receber dos títulos com vencimento no período (`AAAA-MM-DD`),
   * do caixa do Torres. A lista de Contas a Receber com o mesmo vencimento soma o mesmo valor.
   */
  async resumoReceber(de: string, ate: string): Promise<ResumoReceber> {
    const titulos = await this.txHost.tx.contaReceber.findMany({
      where: {
        ...DO_TORRES,
        status: { notIn: ['CANCELADO', 'RENEGOCIADO'] },
        dataVencimento: { gte: dia(de), lte: dia(ate) },
      },
      select: {
        valor: true,
        status: true,
        baixas: { where: NAO_EXCLUIDAS, select: { valorRecebido: true } },
      },
    });
    return somarReceber(titulos);
  }

  /** Números de receita e despesa de um período (`AAAA-MM-DD`). O Painel usa o mesmo cálculo. */
  async calcular(de: string, ate: string, base: BaseReceita): Promise<ReceitasEDespesas> {
    const idsRecorrentes = await this.cobrancas.idsContasReceberDasCobrancas(
      de.slice(0, 7),
      ate.slice(0, 7),
    );
    const intervalo = { gte: dia(de), lte: dia(ate) };
    // Cobrança renegociada continua recorrente: vale o título original e os novos dele.
    const daCobranca: Prisma.ContaReceberWhereInput = {
      OR: [{ id: { in: idsRecorrentes } }, { renegociadoDeId: { in: idsRecorrentes } }],
    };
    const somaCompetencia = async (extra: Prisma.ContaReceberWhereInput) =>
      Number(
        (
          await this.txHost.tx.contaReceber.aggregate({
            // Renegociado fora: o valor em aberto está nos títulos novos.
            where: {
              ...DO_TORRES,
              status: { notIn: ['CANCELADO', 'RENEGOCIADO'] },
              dataVencimento: intervalo,
              ...extra,
            },
            _sum: { valor: true },
          })
        )._sum.valor ?? 0,
      );
    // Base caixa e "recebido": soma das baixas do período, inclusive as parciais (issue #165).
    const somaBaixas = async (extra: Prisma.ContaReceberWhereInput) =>
      Number(
        (
          await this.txHost.tx.contaReceberBaixa.aggregate({
            where: {
              ...NAO_EXCLUIDAS,
              dataRecebimento: intervalo,
              contaReceber: { ...DO_TORRES, ...extra },
            },
            _sum: { valorRecebido: true },
          })
        )._sum.valorRecebido ?? 0,
      );
    const somaFaturamento = base === 'competencia' ? somaCompetencia : somaBaixas;
    const [faturamento, recorrente, recebido, despesas] = await Promise.all([
      somaFaturamento({}),
      somaFaturamento(daCobranca),
      somaBaixas({}),
      this.txHost.tx.contaPagarBaixa.aggregate({
        where: { ...NAO_EXCLUIDAS, dataPagamento: intervalo, contaPagar: { ...NAO_EXCLUIDAS } },
        _sum: { valorPago: true },
      }),
    ]);
    const despesasPagas = Number(despesas._sum.valorPago ?? 0);
    return {
      faturamentoTotal: faturamento,
      receitaRecorrente: recorrente,
      receitaAvulsa: arredondar(faturamento - recorrente),
      resultadoOperacional: arredondar(recebido - despesasPagas),
      despesasPagas,
    };
  }
}
