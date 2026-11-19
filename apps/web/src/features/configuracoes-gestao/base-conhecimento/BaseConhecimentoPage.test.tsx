import type { DocumentoConhecimento } from '@torres/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { apiFalsa, chamadasPara, json, renderApp, USUARIO_TESTE } from '@/test/render-app';

vi.setConfig({ testTimeout: 20_000 });

const API = '/api/configuracoes-gestao/base-conhecimento';
const ID_1 = '00000000-0000-4000-8000-0000000000d1';
const ID_2 = '00000000-0000-4000-8000-0000000000d2';
const PROF = '00000000-0000-4000-8000-0000000000e1';

function documento(parcial: Partial<DocumentoConhecimento>): DocumentoConhecimento {
  return {
    id: ID_1,
    titulo: 'Preparo para ultrassom',
    profissionalId: null,
    categoria: 'Preparo de Exame',
    conteudo: 'Jejum de 8 horas.',
    indexadoEm: '2026-11-03T12:00:00.000Z',
    createdAt: '2026-11-03T12:00:00.000Z',
    updatedAt: '2026-11-03T12:00:00.000Z',
    ...parcial,
  };
}

const DOCUMENTOS = [
  documento({}),
  documento({
    id: ID_2,
    titulo: 'Convênios aceitos',
    profissionalId: PROF,
    categoria: 'Convênio',
    conteudo: 'Atendemos os convênios A e B.',
    indexadoEm: null,
  }),
];

function pagina(data: DocumentoConhecimento[]) {
  return json({ data, meta: { page: 1, pageSize: 100, total: data.length, totalPages: 1 } });
}

const corpoDe = (init?: RequestInit) => JSON.parse(String(init?.body)) as Record<string, unknown>;

function api(rotas: Parameters<typeof apiFalsa>[0] = {}) {
  const item = { id: PROF, label: 'Dra. Ana Teste', descricao: null };
  return apiFalsa({
    ...rotas,
    rotas: {
      [API]: () => pagina(DOCUMENTOS),
      '/api/lookups/profissionais': () =>
        json({ data: [item], meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 } }),
      [`/api/lookups/profissionais/${PROF}`]: () => json(item),
      ...rotas.rotas,
    },
  });
}

function renderTela(fetchMock = api()) {
  return { user: userEvent.setup(), ...renderApp('/base-conhecimento', fetchMock) };
}

const gets = (fetchMock: Parameters<typeof chamadasPara>[0]) =>
  chamadasPara(fetchMock, API).filter(([, init]) => !init?.method || init.method === 'GET');
const posts = (fetchMock: Parameters<typeof chamadasPara>[0]) =>
  chamadasPara(fetchMock, API).filter(([, init]) => init?.method === 'POST');
const parametros = (url: string) => Object.fromEntries(new URL(url, 'http://x').searchParams);

describe('Base de Conhecimento (/base-conhecimento)', () => {
  it('mostra título, descrição, busca, filtros, botão e um card por documento', async () => {
    const fetchMock = api();
    renderTela(fetchMock);

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Base de Conhecimento' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Informações que o agente IA usa para responder pacientes/),
    ).toBeVisible();
    expect(screen.getByRole('searchbox', { name: 'Buscar documentos' })).toBeVisible();
    expect(screen.getByRole('combobox', { name: 'Profissional' })).toHaveTextContent('Todos');
    expect(screen.getByRole('combobox', { name: 'Categoria' })).toHaveTextContent('Todas');
    expect(screen.getByRole('button', { name: 'Novo Documento' })).toBeVisible();

    const geral = within(
      (await screen.findByRole('heading', { name: 'Preparo para ultrassom' })).closest(
        'li',
      ) as HTMLElement,
    );
    expect(geral.getByText('Preparo de Exame')).toBeVisible();
    expect(geral.getByText('Geral (todos os profissionais)')).toBeVisible();
    expect(geral.getByText('Indexado')).toBeVisible();
    expect(geral.getByText('Jejum de 8 horas.')).toBeVisible();

    const convenio = within(
      screen.getByRole('heading', { name: 'Convênios aceitos' }).closest('li') as HTMLElement,
    );
    expect(await convenio.findByText('Dra. Ana Teste')).toBeVisible();
    expect(convenio.queryByText('Indexado')).not.toBeInTheDocument();

    const [url] = gets(fetchMock)[0] ?? [''];
    expect(parametros(url)).toEqual({ page: '1', pageSize: '100', sort: 'titulo:asc' });
  });

  it('lista vazia mostra o estado vazio e "Criar primeiro documento" abre o modal', async () => {
    const { user } = renderTela(api({ rotas: { [API]: () => pagina([]) } }));

    expect(await screen.findByText('Nenhum documento cadastrado')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Criar primeiro documento' }));

    expect(await screen.findByRole('dialog', { name: 'Novo Documento' })).toBeVisible();
  });

  it('busca e categoria enviam os filtros à API', async () => {
    const fetchMock = api();
    const { user } = renderTela(fetchMock);
    await screen.findByText('Convênios aceitos');

    await user.type(screen.getByRole('searchbox', { name: 'Buscar documentos' }), ' jejum ');
    await waitFor(() =>
      expect(parametros(gets(fetchMock).at(-1)?.[0] ?? '')).toMatchObject({ search: 'jejum' }),
    );

    await user.click(screen.getByRole('combobox', { name: 'Categoria' }));
    expect(screen.getAllByRole('option').map((opcao) => opcao.textContent)).toEqual([
      'Todas',
      'Geral',
      'Procedimento',
      'Preparo de Exame',
      'Pós-procedimento',
      'Pergunta Frequente',
      'Convênio',
      'Protocolo',
      'Orientação',
    ]);
    await user.click(screen.getByRole('option', { name: 'Convênio' }));
    await waitFor(() =>
      expect(parametros(gets(fetchMock).at(-1)?.[0] ?? '')).toMatchObject({
        search: 'jejum',
        categoria: 'Convênio',
      }),
    );
  });

  it('filtra por profissional', async () => {
    const fetchMock = api();
    const { user } = renderTela(fetchMock);
    await screen.findByText('Convênios aceitos');

    await user.click(screen.getByRole('combobox', { name: 'Profissional' }));
    await user.click(await screen.findByText('Dra. Ana Teste', { selector: '[cmdk-item] *' }));

    await waitFor(() =>
      expect(parametros(gets(fetchMock).at(-1)?.[0] ?? '')).toMatchObject({ profissionalId: PROF }),
    );
  });

  it('sem resultado com filtro mostra "Nenhum documento encontrado."', async () => {
    let cargas = 0;
    const { user } = renderTela(
      api({ rotas: { [API]: () => (cargas++ === 0 ? pagina(DOCUMENTOS) : pagina([])) } }),
    );
    await screen.findByText('Convênios aceitos');

    await user.type(screen.getByRole('searchbox', { name: 'Buscar documentos' }), 'xyz');

    expect(await screen.findByText('Nenhum documento encontrado.')).toBeVisible();
  });

  it('Novo Documento: abre com os campos do inventário e "Salvar e Indexar"', async () => {
    const { user } = renderTela();
    await screen.findByText('Convênios aceitos');

    await user.click(screen.getByRole('button', { name: 'Novo Documento' }));
    const modal = within(await screen.findByRole('dialog', { name: 'Novo Documento' }));

    expect(modal.getByLabelText(/Título/)).toHaveValue('');
    expect(modal.getByLabelText('Profissional')).toHaveTextContent('Geral (todos)');
    expect(modal.getByLabelText('Categoria')).toHaveTextContent('Geral');
    expect(modal.getByLabelText(/Conteúdo/)).toHaveValue('');
    expect(modal.getByRole('button', { name: 'Salvar e Indexar' })).toBeVisible();
    expect(modal.getByRole('button', { name: 'Cancelar' })).toBeVisible();
  });

  it('Novo Documento: campos vazios mostram as mensagens de obrigatório e não envia', async () => {
    const fetchMock = api();
    const { user } = renderTela(fetchMock);
    await screen.findByText('Convênios aceitos');

    await user.click(screen.getByRole('button', { name: 'Novo Documento' }));
    const modal = within(await screen.findByRole('dialog', { name: 'Novo Documento' }));
    await user.click(modal.getByRole('button', { name: 'Salvar e Indexar' }));

    expect(await modal.findByText('Título é obrigatório.')).toBeVisible();
    expect(modal.getByText('Conteúdo é obrigatório.')).toBeVisible();
    expect(posts(fetchMock)).toHaveLength(0);
  });

  it('Novo Documento: salva sem profissional, fecha o modal e recarrega a lista', async () => {
    let corpo: Record<string, unknown> = {};
    const fetchMock = api({
      rotas: {
        [API]: (init) => {
          if (init?.method !== 'POST') return pagina(DOCUMENTOS);
          corpo = corpoDe(init);
          return json(documento({ id: '00000000-0000-4000-8000-0000000000d3' }), 201);
        },
      },
    });
    const { user } = renderTela(fetchMock);
    await screen.findByText('Convênios aceitos');

    await user.click(screen.getByRole('button', { name: 'Novo Documento' }));
    const modal = within(await screen.findByRole('dialog', { name: 'Novo Documento' }));
    await user.type(modal.getByLabelText(/Título/), 'Retorno');
    await user.type(modal.getByLabelText(/Conteúdo/), 'Retorno em 30 dias.');
    await user.click(modal.getByRole('button', { name: 'Salvar e Indexar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(corpo).toEqual({
      titulo: 'Retorno',
      profissionalId: null,
      categoria: 'Geral',
      conteudo: 'Retorno em 30 dias.',
    });
    expect(gets(fetchMock)).toHaveLength(2);
  });

  it('erro 400 da API no profissional aparece no campo', async () => {
    const fetchMock = api({
      rotas: {
        [API]: (init) =>
          init?.method === 'POST'
            ? json(
                {
                  statusCode: 400,
                  code: 'PROFISSIONAL_INVALIDO',
                  message: 'Profissional não encontrado',
                  details: [{ field: 'profissionalId', message: 'Profissional não encontrado' }],
                },
                400,
              )
            : pagina(DOCUMENTOS),
      },
    });
    const { user } = renderTela(fetchMock);
    await screen.findByText('Convênios aceitos');

    await user.click(screen.getByRole('button', { name: 'Novo Documento' }));
    const modal = within(await screen.findByRole('dialog', { name: 'Novo Documento' }));
    await user.type(modal.getByLabelText(/Título/), 'FAQ');
    await user.type(modal.getByLabelText(/Conteúdo/), 'Texto');
    await user.click(modal.getByRole('button', { name: 'Salvar e Indexar' }));

    expect(await modal.findByText('Profissional não encontrado')).toBeVisible();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('Editar: abre com os valores atuais e envia PATCH com Salvar e Indexar', async () => {
    let corpo: Record<string, unknown> = {};
    const { user } = renderTela(
      api({
        rotas: {
          [`${API}/${ID_2}`]: (init) => {
            corpo = corpoDe(init);
            return json(documento({ id: ID_2, titulo: 'Convênios 2' }));
          },
        },
      }),
    );
    await screen.findByText('Convênios aceitos');

    await user.click(screen.getByRole('button', { name: 'Editar Convênios aceitos' }));
    const modal = within(await screen.findByRole('dialog', { name: 'Editar Documento' }));
    expect(modal.getByLabelText(/Título/)).toHaveValue('Convênios aceitos');
    expect(modal.getByLabelText('Categoria')).toHaveTextContent('Convênio');
    expect(modal.getByLabelText(/Conteúdo/)).toHaveValue('Atendemos os convênios A e B.');
    await user.type(modal.getByLabelText(/Título/), ' 2');
    await user.click(modal.getByRole('button', { name: 'Salvar e Indexar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(corpo).toEqual({
      titulo: 'Convênios aceitos 2',
      profissionalId: PROF,
      categoria: 'Convênio',
      conteudo: 'Atendemos os convênios A e B.',
    });
  });

  it('sem permissão de criar e editar esconde "Novo Documento" e o lápis', async () => {
    const somenteVer = ['configuracoes-gestao.base-conhecimento.ver' as const];
    renderTela(api({ usuario: { ...USUARIO_TESTE, permissoes: somenteVer } }));

    await screen.findByText('Convênios aceitos');
    expect(screen.queryByRole('button', { name: 'Novo Documento' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Editar / })).not.toBeInTheDocument();
  });
});
