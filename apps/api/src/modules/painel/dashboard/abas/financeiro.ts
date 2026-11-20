import { coluna, kpi, secao, tabela, TODOS_OS_GRAFICOS, type ConstrutorAba } from '../blocos';

export const abaFinanceiro: ConstrutorAba = ({ financeiro }) => [
  secao('indicadores', null, [
    kpi('faturamento-total', 'Faturamento Total', 'moeda', financeiro?.faturamentoTotal),
    kpi(
      'receita-recorrente',
      'Receita Recorrente (contratos)',
      'moeda',
      financeiro?.receitaRecorrente,
    ),
    kpi('receita-avulsa', 'Receita Avulsa', 'moeda', financeiro?.receitaAvulsa),
    kpi(
      'resultado-operacional',
      'Resultado Operacional',
      'moeda',
      financeiro?.resultadoOperacional,
    ),
    kpi('ticket-medio', 'Ticket Médio', 'moeda'),
    kpi('inadimplencia', 'Inadimplência', 'moeda', null, '% | dias de atraso'),
    kpi('valor-de-permutas', 'Valor de Permutas', 'moeda'),
    kpi('despesas', 'Despesas', 'moeda', financeiro?.despesasPagas),
    kpi('clientes-ativos', 'Nº Clientes Ativos', 'inteiro'),
  ]),
  secao('graficos', null, [
    tabela(
      'receita-por-tipo',
      'Receita por Tipo',
      [coluna('tipo', 'Tipo'), coluna('valor', 'Valor', 'moeda')],
      { graficos: TODOS_OS_GRAFICOS, padrao: 'pizza', largura: 'meia' },
    ),
    tabela(
      'receita-por-categoria',
      'Receita por Categoria (Plano de Contas)',
      [coluna('categoria', 'Categoria'), coluna('valor', 'Valor', 'moeda')],
      { graficos: TODOS_OS_GRAFICOS, padrao: 'pizza', largura: 'meia' },
    ),
    tabela(
      'despesas-por-categoria',
      'Despesas por Categoria',
      [coluna('categoria', 'Categoria'), coluna('valor', 'Valor', 'moeda')],
      { graficos: TODOS_OS_GRAFICOS, padrao: 'pizza', largura: 'meia' },
    ),
    tabela(
      'receita-x-despesa',
      'Receita x Despesa — 6 meses',
      [
        coluna('mes', 'Mês'),
        coluna('despesa', 'Despesa', 'moeda'),
        coluna('receita', 'Receita', 'moeda'),
      ],
      { graficos: ['barras', 'linha'], padrao: 'barras' },
    ),
    tabela(
      'receita-por-sala',
      'Receita por Sala',
      [
        coluna('sala', 'Sala'),
        coluna('profissional', 'Ocupação (Profissional)'),
        coluna('receita', 'Receita', 'moeda'),
      ],
      { graficos: TODOS_OS_GRAFICOS },
    ),
    tabela(
      'ranking-receita-por-medico',
      'Ranking Receita por Médico',
      [
        coluna('medico', 'Médico'),
        coluna('especialidade', 'Especialidade'),
        coluna('receita', 'Receita', 'moeda'),
      ],
      { graficos: TODOS_OS_GRAFICOS, largura: 'meia' },
    ),
    tabela(
      'ranking-por-especialidade',
      'Ranking por Especialidade',
      [coluna('especialidade', 'Especialidade'), coluna('receita', 'Receita', 'moeda')],
      { graficos: TODOS_OS_GRAFICOS, largura: 'meia' },
    ),
    tabela(
      'custos-fixos',
      'Custos Fixos',
      [
        coluna('item', 'Item'),
        coluna('quantidade', 'Qtd', 'inteiro'),
        coluna('valorUnitario', 'Valor Unit.', 'moeda'),
        coluna('total', 'Total', 'moeda'),
        coluna('percentual', '%', 'percentual'),
      ],
      { graficos: TODOS_OS_GRAFICOS },
    ),
    tabela(
      'valor-economico-das-permutas',
      'Valor Econômico das Permutas',
      [coluna('parceiro', 'Parceiro'), coluna('valorMercado', 'Valor Mercado', 'moeda')],
      { graficos: TODOS_OS_GRAFICOS },
    ),
    tabela('contas-a-pagar-da-semana', 'Contas a Pagar da Semana', [
      coluna('descricao', 'Descrição'),
      coluna('vencimento', 'Vencimento', 'data'),
      coluna('valor', 'Valor', 'moeda'),
    ]),
  ]),
];
