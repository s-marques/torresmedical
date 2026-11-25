import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  PREFERENCIAS_PADRAO,
  type ProfissionalHistoricoEvento,
  type UsuarioSessao,
} from '@torres/shared';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { AppProviders } from '@/app/providers/AppProviders';
import { entrar } from '@/lib/auth/sessao';
import { apiFalsa, chamadasPara, json, sessaoJson, USUARIO_TESTE } from '@/test/render-app';
import { HistoricoProfissional } from './HistoricoProfissional';

vi.setConfig({ testTimeout: 20_000 });

const PROF = '00000000-0000-4000-8000-0000000000a1';
const NEGOCIO = '00000000-0000-4000-8000-0000000000e1';
const URL_HISTORICO = `/api/gestao-profissionais/profissionais/${PROF}/historico`;
const URL_VINCULAVEIS = '/api/comercial-atendimento/pipeline/negocios/vinculaveis';
const URL_VINCULO = `/api/comercial-atendimento/pipeline/negocios/${NEGOCIO}/profissional`;

const EVENTOS: ProfissionalHistoricoEvento[] = [
  {
    id: 'negocio:1:LEAD_CRIADO',
    tipo: 'CRM',
    evento: 'LEAD_CRIADO',
    ocorridoEm: '2026-10-12T15:00:00.000Z',
    somenteData: false,
    detalhe: 'Lead Dra. Ana Fictícia',
    autor: null,
    link: '/negocios',
  },
  {
    id: 'negocio:1:atividade:1',
    tipo: 'CRM',
    evento: 'ATIVIDADE_CONCLUIDA',
    ocorridoEm: '2026-10-14T15:00:00.000Z',
    somenteData: false,
    detalhe: 'Ligar para apresentar a clínica',
    autor: 'Maria Fictícia',
    link: '/atividades',
  },
  {
    id: 'contrato:1:assinado',
    tipo: 'CONTRATO',
    evento: 'CONTRATO_ASSINADO',
    ocorridoEm: '2026-11-05T00:00:00.000Z',
    somenteData: true,
    detalhe: 'Sala 7',
    autor: null,
    link: '/salas',
  },
  {
    id: 'atendimento:1:primeiro',
    tipo: 'ATENDIMENTO',
    evento: 'PRIMEIRO_ATENDIMENTO',
    ocorridoEm: '2026-11-10T15:00:00.000Z',
    somenteData: false,
    detalhe: null,
    autor: null,
    link: null,
  },
];

/** Resposta da API para o filtro pedido na query string. */
function respostaDoHistorico(_init: RequestInit | undefined, url: string) {
  const tipo = new URL(url, 'http://localhost').searchParams.get('tipo');
  return json({ data: EVENTOS.filter((e) => !tipo || e.tipo === tipo) });
}

async function renderSecao(
  rotas: NonNullable<Parameters<typeof apiFalsa>[0]>['rotas'] = {},
  usuario: UsuarioSessao = USUARIO_TESTE,
) {
  const fetchMock = apiFalsa({
    usuario,
    rotas: {
      '/api/auth/login': () => sessaoJson(usuario),
      [URL_HISTORICO]: respostaDoHistorico,
      ...rotas,
    },
  });
  vi.stubGlobal('fetch', fetchMock);
  await entrar({ email: 'pessoa@example.com', senha: 'x' });
  const router = createMemoryRouter(
    [{ path: '/', element: <HistoricoProfissional profissionalId={PROF} /> }],
    { initialEntries: ['/'] },
  );
  render(
    <AppProviders onUnauthorized={vi.fn()}>
      <RouterProvider router={router} />
    </AppProviders>,
  );
  return { fetchMock, user: userEvent.setup() };
}

describe('Histórico do relacionamento no detalhe do profissional', () => {
  it('lista os eventos na ordem recebida, com data, autor e link da origem', async () => {
    await renderSecao();

    expect(
      await screen.findByRole('heading', { name: 'Histórico do relacionamento' }),
    ).toBeVisible();
    await screen.findByText('Lead criado');
    const itens = screen.getAllByRole('listitem');
    expect(itens.map((i) => i.querySelector('.font-medium')?.textContent)).toEqual([
      'Lead criado',
      'Atividade concluída',
      'Contrato assinado',
      'Primeiro atendimento',
    ]);
    const atividade = itens[1] as HTMLElement;
    expect(within(atividade).getByText('Ligar para apresentar a clínica')).toBeVisible();
    expect(within(atividade).getByText('por Maria Fictícia')).toBeVisible();
    expect(within(atividade).getByRole('link', { name: 'Abrir Atividades' })).toHaveAttribute(
      'href',
      '/atividades',
    );
    // Evento só com o dia não muda de dia pelo fuso e não mostra hora.
    const contrato = itens[2] as HTMLElement;
    expect(within(contrato).getByText('05/11/2026')).toBeVisible();
    expect(within(contrato).getByRole('link', { name: 'Abrir Salas' })).toHaveAttribute(
      'href',
      '/salas',
    );
    expect(within(itens[3] as HTMLElement).queryByRole('link')).not.toBeInTheDocument();
  });

  it('filtra por tipo de evento pedindo à API e permite voltar a Todos', async () => {
    const { user, fetchMock } = await renderSecao();
    await screen.findByText('Lead criado');
    expect(screen.getByRole('button', { name: 'Todos' })).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getByRole('button', { name: 'Contrato' }));

    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(1));
    expect(screen.getByRole('button', { name: 'Contrato' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.queryByText('Lead criado')).not.toBeInTheDocument();
    expect(
      chamadasPara(fetchMock, URL_HISTORICO).some(([url]) => url.includes('tipo=CONTRATO')),
    ).toBe(true);

    await user.click(screen.getByRole('button', { name: 'Todos' }));
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(4));
  });

  it('mostra o estado vazio e o erro de carregamento', async () => {
    await renderSecao({ [URL_HISTORICO]: () => json({ data: [] }) });
    expect(
      await screen.findByText('Nenhum evento registrado para este profissional.'),
    ).toBeVisible();
  });

  it('avisa quando não consegue carregar', async () => {
    await renderSecao({
      [URL_HISTORICO]: () => json({ statusCode: 500, code: 'ERRO', message: 'Erro' }, 500),
    });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível carregar o histórico.',
    );
  });

  it('vincula um negócio do CRM ao profissional e recarrega a linha do tempo', async () => {
    const corpos: unknown[] = [];
    const { user, fetchMock } = await renderSecao({
      [URL_VINCULAVEIS]: () =>
        json({
          data: [
            {
              id: NEGOCIO,
              titulo: 'Lead Dr. Bruno Fictício',
              estagio: 'Proposta',
              status: 'GANHO',
              criadoEm: '2026-10-12T15:00:00.000Z',
            },
          ],
          meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
        }),
      [URL_VINCULO]: (init) => {
        corpos.push(JSON.parse(String(init?.body)));
        return json({
          id: NEGOCIO,
          titulo: 'Lead Dr. Bruno Fictício',
          estagio: 'Proposta',
          status: 'GANHO',
          criadoEm: '2026-10-12T15:00:00.000Z',
          profissionalId: PROF,
        });
      },
    });
    await screen.findByText('Lead criado');

    await user.click(screen.getByRole('button', { name: 'Vincular negócio do CRM' }));
    expect(await screen.findByText('Lead Dr. Bruno Fictício')).toBeVisible();
    expect(screen.getByText(/Estágio: Proposta · Ganho/)).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Vincular: Lead Dr. Bruno Fictício' }));

    await waitFor(() => expect(corpos).toEqual([{ profissionalId: PROF }]));
    await waitFor(() => expect(chamadasPara(fetchMock, URL_HISTORICO).length).toBeGreaterThan(1));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('busca os negócios pelo título digitado', async () => {
    const { user, fetchMock } = await renderSecao({
      [URL_VINCULAVEIS]: () =>
        json({ data: [], meta: { page: 1, pageSize: 20, total: 0, totalPages: 0 } }),
    });
    await screen.findByText('Lead criado');
    await user.click(screen.getByRole('button', { name: 'Vincular negócio do CRM' }));

    expect(await screen.findByText('Nenhum negócio disponível para vincular.')).toBeVisible();
    await user.type(screen.getByRole('searchbox', { name: 'Buscar negócio por título' }), 'bruno');

    await waitFor(() =>
      expect(
        chamadasPara(fetchMock, URL_VINCULAVEIS).some(([url]) => url.includes('search=bruno')),
      ).toBe(true),
    );
  });

  it('esconde "Vincular negócio" de quem não pode editar o pipeline', async () => {
    await renderSecao(
      {},
      {
        ...USUARIO_TESTE,
        permissoes: USUARIO_TESTE.permissoes.filter(
          (p) => p !== 'comercial-atendimento.pipeline.editar',
        ),
      },
    );

    await screen.findByText('Lead criado');
    expect(
      screen.queryByRole('button', { name: 'Vincular negócio do CRM' }),
    ).not.toBeInTheDocument();
  });

  it('mostra os textos em inglês', async () => {
    await renderSecao(
      {},
      { ...USUARIO_TESTE, preferencias: { ...PREFERENCIAS_PADRAO, idioma: 'en' } },
    );

    expect(await screen.findByRole('heading', { name: 'Relationship history' })).toBeVisible();
    expect(await screen.findByText('Lead created')).toBeVisible();
    expect(screen.getByText('First appointment')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Link CRM deal' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Contract' })).toBeVisible();
    expect(screen.getByText('by Maria Fictícia')).toBeVisible();
  });
});
