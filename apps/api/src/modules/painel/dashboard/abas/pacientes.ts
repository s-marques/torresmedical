import { coluna, kpi, secao, tabela, TODOS_OS_GRAFICOS, type ConstrutorAba } from '../blocos';

export const abaPacientes: ConstrutorAba = ({ totalPacientes }) => [
  secao('producao-assistencial', 'PRODUÇÃO ASSISTENCIAL', [
    kpi('consultas', 'Consultas', 'inteiro'),
    kpi('primeiras', 'Primeiras', 'inteiro'),
    kpi('retornos', 'Retornos', 'inteiro'),
    kpi('procedimentos', 'Procedimentos', 'inteiro'),
    kpi('teleconsultas', 'Teleconsultas', 'inteiro'),
    kpi('novos-pacientes', 'Novos Pacientes', 'inteiro'),
  ]),
  secao('agenda-e-no-show', 'AGENDA & NO SHOW', [
    kpi('agendados', 'Agendados', 'inteiro'),
    kpi('realizadas', 'Realizadas', 'inteiro'),
    kpi('confirmadas', 'Confirmadas', 'inteiro'),
    kpi('canceladas', 'Canceladas', 'inteiro'),
    kpi('no-show', 'No Show', 'inteiro', null, '% | reincid.'),
    kpi('ocupacao-agenda', 'Ocupação Agenda', 'percentual'),
    tabela(
      'ranking-menor-faltas',
      'Ranking — Menor % Faltas',
      [
        coluna('profissional', 'Profissional'),
        coluna('agendamentos', 'Agend.', 'inteiro'),
        coluna('faltas', 'Faltas', 'inteiro'),
        coluna('percentual', '%', 'percentual'),
      ],
      { graficos: TODOS_OS_GRAFICOS, largura: 'meia' },
    ),
    tabela(
      'captacao-origem',
      'Captação — Origem dos Pacientes',
      [coluna('origem', 'Origem'), coluna('pacientes', 'Pacientes', 'inteiro')],
      { graficos: TODOS_OS_GRAFICOS, padrao: 'pizza', largura: 'meia' },
    ),
  ]),
  secao('fidelizacao', 'FIDELIZAÇÃO', [
    kpi('total-pacientes', 'Total Pacientes', 'inteiro', totalPacientes),
    kpi('ativos-90d', 'Ativos (90d)', 'inteiro'),
    kpi('inativos', 'Inativos', 'inteiro'),
    kpi('retorno-30d', 'Retorno 30d', 'inteiro'),
    kpi('sem-retorno-90d', 'S/ Retorno 90d', 'inteiro'),
    kpi('sem-retorno-180d', 'S/ Retorno 180d', 'inteiro'),
    tabela(
      'ranking-fidelizacao',
      'Ranking Fidelização por Profissional',
      [
        coluna('profissional', 'Profissional'),
        coluna('pacientes', 'Pacientes', 'inteiro'),
        coluna('consultas', 'Consultas', 'inteiro'),
        coluna('frequenciaMedia', 'Freq. Média', 'decimal'),
      ],
      { graficos: TODOS_OS_GRAFICOS },
    ),
  ]),
  secao('perfil', 'PERFIL DOS PACIENTES', [
    tabela(
      'perfil-sexo',
      'Sexo',
      [coluna('sexo', 'Sexo'), coluna('quantidade', 'Qtd', 'inteiro')],
      {
        graficos: TODOS_OS_GRAFICOS,
        padrao: 'pizza',
        largura: 'meia',
      },
    ),
    tabela(
      'perfil-faixa-etaria',
      'Faixa Etária',
      [coluna('faixa', 'Faixa'), coluna('quantidade', 'Qtd', 'inteiro')],
      { graficos: TODOS_OS_GRAFICOS, padrao: 'barras', largura: 'meia' },
    ),
    tabela(
      'perfil-cidade',
      'Cidade',
      [coluna('cidade', 'Cidade'), coluna('quantidade', 'Qtd', 'inteiro')],
      { graficos: TODOS_OS_GRAFICOS, largura: 'meia' },
    ),
    tabela(
      'perfil-bairro',
      'Bairro',
      [coluna('bairro', 'Bairro'), coluna('quantidade', 'Qtd', 'inteiro')],
      { graficos: TODOS_OS_GRAFICOS, largura: 'meia' },
    ),
  ]),
  secao('nps', 'NPS & EXPERIÊNCIA', [
    kpi('nps-score', 'NPS Score', 'inteiro'),
    kpi('promotores', 'Promotores (9-10)', 'inteiro'),
    kpi('neutros', 'Neutros (7-8)', 'inteiro'),
    kpi('detratores', 'Detratores (0-6)', 'inteiro'),
    kpi('media', 'Média', 'decimal', null, 'respostas'),
    tabela(
      'ranking-medicos-mes',
      'Ranking Completo dos Médicos (mês)',
      [
        coluna('medico', 'Médico'),
        coluna('especialidade', 'Especialidade'),
        coluna('producao', 'Produção', 'inteiro'),
        coluna('noShow', 'No Show', 'inteiro'),
        coluna('agenda', 'Agenda', 'inteiro'),
      ],
      { graficos: TODOS_OS_GRAFICOS },
    ),
  ]),
];
