import type { PesquisaNps, ResumoNps } from '@torres/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { apiFalsa, chamadasPara, json, renderApp } from '@/test/render-app';
import { periodoPadrao } from './periodo';

vi.setConfig({ testTimeout: 20_000 });

const API = '/api/comercial-atendimento/pesquisa-nps';
const P1 = '00000000-0000-4000-8000-0000000000e1';
const P2 = '00000000-0000-4000-8000-0000000000e2';

const RESUMO: ResumoNps = {
  ...periodoPadrao(),
  score: 40,
  enviadas: 11,
  respondidas: 10,
  taxaResposta: 91,
  avaliacoes: 10,
  promotores: 6,
  neutros: 2,
  detratores: 2,
  percentualPromotores: 60,
  percentualNeutros: 20,
  percentualDetratores: 20,
};

const PESQUISAS: PesquisaNps[] = [
  {
    id: P1,
    paciente: 'Ana Fictícia',
    profissional: 'Dr. Fictício',
    status: 'RESPONDIDA',
    nota: 10,
    classificacao: 'PROMOTOR',
    comentario: 'Atendimento ótimo',
    enviadaEm: '2026-11-17T13:00:00.000Z',
    respondidaEm: '2026-11-17T14:00:00.000Z',
  },
  {
    id: P2,
    paciente: 'Bia Fictícia',
    profissional: 'Dr. Fictício',
    status: 'ENVIADA',
    nota: null,
    classificacao: null,
    comentario: null,
    enviadaEm: '2026-11-17T15:00:00.000Z',
    respondidaEm: null,
  },
];

const params = (url: string) => Object.fromEntries(new URL(url, 'http://x').searchParams);
const pagina = (data: PesquisaNps[]) =>
  json({ data, meta: { page: 1, pageSize: 10, total: data.length, totalPages: 1 } });

function renderTela(opcoes: { resumo?: ResumoNps; pesquisas?: PesquisaNps[] } = {}) {
  const fetchMock = apiFalsa({
    rotas: {
      [API]: () => pagina(opcoes.pesquisas ?? PESQUISAS),
      [`${API}/resumo`]: () => json(opcoes.resumo ?? RESUMO),
    },
  });
  return { user: userEvent.setup(), ...renderApp('/pesquisa-satisfacao', fetchMock) };
}

describe('Pesquisa NPS (/pesquisa-satisfacao)', () => {
  it('mostra título, abas e o filtro De/Até com o período dos últimos 30 dias', async () => {
    renderTela();
    expect(await screen.findByRole('heading', { name: 'Pesquisa de Satisfacao' })).toBeVisible();
    expect(
      screen.getByText('NPS - Avalie a satisfacao dos seus pacientes apos o atendimento.'),
    ).toBeVisible();
    for (const aba of ['Dashboard', 'Respostas', 'Configuracao']) {
      expect(screen.getByRole('tab', { name: aba })).toBeVisible();
    }
    const { de, ate } = periodoPadrao();
    expect(screen.getByLabelText('De')).toHaveValue(de);
    expect(screen.getByLabelText('Ate')).toHaveValue(ate);
    expect(screen.getByRole('button', { name: 'Carregar' })).toBeVisible();
  });

  it('Dashboard: score, faixa e cartões de envio e de classificação', async () => {
    renderTela();
    await waitFor(() => expect(screen.getByTestId('score-nps')).toHaveTextContent('40'));
    const painel = screen.getByTestId('dashboard-nps');
    expect(within(painel).getByText('Score NPS')).toBeVisible();
    expect(within(painel).getByText('Razoavel')).toBeVisible();
    for (const [rotulo, valor] of [
      ['Enviadas', '11'],
      ['Respondidas', '10'],
      ['Taxa Resposta', '91%'],
      ['Avaliacoes', '10'],
    ] as const) {
      expect(within(painel).getByText(rotulo).closest('div.rounded-lg')).toHaveTextContent(
        `${valor}${rotulo}`,
      );
    }
    expect(within(painel).getByText('Promotores (6)').closest('div')).toHaveTextContent('60%');
    expect(within(painel).getByText('Neutros (2)').closest('div')).toHaveTextContent('20%');
    expect(within(painel).getByText('Detratores (2)').closest('div')).toHaveTextContent('20%');
  });

  it('Dashboard sem pesquisas mostra tudo zerado', async () => {
    renderTela({
      resumo: {
        ...RESUMO,
        score: 0,
        enviadas: 0,
        respondidas: 0,
        taxaResposta: 0,
        avaliacoes: 0,
        promotores: 0,
        neutros: 0,
        detratores: 0,
        percentualPromotores: 0,
        percentualNeutros: 0,
        percentualDetratores: 0,
      },
    });
    await waitFor(() => expect(screen.getByText('Promotores (0)')).toBeVisible());
    expect(screen.getByTestId('score-nps')).toHaveTextContent('0');
    expect(screen.getByText('Taxa Resposta').closest('div')).toHaveTextContent('0%');
  });

  it('Respostas: colunas, busca, filtro de classificação e dados da linha', async () => {
    const { user, fetchMock } = renderTela();
    await user.click(await screen.findByRole('tab', { name: 'Respostas' }));
    await screen.findByText('Ana Fictícia');

    const cabecalhos = within(await screen.findByRole('table')).getAllByRole('columnheader');
    expect(cabecalhos.map((c) => c.textContent)).toEqual([
      'Enviada em',
      'Paciente',
      'Profissional',
      'Nota',
      'Classificação',
      'Comentário',
      'Respondida em',
      'Status',
    ]);
    expect(screen.getByPlaceholderText('Buscar paciente ou profissional...')).toBeVisible();
    expect(screen.getByRole('button', { name: /Colunas/ })).toBeVisible();

    const respondida = screen.getByText('Ana Fictícia').closest('tr')!;
    expect(respondida).toHaveTextContent('10');
    expect(respondida).toHaveTextContent('Promotor');
    expect(respondida).toHaveTextContent('Atendimento ótimo');
    expect(respondida).toHaveTextContent('Respondida');
    expect(screen.getByText('Bia Fictícia').closest('tr')).toHaveTextContent('Aguardando resposta');

    await user.click(screen.getByRole('button', { name: 'Detrator' }));
    await waitFor(() =>
      expect(params(chamadasPara(fetchMock, API).at(-1)?.[0] ?? '')).toMatchObject({
        classificacao: 'DETRATOR',
      }),
    );
  });

  it('Respostas vazias mostram a mensagem do legado', async () => {
    const { user } = renderTela({ pesquisas: [] });
    await user.click(await screen.findByRole('tab', { name: 'Respostas' }));
    expect(await screen.findByText('Nenhuma pesquisa encontrada no periodo.')).toBeVisible();
  });

  it('falha C3: o período aplicado vale para o Dashboard e para as Respostas', async () => {
    const { user, fetchMock } = renderTela();
    await screen.findByTestId('score-nps');

    const de = screen.getByLabelText('De');
    const ate = screen.getByLabelText('Ate');
    await user.clear(de);
    await user.type(de, '2026-06-01');
    await user.clear(ate);
    await user.type(ate, '2026-06-30');
    // Antes de "Carregar" nada muda.
    expect(params(chamadasPara(fetchMock, `${API}/resumo`).at(-1)?.[0] ?? '')).not.toMatchObject({
      de: '2026-06-01',
    });

    await user.click(screen.getByRole('button', { name: 'Carregar' }));
    await waitFor(() =>
      expect(params(chamadasPara(fetchMock, `${API}/resumo`).at(-1)?.[0] ?? '')).toMatchObject({
        de: '2026-06-01',
        ate: '2026-06-30',
      }),
    );

    await user.click(screen.getByRole('tab', { name: 'Respostas' }));
    await screen.findByText('Ana Fictícia');
    expect(params(chamadasPara(fetchMock, API).at(-1)?.[0] ?? '')).toMatchObject({
      de: '2026-06-01',
      ate: '2026-06-30',
    });

    // Voltar ao Dashboard continua no mesmo período.
    await user.click(screen.getByRole('tab', { name: 'Dashboard' }));
    expect(screen.getByLabelText('De')).toHaveValue('2026-06-01');
    expect(params(chamadasPara(fetchMock, `${API}/resumo`).at(-1)?.[0] ?? '')).toMatchObject({
      de: '2026-06-01',
    });
  });

  it('Configuração esconde o filtro e avisa que ainda será definida', async () => {
    const { user } = renderTela();
    await user.click(await screen.findByRole('tab', { name: 'Configuracao' }));
    expect(screen.getByText(/será disponibilizada/)).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Carregar' })).not.toBeInTheDocument();
  });
});
