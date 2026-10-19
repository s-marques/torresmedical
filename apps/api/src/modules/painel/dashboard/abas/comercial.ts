import { coluna, kpi, secao, tabela, TODOS_OS_GRAFICOS, type ConstrutorAba } from '../blocos';

export const abaComercial: ConstrutorAba = ({ profissionaisAtivos }) => [
  secao('indicadores', null, [
    kpi('medicos-ativos', 'Médicos Ativos', 'inteiro', profissionaisAtivos, 'profissionais ativos'),
    kpi('no-crm', 'No CRM', 'inteiro', null, 'total de negócios'),
    kpi('em-negociacao', 'Em Negociação', 'inteiro', null, 'ativos'),
    kpi('visitas', 'Visitas', 'inteiro', null, 'Conversão: —'),
    kpi('propostas-enviadas', 'Propostas Enviadas', 'inteiro'),
    kpi('aceitas', 'Aceitas', 'inteiro'),
    kpi('recusadas', 'Recusadas', 'inteiro'),
    kpi('contratos-fechados', 'Contratos Fechados', 'inteiro'),
    kpi('ticket-medio', 'Ticket Médio', 'moeda'),
    kpi('tempo-medio-fechamento', 'Tempo Médio Fech.', 'dias'),
  ]),
  secao('funil', null, [
    tabela(
      'pipeline-por-estagio',
      'Pipeline por Estágio',
      [coluna('estagio', 'Estágio'), coluna('quantidade', 'Qtd', 'inteiro')],
      { graficos: TODOS_OS_GRAFICOS, padrao: 'barras' },
    ),
    tabela(
      'motivos-de-perda',
      'Motivos de Perda',
      [coluna('motivo', 'Motivo'), coluna('quantidade', 'Qtd', 'inteiro')],
      { graficos: TODOS_OS_GRAFICOS, largura: 'meia' },
    ),
    tabela(
      'origem-dos-leads',
      'Origem dos Leads + Conversão',
      [
        coluna('origem', 'Origem'),
        coluna('total', 'Total', 'inteiro'),
        coluna('ganhos', 'Ganhos', 'inteiro'),
        coluna('conversao', '%', 'percentual'),
      ],
      { graficos: TODOS_OS_GRAFICOS, largura: 'meia' },
    ),
  ]),
  secao('dia-e-semana', null, [
    tabela(
      'agenda-do-dia',
      'Agenda do Dia',
      [coluna('hora', 'Hora', 'hora'), coluna('paciente', 'Paciente'), coluna('status', 'Status')],
      { largura: 'meia' },
    ),
    tabela(
      'aniversariantes-da-semana',
      'Aniversariantes da Semana',
      [coluna('nome', 'Nome'), coluna('dia', 'Dia')],
      { largura: 'meia' },
    ),
  ]),
];
