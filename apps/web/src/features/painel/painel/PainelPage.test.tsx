import { PERMISSOES, type AbaPainel, type DashboardPainel } from '@torres/shared';
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

function api(extra: Partial<Record<AbaPainel, DashboardPainel>> = {}) {
  const abas = { executivo: EXECUTIVO, comercial: COMERCIAL, ...extra };
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

describe('Painel (/)', () => {
  it('abre na aba Executivo, com o mês atual, e mostra indicadores, meta, alerta e tabelas', async () => {
    const fetchMock = api();
    renderApp('/', fetchMock);

    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.getByText('Torres Medical Center — Visão completa')).toBeVisible();
    expect(screen.getByRole('tab', { name: 'Executivo', selected: true })).toBeInTheDocument();
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual([
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
    const { router } = renderApp('/', fetchMock);
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
    const { router } = renderApp('/', fetchMock);
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
      renderApp('/', fetchMock);
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

  describe('tabela com alternância de visualização', () => {
    async function abrir() {
      const user = userEvent.setup();
      renderApp('/', api());
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
    renderApp('/', fetchMock);

    expect(await screen.findByText(/Não foi possível carregar o dashboard/)).toBeVisible();
  });

  it('sem painel.painel.ver mostra "Sem permissão" e não chama a API', async () => {
    const usuario = {
      ...USUARIO_TESTE,
      permissoes: PERMISSOES.filter((p) => p !== 'painel.painel.ver'),
    };
    const fetchMock = apiFalsa({ usuario });
    renderApp('/', fetchMock);

    expect(await screen.findByRole('heading', { name: 'Sem permissão' })).toBeInTheDocument();
    expect(chamadasPara(fetchMock, API('executivo'))).toHaveLength(0);
  });
});
