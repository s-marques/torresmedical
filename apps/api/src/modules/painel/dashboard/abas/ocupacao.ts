import { coluna, kpi, secao, tabela, TODOS_OS_GRAFICOS, type ConstrutorAba } from '../blocos';

export const abaOcupacao: ConstrutorAba = () => [
  secao('indicadores', null, [
    kpi('total-periodos', 'Total Períodos', 'inteiro', null, 'salas x períodos'),
    kpi('contratados', 'Contratados', 'inteiro', null, 'livres'),
    kpi('taxa-ocupacao', 'Taxa Ocupação', 'percentual', null, 'períodos ocupados'),
    kpi('vacancia', 'Vacância', 'percentual', null, 'períodos livres'),
  ]),
  secao('graficos', null, [
    tabela(
      'periodos-ocupados-por-dia',
      'Períodos Ocupados por Dia',
      [
        coluna('dia', 'Dia'),
        coluna('manha', 'Manhã', 'inteiro'),
        coluna('tarde', 'Tarde', 'inteiro'),
        coluna('livres', 'Livres', 'inteiro'),
      ],
      { graficos: ['barras', 'linha'], padrao: 'barras' },
    ),
    tabela(
      'ranking-ocupacao-por-sala',
      'Ranking — Ocupação por Sala',
      [
        coluna('sala', 'Sala'),
        coluna('contratados', 'Contratados', 'inteiro'),
        coluna('livres', 'Livres', 'inteiro'),
        coluna('ocupacao', 'Ocupação %', 'percentual'),
      ],
      { graficos: TODOS_OS_GRAFICOS, largura: 'meia' },
    ),
    tabela(
      'ocupacao-por-especialidade',
      'Ocupação por Especialidade',
      [
        coluna('especialidade', 'Especialidade'),
        coluna('contratos', 'Contratos', 'inteiro'),
        coluna('periodos', 'Períodos', 'inteiro'),
      ],
      { graficos: TODOS_OS_GRAFICOS, largura: 'meia' },
    ),
    tabela(
      'ocupacao-por-profissional',
      'Ocupação por Profissional',
      [
        coluna('profissional', 'Profissional'),
        coluna('especialidade', 'Especialidade'),
        coluna('salas', 'Salas', 'inteiro'),
        coluna('periodos', 'Períodos', 'inteiro'),
        coluna('valor', 'Valor', 'moeda'),
      ],
      { graficos: TODOS_OS_GRAFICOS },
    ),
    tabela('horarios-ociosos', 'Horários Ociosos', [
      coluna('horario', 'Dia e período'),
      coluna('salasLivres', 'Salas livres', 'inteiro'),
      coluna('salas', 'Salas'),
    ]),
  ]),
];
