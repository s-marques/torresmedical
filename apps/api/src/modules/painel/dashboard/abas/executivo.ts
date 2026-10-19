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

export const abaExecutivo: ConstrutorAba = () => [
  // Sem origem de dados ainda (contratos): o alerta só aparece quando houver itens.
  secao(
    'alertas',
    null,
    alerta(
      'contratos-sem-cobranca',
      'Contratos ativos sem cobrança neste mês',
      'Não há parcela deste mês no Receber. Abra o contrato em Salas para gerar parcela, ou confirme que é permuta/isento.',
      [],
    ),
  ),
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
