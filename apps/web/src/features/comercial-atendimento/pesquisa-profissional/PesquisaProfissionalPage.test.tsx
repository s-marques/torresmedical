import {
  PERMISSOES,
  PREFERENCIAS_PADRAO,
  type PesquisaProfissional,
  type PesquisaProfissionalConfig,
  type ResumoPesquisaProfissional,
} from '@torres/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { apiFalsa, chamadasPara, json, renderApp, USUARIO_TESTE } from '@/test/render-app';
import { periodoPadrao } from '../pesquisa-nps/periodo';

vi.setConfig({ testTimeout: 20_000 });

const API = '/api/comercial-atendimento/pesquisa-profissional';
const P1 = '00000000-0000-4000-8000-0000000000e1';
const P2 = '00000000-0000-4000-8000-0000000000e2';
const PROF_A = '00000000-0000-4000-8000-0000000000a1';
const PROF_B = '00000000-0000-4000-8000-0000000000a2';

const RESUMO: ResumoPesquisaProfissional = {
  ...periodoPadrao(),
  score: 33,
  enviadas: 4,
  respondidas: 3,
  taxaResposta: 75,
  avaliacoes: 3,
  promotores: 2,
  neutros: 0,
  detratores: 1,
  categorias: [
    { categoria: 'ESTRUTURA', media: 4, avaliacoes: 3 },
    { categoria: 'RECEPCAO', media: 3.3, avaliacoes: 3 },
    { categoria: 'AGENDA', media: 3, avaliacoes: 3 },
    { categoria: 'ATENDIMENTO', media: 4.5, avaliacoes: 3 },
  ],
};

const PESQUISAS: PesquisaProfissional[] = [
  {
    id: P1,
    profissionalId: PROF_A,
    profissional: 'Dra. Ana Fictícia',
    tipo: 'TRINTA_DIAS',
    status: 'RESPONDIDA',
    notaEstrutura: 5,
    notaRecepcao: 4,
    notaAgenda: 3,
    notaAtendimento: 5,
    nps: 10,
    comentario: 'Tudo certo por aqui',
    enviadaEm: '2026-11-17T13:00:00.000Z',
    respondidaEm: '2026-11-17T14:00:00.000Z',
  },
  {
    id: P2,
    profissionalId: PROF_B,
    profissional: 'Dr. Beto Fictício',
    tipo: 'PERIODICA',
    status: 'ENVIADA',
    notaEstrutura: null,
    notaRecepcao: null,
    notaAgenda: null,
    notaAtendimento: null,
    nps: null,
    comentario: null,
    enviadaEm: '2026-11-17T15:00:00.000Z',
    respondidaEm: null,
  },
];

const CONFIG: PesquisaProfissionalConfig = {
  ativo: true,
  periodicidadeMeses: 6,
  mensagem: 'Oi {nome}! Responda: {link}',
  atualizadoEm: null,
};

const params = (url: string) => Object.fromEntries(new URL(url, 'http://x').searchParams);
const pagina = (data: PesquisaProfissional[]) =>
  json({ data, meta: { page: 1, pageSize: 10, total: data.length, totalPages: 1 } });

function renderTela(
  opcoes: {
    permissoes?: readonly string[];
    resumo?: ResumoPesquisaProfissional;
    idioma?: 'en' | 'es';
  } = {},
) {
  const fetchMock = apiFalsa({
    usuario: {
      ...USUARIO_TESTE,
      permissoes: [...(opcoes.permissoes ?? PERMISSOES)] as typeof USUARIO_TESTE.permissoes,
      preferencias: { ...PREFERENCIAS_PADRAO, ...(opcoes.idioma ? { idioma: opcoes.idioma } : {}) },
    },
    rotas: {
      [API]: () => pagina(PESQUISAS),
      [`${API}/resumo`]: () => json(opcoes.resumo ?? RESUMO),
      [`${API}/configuracao`]: (init) =>
        init?.method === 'PUT'
          ? json({
              ...CONFIG,
              ...JSON.parse(String(init.body)),
              atualizadoEm: '2026-11-17T12:00:00.000Z',
            })
          : json(CONFIG),
      '/api/lookups/profissionais': () =>
        json({
          data: [
            { id: PROF_A, label: 'Dra. Ana Fictícia', descricao: null },
            { id: PROF_B, label: 'Dr. Beto Fictício', descricao: null },
          ],
          meta: { page: 1, pageSize: 20, total: 2, totalPages: 1 },
        }),
    },
  });
  return { user: userEvent.setup(), ...renderApp('/pesquisa-profissional', fetchMock) };
}

describe('Pesquisa do Profissional (/pesquisa-profissional)', () => {
  it('mostra título, abas e o filtro De/Até com os últimos 30 dias', async () => {
    renderTela();
    expect(await screen.findByRole('heading', { name: 'Pesquisa do Profissional' })).toBeVisible();
    for (const aba of ['Resultados', 'Respostas', 'Configuração']) {
      expect(screen.getByRole('tab', { name: aba })).toBeVisible();
    }
    const { de, ate } = periodoPadrao();
    expect(screen.getByLabelText('De')).toHaveValue(de);
    expect(screen.getByLabelText('Até')).toHaveValue(ate);
    expect(screen.getByRole('button', { name: 'Carregar' })).toBeVisible();
  });

  it('Resultados: NPS dos profissionais, faixa, cartões e média de estrelas por categoria', async () => {
    renderTela();
    await waitFor(() =>
      expect(screen.getByTestId('score-pesquisa-profissional')).toHaveTextContent('33'),
    );
    const painel = screen.getByTestId('resultados-pesquisa-profissional');
    expect(within(painel).getByText('NPS dos profissionais')).toBeVisible();
    expect(within(painel).getByText('Razoável')).toBeVisible();
    for (const [rotulo, valor] of [
      ['Enviadas', '4'],
      ['Respondidas', '3'],
      ['Taxa de resposta', '75%'],
      ['Promotores / Neutros / Detratores', '2 / 0 / 1'],
    ] as const) {
      expect(within(painel).getByText(rotulo).closest('div.rounded-lg')).toHaveTextContent(
        `${valor}${rotulo}`,
      );
    }
    expect(screen.getByTestId('media-ESTRUTURA')).toHaveTextContent('4,0');
    expect(screen.getByTestId('media-RECEPCAO')).toHaveTextContent('3,3');
    expect(screen.getByTestId('media-AGENDA')).toHaveTextContent('3,0');
    expect(screen.getByTestId('media-ATENDIMENTO')).toHaveTextContent('4,5');
  });

  it('categoria sem avaliações mostra "-" em vez de média zerada', async () => {
    renderTela({
      resumo: {
        ...RESUMO,
        score: 0,
        avaliacoes: 0,
        categorias: RESUMO.categorias.map((c) => ({ ...c, media: 0, avaliacoes: 0 })),
      },
    });
    await waitFor(() => expect(screen.getByTestId('media-AGENDA')).toHaveTextContent('-'));
    expect(screen.getByTestId('media-AGENDA')).not.toHaveTextContent('0,0');
  });

  it('Respostas: lista com notas por categoria, NPS, comentário e status', async () => {
    const { user } = renderTela();
    await user.click(await screen.findByRole('tab', { name: 'Respostas' }));
    const ana = (await screen.findByText('Dra. Ana Fictícia')).closest('tr') as HTMLElement;
    expect(within(ana).getByText('30 dias')).toBeVisible();
    expect(within(ana).getByText('Tudo certo por aqui')).toBeVisible();
    expect(within(ana).getByText('Respondida')).toBeVisible();
    expect(within(ana).getByText('10')).toBeVisible();
    const beto = screen.getByText('Dr. Beto Fictício').closest('tr') as HTMLElement;
    expect(within(beto).getByText('Periódica')).toBeVisible();
    expect(within(beto).getByText('Aguardando resposta')).toBeVisible();
  });

  it('Carregar usa o mesmo período e profissional no resumo e na lista de Respostas', async () => {
    const { user, fetchMock } = renderTela();
    await screen.findByRole('heading', { name: 'Pesquisa do Profissional' });
    await user.clear(screen.getByLabelText('De'));
    await user.type(screen.getByLabelText('De'), '2026-06-01');
    await user.clear(screen.getByLabelText('Até'));
    await user.type(screen.getByLabelText('Até'), '2026-06-30');
    await user.click(screen.getByLabelText('Profissional'));
    await user.click(await screen.findByText('Dra. Ana Fictícia'));
    await user.click(screen.getByRole('button', { name: 'Carregar' }));

    const filtro = { de: '2026-06-01', ate: '2026-06-30', profissionalId: PROF_A };
    await waitFor(() => {
      const ultimas = chamadasPara(fetchMock, `${API}/resumo`).at(-1);
      expect(params(ultimas?.[0] ?? '')).toMatchObject(filtro);
    });
    await user.click(screen.getByRole('tab', { name: 'Respostas' }));
    await waitFor(() => {
      const ultima = chamadasPara(fetchMock, API).at(-1);
      expect(params(ultima?.[0] ?? '')).toMatchObject(filtro);
    });
    // O filtro vale também na volta para Resultados (falha C3 do legado).
    await user.click(screen.getByRole('tab', { name: 'Resultados' }));
    expect(params(chamadasPara(fetchMock, `${API}/resumo`).at(-1)?.[0] ?? '')).toMatchObject(
      filtro,
    );
  });

  describe('Configuração', () => {
    it('mostra os valores atuais e salva ativação, periodicidade e mensagem', async () => {
      const { user, fetchMock } = renderTela();
      await user.click(await screen.findByRole('tab', { name: 'Configuração' }));
      // Sem filtro de período nesta aba.
      expect(screen.queryByRole('button', { name: 'Carregar' })).not.toBeInTheDocument();
      const periodicidade = await screen.findByLabelText(/Periodicidade/);
      expect(periodicidade).toHaveValue(6);

      await user.clear(periodicidade);
      await user.type(periodicidade, '3');
      await user.click(screen.getByRole('button', { name: 'Salvar' }));

      await waitFor(() => {
        const put = fetchMock.mock.calls.find(
          ([url, init]) => url === `${API}/configuracao` && init?.method === 'PUT',
        );
        expect(JSON.parse(String(put?.[1]?.body))).toEqual({
          ativo: true,
          periodicidadeMeses: 3,
          mensagem: 'Oi {nome}! Responda: {link}',
        });
      });
      expect(await screen.findByText('Configuração salva.')).toBeVisible();
    });

    it('não envia mensagem sem {link} nem periodicidade fora de 1 a 24', async () => {
      const { user, fetchMock } = renderTela();
      await user.click(await screen.findByRole('tab', { name: 'Configuração' }));
      const mensagem = await screen.findByLabelText(/Mensagem/);
      await user.clear(mensagem);
      await user.type(mensagem, 'Sem variavel');
      await user.click(screen.getByRole('button', { name: 'Salvar' }));
      expect(await screen.findByText('A mensagem deve conter a variável {link}')).toBeVisible();

      await user.clear(mensagem);
      await user.type(mensagem, 'Oi {{nome}: {{link}');
      const periodicidade = screen.getByLabelText(/Periodicidade/);
      await user.clear(periodicidade);
      await user.type(periodicidade, '25');
      await user.click(screen.getByRole('button', { name: 'Salvar' }));
      expect(
        await screen.findByText('A periodicidade deve ser de no máximo 24 meses'),
      ).toBeVisible();
      expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'PUT')).toHaveLength(0);
    });

    it('sem a permissão de editar não há botão Salvar e os campos ficam desabilitados', async () => {
      const permissoes = PERMISSOES.filter(
        (p) => p !== 'comercial-atendimento.pesquisa-profissional.editar',
      );
      const { user } = renderTela({ permissoes });
      await user.click(await screen.findByRole('tab', { name: 'Configuração' }));
      expect(await screen.findByLabelText(/Periodicidade/)).toBeDisabled();
      expect(screen.queryByRole('button', { name: 'Salvar' })).not.toBeInTheDocument();
    });
  });

  it('em inglês: textos, abas e rótulos traduzidos', async () => {
    const { user } = renderTela({ idioma: 'en' });
    expect(await screen.findByRole('heading', { name: 'Professional Survey' })).toBeVisible();
    for (const aba of ['Results', 'Responses', 'Settings']) {
      expect(screen.getByRole('tab', { name: aba })).toBeVisible();
    }
    await waitFor(() =>
      expect(
        within(screen.getByTestId('resultados-pesquisa-profissional')).getByText(
          'Professionals NPS',
        ),
      ).toBeVisible(),
    );
    expect(screen.getByTestId('media-ESTRUTURA')).toHaveTextContent('Facilities');
    await user.click(screen.getByRole('tab', { name: 'Responses' }));
    // Aparece no chip de filtro e no selo da linha.
    expect(await screen.findAllByText('Awaiting response')).toHaveLength(2);
  });

  it('em espanhol: título e abas traduzidos', async () => {
    renderTela({ idioma: 'es' });
    expect(await screen.findByRole('heading', { name: 'Encuesta del Profesional' })).toBeVisible();
    for (const aba of ['Resultados', 'Respuestas', 'Configuración']) {
      expect(screen.getByRole('tab', { name: aba })).toBeVisible();
    }
  });
});
