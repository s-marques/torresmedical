import { Injectable } from '@nestjs/common';
import {
  type ApresentacaoMensal,
  type AvisoApresentacao,
  type FiltrosPainel,
  type FormatoIndicadorApresentacao,
  type IndicadorApresentacao,
  type IndicadorApresentacaoId,
  type Permissao,
  type PontoIndicador,
} from '@torres/shared';
import { EscopoDadosService, semPermissao } from '../../../common/auth/escopo-dados.service';
import { percentual } from '../../../common/ocupacao/calculo-ocupacao';
import { intervaloDoPeriodo } from '../../../common/relatorios/periodo';
import type { ConsultaRelatorio } from '../../../common/relatorios/relatorio.types';
import { IndicadoresGestaoService } from '../../comercial-atendimento/indicadores-gestao/indicadores-gestao.service';
import { PesquisaNpsService } from '../../comercial-atendimento/pesquisa-nps/pesquisa-nps.service';
import { PesquisaProfissionalService } from '../../comercial-atendimento/pesquisa-profissional/pesquisa-profissional.service';
import { RelatoriosEstoque } from '../../compras-estoque/relatorios/relatorios-estoque';
import {
  limitesDoMes,
  mesAnteriorDe,
} from '../../financeiro/indicadores/indicadores.service';
import { RelatoriosFinanceiro } from '../../financeiro/relatorios/relatorios-financeiro';
import { OcupacaoService } from '../../painel/ocupacao/ocupacao.service';

/** Meses do gráfico de tendência (faturamento e NPS): o escolhido e os cinco anteriores. */
export const MESES_TENDENCIA = 6;
/** Meses à frente no faturamento futuro (indicador 2). */
export const MESES_FUTUROS = 3;
/** Itens do gráfico de ranking; o que passar disso soma em "Outros". */
export const LIMITE_RANKING = 10;

const OUTROS = 'Outros';

/** Quem pede o relatório: as permissões decidem quais indicadores aparecem. */
export interface SolicitanteApresentacao {
  permissoes: ReadonlySet<Permissao>;
  empresaId?: string;
}

interface Contexto {
  mes: string;
  mesAnterior: string;
  empresaId?: string;
}

interface Definicao {
  id: IndicadorApresentacaoId;
  numero: number;
  /** Permissão da tela dona dos dados, como nos relatórios GES-02 a GES-04. */
  permissao: Permissao;
  montar(contexto: Contexto): Promise<IndicadorApresentacao>;
}

const arredondar = (valor: number, casas = 2): number => {
  const fator = 10 ** casas;
  return Math.round(valor * fator) / fator;
};

const soma = (valores: readonly (number | null)[]): number =>
  valores.reduce<number>((total, v) => total + (v ?? 0), 0);

/** `2026-10` + 2 → `2026-12`; aceita meses negativos. */
export function somarMesesDe(mes: string, meses: number): string {
  const [ano = 0, numero = 1] = mes.split('-').map(Number);
  const data = new Date(Date.UTC(ano, numero - 1 + meses, 1));
  return `${data.getUTCFullYear()}-${String(data.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Variação de `valor` sobre `anterior`: percentual (moeda, número) ou diferença em pontos. */
export function variacaoDe(
  formato: FormatoIndicadorApresentacao,
  valor: number | null,
  anterior: number | null,
): number | null {
  if (valor === null || anterior === null) return null;
  if (formato === 'percentual' || formato === 'nps') return arredondar(valor - anterior, 1);
  return anterior === 0 ? null : arredondar(((valor - anterior) / anterior) * 100, 1);
}

function consulta(
  de: string,
  ate: string,
  filtros: Record<string, string | undefined> = {},
): ConsultaRelatorio {
  return { periodo: { de, ate }, intervalo: intervaloDoPeriodo(de, ate), filtros };
}

function consultaDoMes(mes: string, filtros?: Record<string, string | undefined>) {
  const { de, ate } = limitesDoMes(mes);
  return consulta(de, ate, filtros);
}

/** Itens com o valor do mês e o de comparação; maiores primeiro, o excesso em "Outros". */
function ranking(
  itens: ReadonlyArray<{ rotulo: string; valor: number; anterior: number | null }>,
): PontoIndicador[] {
  const ordenados = [...itens].sort(
    (a, b) => b.valor - a.valor || a.rotulo.localeCompare(b.rotulo, 'pt-BR'),
  );
  const pontos: PontoIndicador[] = ordenados
    .slice(0, LIMITE_RANKING)
    .map((i) => ({ rotulo: i.rotulo, chave: null, valor: i.valor, anterior: i.anterior }));
  const resto = ordenados.slice(LIMITE_RANKING);
  if (resto.length > 0) {
    pontos.push({
      rotulo: OUTROS,
      chave: 'outros',
      valor: arredondar(soma(resto.map((i) => i.valor))),
      anterior: resto.some((i) => i.anterior !== null)
        ? arredondar(soma(resto.map((i) => i.anterior)))
        : null,
    });
  }
  return pontos;
}

/** Junta duas contagens por rótulo (mês e mês anterior). */
function juntarPorRotulo(
  atual: ReadonlyMap<string, number>,
  anterior: ReadonlyMap<string, number>,
): Array<{ rotulo: string; valor: number; anterior: number }> {
  return [...new Set([...atual.keys(), ...anterior.keys()])].map((rotulo) => ({
    rotulo,
    valor: atual.get(rotulo) ?? 0,
    anterior: anterior.get(rotulo) ?? 0,
  }));
}

/** Mês sem nenhuma resposta não tem NPS (o score vem 0): é "sem dado", não nota zero. */
function scoreOuNulo({ score, avaliacoes }: { score: number; avaliacoes: number }): number | null {
  return avaliacoes === 0 ? null : score;
}

interface Dados {
  id: IndicadorApresentacaoId;
  numero: number;
  formato: FormatoIndicadorApresentacao;
  grafico: IndicadorApresentacao['grafico'];
  comparacao: IndicadorApresentacao['comparacao'];
  valor: number | null;
  anterior: number | null;
  serie: PontoIndicador[];
  detalhe?: PontoIndicador[];
  avisos?: AvisoApresentacao[];
}

function indicador(dados: Dados): IndicadorApresentacao {
  return {
    ...dados,
    detalhe: dados.detalhe ?? [],
    avisos: dados.avisos ?? [],
    variacao: variacaoDe(dados.formato, dados.valor, dados.anterior),
  };
}

/**
 * Relatório mensal de apresentação da gestão (issue #171, R §27): os 10 indicadores do prédio para
 * a reunião mensal. Cada indicador vem do service do módulo dono dos dados (nada de consulta
 * direta às tabelas dele). Indicador sem fonte pronta devolve `valor: null` (dado indisponível),
 * nunca um número estimado.
 *
 * É visão da administração: perfil restrito a profissionais recebe 403. Cada indicador também
 * exige a permissão de ver a tela dona dos dados; o que o usuário não pode ver sai da lista.
 */
@Injectable()
export class ApresentacaoMensalService {
  private readonly definicoes: readonly Definicao[];

  constructor(
    private readonly escopo: EscopoDadosService,
    private readonly financeiro: RelatoriosFinanceiro,
    private readonly ocupacao: OcupacaoService,
    private readonly estoque: RelatoriosEstoque,
    private readonly indicadoresComercial: IndicadoresGestaoService,
    private readonly nps: PesquisaNpsService,
    private readonly npsProfissionais: PesquisaProfissionalService,
  ) {
    this.definicoes = [
      {
        id: 'faturamento',
        numero: 1,
        permissao: 'financeiro.contas-receber.ver',
        montar: (c) => this.faturamento(c),
      },
      {
        id: 'faturamento-futuro',
        numero: 2,
        permissao: 'financeiro.contas-receber.ver',
        montar: (c) => this.faturamentoFuturo(c),
      },
      {
        id: 'faturamento-produto',
        numero: 3,
        permissao: 'financeiro.contas-receber.ver',
        montar: (c) => this.faturamentoPorProduto(c),
      },
      {
        id: 'ocupacao',
        numero: 4,
        permissao: 'gestao-profissionais.salas.ver',
        montar: (c) => this.ocupacaoVacancia(c),
      },
      {
        id: 'despesas-centro-custo',
        numero: 5,
        permissao: 'financeiro.contas-pagar.ver',
        montar: (c) => this.despesasPorCentroCusto(c),
      },
      {
        id: 'estoque',
        numero: 6,
        permissao: 'compras-estoque.estoque.ver',
        montar: (c) => this.consumoDeEstoque(c),
      },
      {
        id: 'leads',
        numero: 7,
        permissao: 'comercial-atendimento.pipeline.ver',
        montar: (c) => this.leads(c),
      },
      {
        id: 'visitas',
        numero: 8,
        permissao: 'comercial-atendimento.pipeline.ver',
        montar: (c) => this.visitas(c),
      },
      {
        id: 'nps-medicos',
        numero: 9,
        permissao: 'comercial-atendimento.pesquisa-profissional.ver',
        montar: (c) => this.npsDosMedicos(c),
      },
      {
        id: 'nps-pacientes',
        numero: 10,
        permissao: 'comercial-atendimento.pesquisa-nps.ver',
        montar: (c) => this.npsDosPacientes(c),
      },
    ];
  }

  /** Os indicadores do mês (`AAAA-MM`) que o solicitante pode ver, na ordem da apresentação. */
  async gerar(mes: string, solicitante: SolicitanteApresentacao): Promise<ApresentacaoMensal> {
    if (this.escopo.restrito()) throw semPermissao();
    const contexto: Contexto = {
      mes,
      mesAnterior: mesAnteriorDe(mes),
      empresaId: solicitante.empresaId,
    };
    const permitidas = this.definicoes.filter((d) => solicitante.permissoes.has(d.permissao));
    const indicadores = await Promise.all(permitidas.map((d) => d.montar(contexto)));
    return {
      mes,
      mesAnterior: contexto.mesAnterior,
      geradoEm: new Date().toISOString(),
      indicadores,
    };
  }

  // ---------- 1 a 3: financeiro ----------

  /** 1. Faturamento (competência pelo vencimento, como a Receita Total FIN-22). */
  private async faturamento({ mes, mesAnterior }: Contexto): Promise<IndicadorApresentacao> {
    const meses = this.mesesDaTendencia(mes);
    const linhas = await this.financeiro.linhasReceitaTotal(
      consulta(limitesDoMes(meses[0] ?? mes).de, limitesDoMes(mes).ate),
    );
    const porMes = new Map(linhas.map((l) => [l.mes, l.faturamento]));
    return indicador({
      id: 'faturamento',
      numero: 1,
      formato: 'moeda',
      grafico: 'tendencia',
      comparacao: 'MES_ANTERIOR',
      valor: porMes.get(mes) ?? 0,
      anterior: porMes.get(mesAnterior) ?? 0,
      serie: meses.map((m) => ({
        rotulo: m,
        chave: null,
        valor: porMes.get(m) ?? 0,
        anterior: null,
      })),
    });
  }

  /**
   * 2. Faturamento futuro: provisão de recebimentos (FIN-26) dos próximos meses, com os títulos
   * já gerados e a projeção dos contratos ativos.
   */
  private async faturamentoFuturo({ mes }: Contexto): Promise<IndicadorApresentacao> {
    const meses = Array.from({ length: MESES_FUTUROS }, (_, i) => somarMesesDe(mes, i + 1));
    const linhas = await this.financeiro.linhasProvisaoResumo(
      consulta(limitesDoMes(meses[0] ?? mes).de, limitesDoMes(meses.at(-1) ?? mes).ate, {
        agrupar: 'mes',
      }),
    );
    const porMes = new Map(linhas.map((l) => [l.grupo, l.total]));
    const serie = meses.map((m) => ({
      rotulo: m,
      chave: null,
      valor: porMes.get(m) ?? 0,
      anterior: null,
    }));
    return indicador({
      id: 'faturamento-futuro',
      numero: 2,
      formato: 'moeda',
      grafico: 'tendencia',
      comparacao: 'NENHUMA',
      valor: arredondar(soma(serie.map((p) => p.valor))),
      anterior: null,
      serie,
    });
  }

  /**
   * 3. Faturamento por produto. Enquanto o catálogo de produtos do coworking (#169) não existe, o
   * produto é a modalidade do contrato de sala (mensal, turno, hora): títulos gerados no mês.
   */
  private async faturamentoPorProduto({
    mes,
    mesAnterior,
  }: Contexto): Promise<IndicadorApresentacao> {
    const porModalidade = async (m: string) =>
      new Map(
        (await this.financeiro.linhasProvisaoResumo(consultaDoMes(m, { agrupar: 'modalidade' }))).map(
          (l) => [l.grupo, l.gerado],
        ),
      );
    const [atual, anterior] = await Promise.all([porModalidade(mes), porModalidade(mesAnterior)]);
    const itens = juntarPorRotulo(atual, anterior);
    const serie = ranking(itens);
    return indicador({
      id: 'faturamento-produto',
      numero: 3,
      formato: 'moeda',
      grafico: 'comparativo',
      comparacao: 'MES_ANTERIOR',
      valor: arredondar(soma(itens.map((i) => i.valor))),
      anterior: arredondar(soma(itens.map((i) => i.anterior))),
      serie,
      avisos: ['PRODUTO_POR_MODALIDADE'],
    });
  }

  // ---------- 4: ocupação ----------

  /**
   * 4. Ocupação × vacância dos períodos, contra o mês anterior, e a previsão do mês seguinte
   * (o que já está contratado, que é dado real: não é projeção estatística).
   */
  private async ocupacaoVacancia({ mes, empresaId }: Contexto): Promise<IndicadorApresentacao> {
    const calcular = (m: string) => {
      const periodo = limitesDoMes(m);
      const filtros: FiltrosPainel = { modo: 'mes', mes: m, base: 'recebimento' };
      return this.ocupacao.calcular(filtros, periodo, empresaId);
    };
    const [atual, seguinte] = await Promise.all([calcular(mes), calcular(somarMesesDe(mes, 1))]);
    const taxa = (parte: number, total: number) => percentual(parte, total);
    const { total } = atual.atual;
    const ant = atual.anterior.total;
    const ocupacao = taxa(total.ocupados, total.capacidade);
    const ocupacaoAnterior = taxa(ant.ocupados, ant.capacidade);
    const previsto = seguinte.atual.total;
    return indicador({
      id: 'ocupacao',
      numero: 4,
      formato: 'percentual',
      grafico: 'comparativo',
      comparacao: 'MES_ANTERIOR',
      valor: ocupacao,
      anterior: ocupacaoAnterior,
      serie: [
        {
          rotulo: 'Ocupação',
          chave: 'ocupacao',
          valor: ocupacao,
          anterior: ocupacaoAnterior,
        },
        {
          rotulo: 'Vacância',
          chave: 'vacancia',
          valor: taxa(total.vagos, total.capacidade),
          anterior: taxa(ant.vagos, ant.capacidade),
        },
        {
          rotulo: 'Ocupação prevista (mês seguinte)',
          chave: 'ocupacao-prevista',
          valor: taxa(previsto.ocupados, previsto.capacidade),
          anterior: null,
        },
      ],
      avisos: ['OCUPACAO_PREVISAO_CONTRATOS'],
    });
  }

  // ---------- 5: despesas ----------

  /** 5. Despesa por centro de custo contra a média dos 90 dias anteriores (FIN-12). */
  private async despesasPorCentroCusto({ mes }: Contexto): Promise<IndicadorApresentacao> {
    const linhas = await this.financeiro.linhasCentroCusto(consultaDoMes(mes));
    const itens = linhas.map((l) => ({
      rotulo: l.centroCusto,
      valor: l.valor,
      anterior: l.mediaPeriodo,
    }));
    return indicador({
      id: 'despesas-centro-custo',
      numero: 5,
      formato: 'moeda',
      grafico: 'comparativo',
      comparacao: 'MEDIA_90_DIAS',
      valor: arredondar(soma(itens.map((i) => i.valor))),
      anterior: arredondar(soma(itens.map((i) => i.anterior))),
      serie: ranking(itens),
    });
  }

  // ---------- 6: estoque ----------

  /**
   * 6. Consumo de estoque por categoria (saídas do mês) contra o esperado pela média dos 90 dias
   * (EST-13). As unidades variam entre as categorias: não há total geral.
   */
  private async consumoDeEstoque({ mes }: Contexto): Promise<IndicadorApresentacao> {
    const linhas = await this.estoque.linhasConsumo(consultaDoMes(mes, { agrupar: 'categoria' }));
    return indicador({
      id: 'estoque',
      numero: 6,
      formato: 'numero',
      grafico: 'comparativo',
      comparacao: 'MEDIA_90_DIAS',
      valor: null,
      anterior: null,
      serie: ranking(
        linhas.map((l) => ({ rotulo: l.item, valor: l.consumo, anterior: l.mediaEsperada })),
      ),
      avisos: ['ESTOQUE_POR_CATEGORIA'],
    });
  }

  // ---------- 7 e 8: CRM ----------

  /** 7. Leads (negócios criados no mês) por origem, contra o mês anterior. */
  private async leads({ mes, mesAnterior }: Contexto): Promise<IndicadorApresentacao> {
    const porOrigem = async (m: string) =>
      new Map(
        (await this.indicadoresComercial.leadsPorOrigem(consultaDoMes(m).intervalo)).map((l) => [
          l.origem,
          l.leads,
        ]),
      );
    const [atual, anterior] = await Promise.all([porOrigem(mes), porOrigem(mesAnterior)]);
    const itens = juntarPorRotulo(atual, anterior);
    return indicador({
      id: 'leads',
      numero: 7,
      formato: 'numero',
      grafico: 'comparativo',
      comparacao: 'MES_ANTERIOR',
      valor: soma(itens.map((i) => i.valor)),
      anterior: soma(itens.map((i) => i.anterior)),
      serie: ranking(itens),
      avisos: ['LEADS_POR_ORIGEM'],
    });
  }

  /**
   * 8. Visitas aos médicos (agendadas e realizadas) e quais médicos receberam. Visitas recebidas
   * na clínica não têm registro: saem como dado indisponível.
   */
  private async visitas({ mes, mesAnterior }: Contexto): Promise<IndicadorApresentacao> {
    const [atual, anterior] = await Promise.all([
      this.indicadoresComercial.visitasDoPeriodo(consultaDoMes(mes).intervalo),
      this.indicadoresComercial.visitasDoPeriodo(consultaDoMes(mesAnterior).intervalo),
    ]);
    return indicador({
      id: 'visitas',
      numero: 8,
      formato: 'numero',
      grafico: 'comparativo',
      comparacao: 'MES_ANTERIOR',
      valor: atual.realizadas,
      anterior: anterior.realizadas,
      serie: [
        {
          rotulo: 'Visitas agendadas',
          chave: 'visitas-agendadas',
          valor: atual.agendadas,
          anterior: anterior.agendadas,
        },
        {
          rotulo: 'Visitas realizadas',
          chave: 'visitas-realizadas',
          valor: atual.realizadas,
          anterior: anterior.realizadas,
        },
        {
          rotulo: 'Visitas recebidas na clínica',
          chave: 'visitas-recebidas',
          valor: null,
          anterior: null,
        },
      ],
      detalhe: atual.medicosVisitados
        .slice(0, LIMITE_RANKING)
        .map((m) => ({ rotulo: m.medico, chave: null, valor: m.visitas, anterior: null })),
      avisos: ['VISITAS_RECEBIDAS_INDISPONIVEL'],
    });
  }

  // ---------- 9 e 10: NPS ----------

  /** 9. NPS dos médicos clientes (pesquisa do profissional, #145). */
  private async npsDosMedicos({ mes, mesAnterior }: Contexto): Promise<IndicadorApresentacao> {
    const meses = this.mesesDaTendencia(mes);
    const resultados = await Promise.all(meses.map((m) => this.npsProfissionais.npsDoMes(m)));
    return this.indicadorNps(
      'nps-medicos',
      9,
      meses,
      resultados.map((r) => scoreOuNulo(r)),
      mes,
      mesAnterior,
      [],
    );
  }

  /** 10. NPS dos pacientes dos médicos atendidos (pesquisa NPS, #12). */
  private async npsDosPacientes({ mes, mesAnterior }: Contexto): Promise<IndicadorApresentacao> {
    const meses = this.mesesDaTendencia(mes);
    const resultados = await Promise.all(
      meses.map((m) => {
        const { de, ate } = limitesDoMes(m);
        return this.nps.resumo({ de, ate });
      }),
    );
    return this.indicadorNps(
      'nps-pacientes',
      10,
      meses,
      resultados.map((r) => scoreOuNulo(r)),
      mes,
      mesAnterior,
      ['NPS_PACIENTES_TODOS'],
    );
  }

  private indicadorNps(
    id: 'nps-medicos' | 'nps-pacientes',
    numero: number,
    meses: readonly string[],
    scores: ReadonlyArray<number | null>,
    mes: string,
    mesAnterior: string,
    avisos: AvisoApresentacao[],
  ): IndicadorApresentacao {
    const porMes = new Map(meses.map((m, i) => [m, scores[i] ?? null]));
    return indicador({
      id,
      numero,
      formato: 'nps',
      grafico: 'tendencia',
      comparacao: 'MES_ANTERIOR',
      valor: porMes.get(mes) ?? null,
      anterior: porMes.get(mesAnterior) ?? null,
      serie: meses.map((m) => ({
        rotulo: m,
        chave: null,
        valor: porMes.get(m) ?? null,
        anterior: null,
      })),
      avisos,
    });
  }

  private mesesDaTendencia(mes: string): string[] {
    return Array.from({ length: MESES_TENDENCIA }, (_, i) =>
      somarMesesDe(mes, i - (MESES_TENDENCIA - 1)),
    );
  }
}
