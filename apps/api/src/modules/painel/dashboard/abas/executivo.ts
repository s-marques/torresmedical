import type { ResumoParceiros } from '@torres/shared';
import {
  alerta,
  coluna,
  kpi,
  metaVsAtual,
  secao,
  tabela,
  TODOS_OS_GRAFICOS,
  type ConstrutorAba,
} from '../blocos';

/**
 * Metas da tabela "Meta vs Atual", como aparecem no print do sistema atual
 * (docs/inventario/img/painel-painel-executivo.png). Fixas até o dev confirmar se são
 * configuráveis (ver descrição do PR).
 */
function indicador(
  id: string,
  rotulo: string,
  formato: 'inteiro' | 'moeda' | 'percentual',
  meta: string | null = null,
  destacarNegativo = false,
) {
  return { id, rotulo, meta, atual: null, formato, destacarNegativo };
}

/** "1 profissional com baixa utilização": parceiros classificados como Em risco (#143). */
function alertaBaixaUtilizacao(parceiros: ResumoParceiros | null) {
  const emRisco = parceiros?.emRisco ?? [];
  const n = emRisco.length;
  return alerta(
    'baixa-utilizacao',
    `${n} ${n === 1 ? 'profissional' : 'profissionais'} com baixa utilização`,
    'Usaram menos de 50% dos períodos contratados nos últimos 30 dias. Veja o histórico em Profissionais.',
    emRisco.map((p) => ({ rotulo: p.nome, valor: p.motivoTexto })),
  );
}

export const abaExecutivo: ConstrutorAba = ({ parceiros }) => [
  // Os alertas só aparecem quando houver itens. Contratos sem cobrança ainda não tem origem de dados.
  secao('alertas', null, [
    ...alerta(
      'contratos-sem-cobranca',
      'Contratos ativos sem cobrança neste mês',
      'Não há parcela deste mês no Receber. Abra o contrato em Salas para gerar parcela, ou confirme que é permuta/isento.',
      [],
    ),
    ...alertaBaixaUtilizacao(parceiros),
  ]),
  secao('indicadores', null, [
    kpi('faturamento-total', 'Faturamento Total', 'moeda'),
    kpi('taxa-ocupacao', 'Taxa de Ocupação', 'percentual'),
    kpi('novos-clientes', 'Novos Clientes', 'inteiro', null, 'este mês'),
    kpi('cancelamentos', 'Cancelamentos (rescisão)', 'inteiro', null, 'no mês'),
    kpi('encerrados', 'Encerrados (término)', 'inteiro', null, 'no mês'),
    kpi('agendados-hoje', 'Agendados Hoje', 'inteiro'),
    kpi('atendidos-hoje', 'Atendidos Hoje', 'inteiro'),
    kpi('no-show', 'No Show', 'inteiro', null, 'faltas no mês'),
    kpi('resultado-operacional', 'Resultado Operacional', 'moeda'),
    kpi(
      'parceiros-em-risco',
      'Profissionais em Risco',
      'inteiro',
      parceiros?.porClassificacao.EM_RISCO ?? null,
      'baixa utilização nos últimos 30 dias',
    ),
    kpi(
      'parceiros-em-expansao',
      'Profissionais em Expansão',
      'inteiro',
      parceiros?.porClassificacao.EM_EXPANSAO ?? null,
      'mais períodos ou uso acima do contratado',
    ),
  ]),
  secao('meta-vs-atual', null, [
    metaVsAtual('dashboard-executivo', 'Dashboard Executivo — Meta vs Atual', [
      indicador('faturamento-total', 'Faturamento Total', 'moeda'),
      indicador('receita-recorrente', 'Receita Recorrente (contratos)', 'moeda'),
      indicador('receita-avulsa', 'Receita Avulsa', 'moeda'),
      indicador('taxa-ocupacao', 'Taxa de Ocupação', 'percentual', '≥85%'),
      indicador('vacancia', 'Vacância', 'percentual', '≤15%'),
      indicador('resultado-operacional', 'Resultado Operacional', 'moeda', null, true),
      indicador('novos-clientes', 'Novos Clientes', 'inteiro'),
      indicador('cancelamentos', 'Cancelamentos (rescisão)', 'inteiro', '0'),
      indicador('encerrados', 'Encerrados (término)', 'inteiro'),
      indicador('permutas-geradas', 'Valor de Permutas Geradas', 'moeda'),
      indicador('ticket-medio', 'Ticket Médio', 'moeda'),
      indicador('nps', 'NPS', 'inteiro', '≥40'),
    ]),
  ]),
  secao('graficos', null, [
    tabela(
      'ocupacao-por-sala-periodos',
      'Ocupação por Sala (períodos)',
      [
        coluna('sala', 'Sala'),
        coluna('contratados', 'Contratados', 'inteiro'),
        coluna('livres', 'Livres', 'inteiro'),
        coluna('ocupacao', 'Ocupação %', 'percentual'),
      ],
      { graficos: TODOS_OS_GRAFICOS, padrao: 'barras' },
    ),
    tabela(
      'pacientes-por-origem',
      'Pacientes por Origem (mês)',
      [coluna('origem', 'Origem'), coluna('pacientes', 'Pacientes', 'inteiro')],
      { graficos: TODOS_OS_GRAFICOS, padrao: 'barras' },
    ),
  ]),
];
