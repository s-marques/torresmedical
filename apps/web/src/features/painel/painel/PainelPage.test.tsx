import {
  PERMISSOES,
  PREFERENCIAS_PADRAO,
  type AbaPainel,
  type DashboardPainel,
} from '@torres/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { apiFalsa, chamadasPara, json, renderApp, USUARIO_TESTE } from '@/test/render-app';
import { mesDe } from './filtros-painel';

const API = (aba: AbaPainel) => `/api/painel/dashboard/${aba}`;
const PERIODO = { de: '2026-10-01', ate: '2026-10-31' };

function dashboard(aba: AbaPainel, secoes: DashboardPainel['secoes']): DashboardPainel {
  return { aba, periodo: PERIODO, base: 'recebimento', secoes };
}

const EXECUTIVO = dashboard('executivo', [
  {
    id: 'indicadores',
    titulo: null,
    blocos: [
      {
        tipo: 'kpi',
        id: 'faturamento-total',
        rotulo: 'Faturamento Total',
        valor: null,
        formato: 'moeda',
        detalhe: null,
      },
      {
        tipo: 'kpi',
        id: 'taxa-ocupacao',
        rotulo: 'Taxa de Ocupação',
        valor: 28.8,
        formato: 'percentual',
        detalhe: null,
      },
    ],
  },
  {
    id: 'meta',
    titulo: null,
    blocos: [
      {
        tipo: 'meta-vs-atual',
        id: 'meta',
        titulo: 'Dashboard Executivo — Meta vs Atual',
        indicadores: [
          {
            id: 'ocupacao',
            rotulo: 'Taxa de Ocupação',
            meta: '≥85%',
            atual: 28.8,
            formato: 'percentual',
            destacarNegativo: false,
          },
          {
            id: 'resultado',
            rotulo: 'Resultado Operacional',
            meta: null,
            atual: -5404.45,
            formato: 'moeda',
            destacarNegativo: true,
          },
        ],
      },
    ],
  },
  {
    id: 'alertas',
    titulo: null,
    blocos: [
      {
        tipo: 'alerta',
        id: 'sem-cobranca',
        titulo: 'Contratos ativos sem cobrança neste mês',
        descricao: 'Não há parcela deste mês no Receber.',
        itens: [{ rotulo: 'Sala 1 — Fulano de Tal', valor: 'valor zerado' }],
      },
    ],
  },
  {
    id: 'graficos',
    titulo: null,
    blocos: [
      {
        tipo: 'tabela',
        id: 'por-sala',
        titulo: 'Ocupação por Sala',
        colunas: [
          { chave: 'sala', rotulo: 'Sala', formato: 'texto' },
          { chave: 'contratados', rotulo: 'Contratados', formato: 'inteiro' },
          { chave: 'livres', rotulo: 'Livres', formato: 'inteiro' },
        ],
        linhas: [
          { sala: 'Sala 1', contratados: 3, livres: 8 },
          { sala: 'Sala 2', contratados: 0, livres: 11 },
        ],
        visualizacoes: ['tabela', 'barras', 'pizza', 'linha'],
        padrao: 'tabela',
        largura: 'cheia',
      },
      {
        tipo: 'tabela',
        id: 'por-origem',
        titulo: 'Pacientes por Origem',
        colunas: [
          { chave: 'origem', rotulo: 'Origem', formato: 'texto' },
          { chave: 'pacientes', rotulo: 'Pacientes', formato: 'inteiro' },
        ],
        linhas: [],
        visualizacoes: ['tabela', 'barras'],
        padrao: 'tabela',
        largura: 'cheia',
      },
    ],
  },
]);

const COMERCIAL = dashboard('comercial', [
  {
    id: 'indicadores',
    titulo: 'PRODUÇÃO',
    blocos: [
      {
        tipo: 'kpi',
        id: 'medicos-ativos',
        rotulo: 'Médicos Ativos',
        valor: 14,
        formato: 'inteiro',
        detalhe: 'profissionais ativos',
      },
    ],
  },
]);

const LINK_JUNHO = '/receber?vencimentoDe=2026-06-01&vencimentoAte=2026-06-30';

/** Aba Hoje: um indicador do dia com lista própria, um do mês com o período no link e um sem link. */
const HOJE = dashboard('hoje', [
  {
    id: 'operacao',
    titulo: 'OPERAÇÃO — HOJE',
    blocos: [
      {
        tipo: 'kpi',
        id: 'faltas',
        rotulo: 'Faltas',
        valor: 2,
        formato: 'inteiro',
        detalhe: null,
        link: '/recepcao?status=FALTOU',
      },
    ],
  },
  {
    id: 'financeiro',
    titulo: 'FINANCEIRO',
    blocos: [
      {
        tipo: 'kpi',
        id: 'receita-contratada',
        rotulo: 'Receita contratada',
        valor: 1500,
        formato: 'moeda',
        detalhe: null,
        link: LINK_JUNHO,
      },
      {
        tipo: 'kpi',
        id: 'sem-lista',
        rotulo: 'Indicador sem lista',
        valor: 7,
        formato: 'inteiro',
        detalhe: null,
      },
    ],
  },
]);

const ALERTA_HOJE = {
  id: '00000000-0000-4000-8000-000000000009',
  tipo: 'RECEBIVEIS_VENCIDOS',
  data: '2026-11-27',
  quantidade: 3,
  rota: '/receber?status=VENCIDO',
  lido: false,
  resolvido: false,
};

const OCUPACAO = dashboard('ocupacao', [
  {
    id: 'indicadores',
    titulo: null,
    blocos: [
      {
        tipo: 'kpi',
        id: 'taxa-uso',
        rotulo: 'Taxa de Uso',
        valor: 18.2,
        formato: 'percentual',
        detalhe: 'mês anterior: 10%',
      },
    ],
  },
]);

function api(extra: Partial<Record<AbaPainel, DashboardPainel>> = {}) {
  const abas = { hoje: HOJE, executivo: EXECUTIVO, comercial: COMERCIAL, ...extra };
  return apiFalsa({
    rotas: Object.fromEntries(
      Object.entries(abas).map(([aba, corpo]) => [API(aba as AbaPainel), () => json(corpo)]),
    ),
  });
}

function consulta(fetchMock: ReturnType<typeof api>, aba: AbaPainel, indice = -1) {
  const chamadas = chamadasPara(fetchMock, API(aba));
  const [url] = chamadas.at(indice) ?? [''];
  return Object.fromEntries(new URL(url, 'http://x').searchParams);
}

describe('aba Hoje (#170)', () => {
  const comAlerta = () =>
    apiFalsa({
      rotas: {
        [API('hoje')]: () => json(HOJE),
        '/api/painel/alertas': () => json({ data: [ALERTA_HOJE], naoLidos: 1 }),
      },
    });

  it('é a aba padrão, mostra os blocos do dia e os alertas da central com o link da lista', async () => {
    const fetchMock = comAlerta();
    renderApp('/', fetchMock);

    expect(await screen.findByRole('tab', { name: 'Hoje', selected: true })).toBeInTheDocument();
    expect(await screen.findByTestId('kpi-faltas')).toHaveTextContent('2');
    expect(screen.getByText('OPERAÇÃO — HOJE')).toBeVisible();
    expect(screen.getByTestId('kpi-receita-contratada')).toHaveTextContent('R$ 1.500,00');

    const alertas = within(screen.getByRole('region', { name: 'Alertas do dia' }));
    expect(await alertas.findByRole('link', { name: '3 recebíveis vencidos' })).toHaveAttribute(
      'href',
      '/receber?status=VENCIDO',
    );
  });

  it('sem alertas no dia, avisa em vez de esconder o bloco', async () => {
    renderApp('/', api());

    expect(await screen.findByText('Nenhum alerta para hoje.')).toBeVisible();
  });

  it('só os indicadores com lista própria são clicáveis', async () => {
    renderApp('/', api());
    await screen.findByTestId('kpi-faltas');

    expect(screen.getByRole('link', { name: 'Ver a lista de Faltas' })).toHaveAttribute(
      'href',
      '/recepcao?status=FALTOU',
    );
    expect(screen.queryByRole('link', { name: /Indicador sem lista/ })).not.toBeInTheDocument();
  });

  it('falhas C3/C5 do DrIntelli: clicar num indicador de junho abre a lista de junho, não de outro mês', async () => {
    const user = userEvent.setup();
    const fetchMock = api();
    const { router } = renderApp('/?aba=hoje&mes=2026-06', fetchMock);

    await screen.findByTestId('kpi-receita-contratada');
    // O período escolhido é o que a API recebe para montar o link...
    expect(consulta(fetchMock, 'hoje')).toMatchObject({ modo: 'mes', mes: '2026-06' });

    await user.click(screen.getByRole('link', { name: 'Ver a lista de Receita contratada' }));

    // ...e a lista abre com esse mesmo período.
    await waitFor(() => expect(router.state.location.pathname).toBe('/receber'));
    expect(router.state.location.search).toBe('?vencimentoDe=2026-06-01&vencimentoAte=2026-06-30');
  });

  it('em inglês traduz os textos próprios da aba', async () => {
    const usuario = {
      ...USUARIO_TESTE,
      preferencias: { ...PREFERENCIAS_PADRAO, idioma: 'en' as const },
    };
    const fetchMock = apiFalsa({
      usuario,
      rotas: {
        [API('hoje')]: () => json(HOJE),
        '/api/painel/alertas': () => json({ data: [ALERTA_HOJE], naoLidos: 1 }),
      },
    });
    renderApp('/', fetchMock);

    const alertas = within(await screen.findByRole('region', { name: "Today's alerts" }));
    expect(await alertas.findByRole('link', { name: '3 overdue receivables' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'View the Faltas list' })).toBeVisible();
  });
});

describe('Painel (/)', () => {
  it('na aba Executivo, com o mês atual, e mostra indicadores, meta, alerta e tabelas', async () => {
    const fetchMock = api();
    renderApp('/?aba=executivo', fetchMock);

    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.getByText('Torres Medical Center — Visão completa')).toBeVisible();
    expect(screen.getByRole('tab', { name: 'Executivo', selected: true })).toBeInTheDocument();
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual([
      'Hoje',
      'Executivo',
      'Comercial',
      'Ocupação',
      'Financeiro',
      'Pacientes',
    ]);

    // Sem valor: "—", nunca um número inventado.
    expect(await screen.findByTestId('kpi-faturamento-total')).toHaveTextContent('—');
    expect(screen.getByTestId('kpi-taxa-ocupacao')).toHaveTextContent('28,8%');
    expect(screen.getByText('≥85%')).toBeVisible();
    expect(screen.getByText('-R$ 5.404,45')).toHaveClass('text-destructive');
    expect(screen.getByText('Contratos ativos sem cobrança neste mês (1)')).toBeVisible();
    expect(screen.getByText('Sala 1 — Fulano de Tal')).toBeVisible();
    expect(screen.getByText('Sem dados no período')).toBeVisible();

    expect(consulta(fetchMock, 'executivo')).toEqual({
      modo: 'mes',
      mes: mesDe(new Date()),
      base: 'recebimento',
    });
  });

  it('trocar de aba busca só a aba aberta e guarda a escolha na URL', async () => {
    const user = userEvent.setup();
    const fetchMock = api();
    const { router } = renderApp('/?aba=executivo', fetchMock);
    await screen.findByTestId('kpi-faturamento-total');

    await user.click(screen.getByRole('tab', { name: 'Comercial' }));

    expect(await screen.findByTestId('kpi-medicos-ativos')).toHaveTextContent('14');
    expect(screen.getByText('profissionais ativos')).toBeVisible();
    expect(screen.getByText('PRODUÇÃO')).toBeVisible();
    expect(screen.getByRole('tab', { name: 'Comercial', selected: true })).toBeInTheDocument();
    expect(router.state.location.search).toContain('aba=comercial');
    expect(chamadasPara(fetchMock, API('comercial'))).toHaveLength(1);
  });

  it('mês e base só valem ao clicar em Buscar', async () => {
    const user = userEvent.setup();
    const fetchMock = api();
    const { router } = renderApp('/?aba=executivo', fetchMock);
    await screen.findByTestId('kpi-faturamento-total');

    await user.click(screen.getByRole('combobox', { name: 'Mês' }));
    expect(await screen.findAllByRole('option')).toHaveLength(24);
    await user.click(screen.getByRole('option', { name: 'Janeiro de 2026' }));
    await user.click(screen.getByRole('combobox', { name: 'Base do período' }));
    await user.click(await screen.findByRole('option', { name: 'Competência' }));
    expect(chamadasPara(fetchMock, API('executivo'))).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: 'Buscar' }));

    await waitFor(() => expect(chamadasPara(fetchMock, API('executivo'))).toHaveLength(2));
    expect(consulta(fetchMock, 'executivo')).toEqual({
      modo: 'mes',
      mes: '2026-01',
      base: 'competencia',
    });
    expect(router.state.location.search).toContain('mes=2026-01');
  });

  it(
    'por período: mostra De/Até, valida antes de buscar e envia o período',
    { timeout: 20_000 },
    async () => {
      const user = userEvent.setup();
      const fetchMock = api();
      renderApp('/?aba=executivo', fetchMock);
      await screen.findByTestId('kpi-faturamento-total');

      await user.click(screen.getByRole('combobox', { name: 'Tipo de período' }));
      await user.click(await screen.findByRole('option', { name: 'Por período' }));
      expect(screen.queryByRole('combobox', { name: 'Mês' })).not.toBeInTheDocument();

      const filtros = within(screen.getByRole('form', { name: 'Filtros do dashboard' }));
      await user.click(screen.getByRole('button', { name: 'Buscar' }));
      expect(await filtros.findByRole('alert')).toHaveTextContent('Informe a data inicial');
      expect(chamadasPara(fetchMock, API('executivo'))).toHaveLength(1);

      await user.type(screen.getByLabelText('Data inicial'), '2026-10-20');
      await user.type(screen.getByLabelText('Data final'), '2026-10-10');
      await user.click(screen.getByRole('button', { name: 'Buscar' }));
      expect(await filtros.findByRole('alert')).toHaveTextContent(
        'A data inicial deve ser anterior ou igual à final',
      );

      await user.clear(screen.getByLabelText('Data final'));
      await user.type(screen.getByLabelText('Data final'), '2026-10-31');
      await user.click(screen.getByRole('button', { name: 'Buscar' }));

      await waitFor(() => expect(chamadasPara(fetchMock, API('executivo'))).toHaveLength(2));
      expect(consulta(fetchMock, 'executivo')).toEqual({
        modo: 'periodo',
        de: '2026-10-20',
        ate: '2026-10-31',
        base: 'recebimento',
      });
    },
  );

  it('abre direto na aba e nos filtros da URL', async () => {
    const fetchMock = api();
    renderApp(
      '/?aba=comercial&modo=periodo&de=2026-09-01&ate=2026-09-30&base=competencia',
      fetchMock,
    );

    expect(await screen.findByTestId('kpi-medicos-ativos')).toBeInTheDocument();
    expect(consulta(fetchMock, 'comercial')).toEqual({
      modo: 'periodo',
      de: '2026-09-01',
      ate: '2026-09-30',
      base: 'competencia',
    });
    expect(screen.getByLabelText('Data inicial')).toHaveValue('2026-09-01');
  });

  describe('aba Ocupação (#139)', () => {
    it('mostra os filtros só nessa aba e manda sala, turno e dia da semana na consulta', async () => {
      const fetchMock = api({ ocupacao: OCUPACAO });
      const user = userEvent.setup();
      const { router } = renderApp('/?aba=comercial', fetchMock);
      await screen.findByTestId('kpi-medicos-ativos');
      expect(screen.queryByRole('group', { name: 'Filtros da ocupação' })).toBeNull();

      await user.click(screen.getByRole('tab', { name: 'Ocupação' }));
      expect(await screen.findByTestId('kpi-taxa-uso')).toHaveTextContent('18,2%');
      expect(screen.getByText('mês anterior: 10%')).toBeVisible();
      expect(screen.getByRole('group', { name: 'Filtros da ocupação' })).toBeVisible();

      await user.click(screen.getByRole('combobox', { name: 'Turno' }));
      await user.click(await screen.findByRole('option', { name: 'Tarde' }));
      await user.click(screen.getByRole('combobox', { name: 'Dia da semana' }));
      await user.click(await screen.findByRole('option', { name: 'Quinta' }));

      expect(router.state.location.search).toContain('turno=TARDE');
      expect(router.state.location.search).toContain('diaSemana=4');
      await waitFor(() =>
        expect(consulta(fetchMock, 'ocupacao')).toMatchObject({ turno: 'TARDE', diaSemana: '4' }),
      );

      await user.click(screen.getByRole('button', { name: 'Limpar filtros' }));
      await waitFor(() => expect(router.state.location.search).not.toContain('turno='));
      expect(screen.getByRole('combobox', { name: 'Turno' })).toHaveTextContent('Todos os turnos');
      expect(screen.queryByRole('button', { name: 'Limpar filtros' })).toBeNull();
    }, 15000);

    it('abre direto nos filtros da URL e os mantém ao buscar outro mês', async () => {
      const fetchMock = api({ ocupacao: OCUPACAO });
      renderApp('/?aba=ocupacao&turno=NOITE&diaSemana=6', fetchMock);

      expect(await screen.findByTestId('kpi-taxa-uso')).toBeVisible();
      expect(consulta(fetchMock, 'ocupacao')).toMatchObject({ turno: 'NOITE', diaSemana: '6' });
      expect(screen.getByRole('combobox', { name: 'Turno' })).toHaveTextContent('Noite');
      expect(screen.getByRole('combobox', { name: 'Dia da semana' })).toHaveTextContent('Sábado');
    });

    it('em inglês, os filtros saem traduzidos', async () => {
      const usuario = {
        ...USUARIO_TESTE,
        preferencias: { ...PREFERENCIAS_PADRAO, idioma: 'en' as const },
      };
      const fetchMock = apiFalsa({
        usuario,
        rotas: { [API('ocupacao')]: () => json(OCUPACAO) },
      });
      renderApp('/?aba=ocupacao', fetchMock);

      expect(await screen.findByRole('group', { name: 'Occupancy filters' })).toBeVisible();
      expect(screen.getByRole('combobox', { name: 'Shift' })).toHaveTextContent('All shifts');
      expect(screen.getByRole('combobox', { name: 'Day of the week' })).toHaveTextContent(
        'All days',
      );
    }, 15000);
  });

  describe('tabela com alternância de visualização', () => {
    async function abrir() {
      const user = userEvent.setup();
      renderApp('/?aba=executivo', api());
      const titulo = await screen.findByText('Ocupação por Sala');
      const card = titulo.closest('[data-slot="card"]') as HTMLElement;
      return { user, card: within(card) };
    }

    it('começa na tabela e troca para barras, pizza e linha', async () => {
      const { user, card } = await abrir();
      expect(card.getByRole('table')).toBeVisible();
      expect(card.getByRole('button', { name: /^Tabela/ })).toHaveAttribute('aria-pressed', 'true');

      await user.click(card.getByRole('button', { name: /^Barras/ }));
      expect(card.getByRole('img', { name: 'Ocupação por Sala: barras' })).toBeVisible();
      expect(card.queryByRole('table')).not.toBeInTheDocument();

      await user.click(card.getByRole('button', { name: /^Pizza/ }));
      expect(card.getByRole('img', { name: 'Ocupação por Sala: pizza' })).toBeVisible();

      await user.click(card.getByRole('button', { name: /^Linha/ }));
      expect(card.getByRole('img', { name: 'Ocupação por Sala: linha' })).toBeVisible();

      await user.click(card.getByRole('button', { name: /^Tabela/ }));
      expect(card.getByRole('table')).toBeVisible();
    });

    it('com mais de uma coluna numérica, o gráfico usa a métrica escolhida', async () => {
      const { user, card } = await abrir();
      await user.click(card.getByRole('button', { name: /^Barras/ }));

      expect(card.getByText('3')).toBeVisible();
      await user.click(card.getByRole('combobox', { name: 'Métrica de Ocupação por Sala' }));
      await user.click(await screen.findByRole('option', { name: 'Livres' }));

      expect(card.getByText('11')).toBeVisible();
    });
  });

  it('erro da API mostra mensagem amigável', async () => {
    const fetchMock = apiFalsa({
      rotas: {
        [API('executivo')]: () =>
          json({ statusCode: 500, code: 'INTERNAL_ERROR', message: 'Erro interno' }, 500),
      },
    });
    renderApp('/?aba=executivo', fetchMock);

    expect(await screen.findByText(/Não foi possível carregar o dashboard/)).toBeVisible();
  });

  it('sem painel.painel.ver mostra "Sem permissão" e não chama a API', async () => {
    const usuario = {
      ...USUARIO_TESTE,
      permissoes: PERMISSOES.filter((p) => p !== 'painel.painel.ver'),
    };
    const fetchMock = apiFalsa({ usuario });
    renderApp('/?aba=executivo', fetchMock);

    expect(await screen.findByRole('heading', { name: 'Sem permissão' })).toBeInTheDocument();
    expect(chamadasPara(fetchMock, API('executivo'))).toHaveLength(0);
  });
});
