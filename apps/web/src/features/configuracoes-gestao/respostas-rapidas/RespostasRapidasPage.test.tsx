import { PERMISSOES, type RespostaRapida } from '@torres/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { apiFalsa, chamadasPara, json, renderApp, USUARIO_TESTE } from '@/test/render-app';

const API = '/api/configuracoes-gestao/respostas-rapidas';
const ID_1 = '00000000-0000-4000-8000-0000000000c1';
const ID_2 = '00000000-0000-4000-8000-0000000000c2';

function resposta(parcial: Partial<RespostaRapida>): RespostaRapida {
  return {
    id: ID_1,
    titulo: 'Boas-vindas',
    mensagem: 'Olá! Seja bem-vindo à clínica.',
    categoria: 'Geral',
    atalho: '/boasvindas',
    createdAt: '2026-11-03T12:00:00.000Z',
    updatedAt: '2026-11-03T12:00:00.000Z',
    ...parcial,
  };
}

const RESPOSTAS = [
  resposta({}),
  resposta({
    id: ID_2,
    titulo: 'Retorno',
    mensagem: 'Lembrete do seu retorno.',
    categoria: 'Agenda',
    atalho: null,
  }),
];

function pagina(data: RespostaRapida[]) {
  return json({ data, meta: { page: 1, pageSize: 100, total: data.length, totalPages: 1 } });
}

function corpoDe(init?: RequestInit): Record<string, unknown> {
  return JSON.parse(String(init?.body)) as Record<string, unknown>;
}

function api(rotas: Parameters<typeof apiFalsa>[0] = {}) {
  return apiFalsa({ ...rotas, rotas: { [API]: () => pagina(RESPOSTAS), ...rotas.rotas } });
}

function renderTela(fetchMock = api()) {
  return { user: userEvent.setup(), ...renderApp('/respostas-rapidas', fetchMock) };
}

function parametros(url: string) {
  return Object.fromEntries(new URL(url, 'http://x').searchParams);
}

function gets(fetchMock: Parameters<typeof chamadasPara>[0]) {
  return chamadasPara(fetchMock, API).filter(([, init]) => !init?.method || init.method === 'GET');
}

function posts(fetchMock: Parameters<typeof chamadasPara>[0]) {
  return chamadasPara(fetchMock, API).filter(([, init]) => init?.method === 'POST');
}

describe('Respostas Rápidas (/respostas-rapidas)', () => {
  it('mostra título, descrição, busca, botão e um card por resposta', async () => {
    const fetchMock = api();
    renderTela(fetchMock);

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Respostas Rápidas' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Mensagens padrão para uso no atendimento WhatsApp')).toBeVisible();
    expect(screen.getByRole('searchbox', { name: 'Buscar respostas rápidas' })).toHaveAttribute(
      'placeholder',
      'Buscar...',
    );
    expect(screen.getByRole('button', { name: 'Nova Resposta' })).toBeVisible();

    const boasVindas = (await screen.findByRole('heading', { name: 'Boas-vindas' })).closest('li');
    const card = within(boasVindas as HTMLElement);
    expect(card.getByText('Geral')).toBeVisible();
    expect(card.getByText('/boasvindas')).toBeVisible();
    expect(card.getByText('Olá! Seja bem-vindo à clínica.')).toBeVisible();

    const retorno = within(
      screen.getByRole('heading', { name: 'Retorno' }).closest('li') as HTMLElement,
    );
    expect(retorno.getByText('Agenda')).toBeVisible();
    expect(retorno.queryByText(/^\//)).not.toBeInTheDocument();

    const [url] = gets(fetchMock)[0] ?? [''];
    expect(parametros(url)).toEqual({ page: '1', pageSize: '100', sort: 'titulo:asc' });
  });

  it('lista vazia mostra o estado vazio e "Criar primeira resposta" abre o modal', async () => {
    const { user } = renderTela(api({ rotas: { [API]: () => pagina([]) } }));

    expect(await screen.findByText('Nenhuma resposta rápida cadastrada')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Criar primeira resposta' }));

    expect(await screen.findByRole('dialog', { name: 'Nova Resposta Rápida' })).toBeVisible();
  });

  it('busca envia "search" à API e mostra "nenhuma encontrada" sem o botão de criar', async () => {
    // Primeira carga com as respostas; as buscas seguintes voltam vazias.
    let cargas = 0;
    const fetchMock = api({
      rotas: { [API]: () => (cargas++ === 0 ? pagina(RESPOSTAS) : pagina([])) },
    });
    const { user } = renderTela(fetchMock);
    await screen.findByText('Boas-vindas');

    await user.type(screen.getByRole('searchbox', { name: 'Buscar respostas rápidas' }), ' xyz ');

    expect(await screen.findByText('Nenhuma resposta rápida encontrada.')).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Criar primeira resposta' }),
    ).not.toBeInTheDocument();
    const ultima = gets(fetchMock).at(-1)?.[0] ?? '';
    expect(parametros(ultima)).toMatchObject({ search: 'xyz' });
  });

  it('Nova Resposta: abre com os campos do inventário e Categoria "Geral"', async () => {
    const { user } = renderTela();
    await screen.findByText('Boas-vindas');

    await user.click(screen.getByRole('button', { name: 'Nova Resposta' }));
    const modal = within(await screen.findByRole('dialog', { name: 'Nova Resposta Rápida' }));

    expect(modal.getByPlaceholderText('Ex: Boas-vindas')).toHaveValue('');
    expect(modal.getByPlaceholderText('Digite o texto da mensagem padrão...')).toHaveValue('');
    expect(modal.getByLabelText('Categoria')).toHaveValue('Geral');
    expect(modal.getByLabelText('Atalho')).toHaveAttribute('placeholder', '/boasvindas');
    expect(modal.getByRole('button', { name: 'Criar' })).toBeVisible();
    expect(modal.getByRole('button', { name: 'Cancelar' })).toBeVisible();
  });

  it('Nova Resposta: campos vazios mostram as mensagens de obrigatório e não envia', async () => {
    const fetchMock = api();
    const { user } = renderTela(fetchMock);
    await screen.findByText('Boas-vindas');

    await user.click(screen.getByRole('button', { name: 'Nova Resposta' }));
    const modal = within(await screen.findByRole('dialog', { name: 'Nova Resposta Rápida' }));
    await user.click(modal.getByRole('button', { name: 'Criar' }));

    expect(await modal.findByText('Título é obrigatório.')).toBeVisible();
    expect(modal.getByText('Mensagem é obrigatória.')).toBeVisible();
    expect(posts(fetchMock)).toHaveLength(0);
  });

  it('Nova Resposta: atalho sem "/" é recusado antes de enviar', async () => {
    const fetchMock = api();
    const { user } = renderTela(fetchMock);
    await screen.findByText('Boas-vindas');

    await user.click(screen.getByRole('button', { name: 'Nova Resposta' }));
    const modal = within(await screen.findByRole('dialog', { name: 'Nova Resposta Rápida' }));
    await user.type(modal.getByLabelText(/Título/), 'Oi');
    await user.type(modal.getByLabelText(/Mensagem/), 'Olá');
    await user.type(modal.getByLabelText('Atalho'), 'oi');
    await user.click(modal.getByRole('button', { name: 'Criar' }));

    expect(await modal.findByText(/O atalho deve começar com "\/"/)).toBeVisible();
    expect(posts(fetchMock)).toHaveLength(0);
  });

  it('Nova Resposta: salva, fecha o modal e recarrega a lista', async () => {
    let corpo: Record<string, unknown> = {};
    const fetchMock = api({
      rotas: {
        [API]: (init) => {
          if (init?.method !== 'POST') return pagina(RESPOSTAS);
          corpo = corpoDe(init);
          return json(resposta({ id: '00000000-0000-4000-8000-0000000000c3' }), 201);
        },
      },
    });
    const { user } = renderTela(fetchMock);
    await screen.findByText('Boas-vindas');

    await user.click(screen.getByRole('button', { name: 'Nova Resposta' }));
    const modal = within(await screen.findByRole('dialog', { name: 'Nova Resposta Rápida' }));
    await user.type(modal.getByLabelText(/Título/), 'Pós-consulta');
    await user.type(modal.getByLabelText(/Mensagem/), 'Como você está?');
    await user.type(modal.getByLabelText('Atalho'), '/pos');
    await user.click(modal.getByRole('button', { name: 'Criar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(corpo).toEqual({
      titulo: 'Pós-consulta',
      mensagem: 'Como você está?',
      categoria: 'Geral',
      atalho: '/pos',
    });
    expect(gets(fetchMock)).toHaveLength(2);
  });

  it('atalho duplicado (400 da API) aparece no campo Atalho', async () => {
    const fetchMock = api({
      rotas: {
        [API]: (init) =>
          init?.method === 'POST'
            ? json(
                {
                  statusCode: 400,
                  code: 'ATALHO_DUPLICADO',
                  message: 'Já existe uma resposta rápida com este atalho',
                  details: [
                    { field: 'atalho', message: 'Já existe uma resposta rápida com este atalho' },
                  ],
                },
                400,
              )
            : pagina(RESPOSTAS),
      },
    });
    const { user } = renderTela(fetchMock);
    await screen.findByText('Boas-vindas');

    await user.click(screen.getByRole('button', { name: 'Nova Resposta' }));
    const modal = within(await screen.findByRole('dialog', { name: 'Nova Resposta Rápida' }));
    await user.type(modal.getByLabelText(/Título/), 'Outra');
    await user.type(modal.getByLabelText(/Mensagem/), 'Texto');
    await user.type(modal.getByLabelText('Atalho'), '/boasvindas');
    await user.click(modal.getByRole('button', { name: 'Criar' }));

    expect(await modal.findByText('Já existe uma resposta rápida com este atalho')).toBeVisible();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('Editar: abre com os valores atuais e envia PATCH com Salvar', async () => {
    let corpo: Record<string, unknown> = {};
    const { user } = renderTela(
      api({
        rotas: {
          [`${API}/${ID_2}`]: (init) => {
            corpo = corpoDe(init);
            return json(resposta({ id: ID_2, titulo: 'Retorno 2' }));
          },
        },
      }),
    );
    await screen.findByText('Retorno');

    await user.click(screen.getByRole('button', { name: 'Editar Retorno' }));
    const modal = within(await screen.findByRole('dialog', { name: 'Editar Resposta Rápida' }));
    expect(modal.getByLabelText(/Título/)).toHaveValue('Retorno');
    expect(modal.getByLabelText(/Mensagem/)).toHaveValue('Lembrete do seu retorno.');
    expect(modal.getByLabelText('Categoria')).toHaveValue('Agenda');
    expect(modal.getByLabelText('Atalho')).toHaveValue('');
    await user.type(modal.getByLabelText(/Título/), ' 2');
    await user.click(modal.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(corpo).toEqual({
      titulo: 'Retorno 2',
      mensagem: 'Lembrete do seu retorno.',
      categoria: 'Agenda',
      atalho: null,
    });
  });

  it('Esc fecha o modal sem salvar', async () => {
    const fetchMock = api();
    const { user } = renderTela(fetchMock);
    await screen.findByText('Boas-vindas');

    await user.click(screen.getByRole('button', { name: 'Nova Resposta' }));
    await screen.findByRole('dialog', { name: 'Nova Resposta Rápida' });
    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(posts(fetchMock)).toHaveLength(0);
  });

  it('Excluir: pede confirmação e só exclui ao confirmar', async () => {
    let excluido = false;
    const { user } = renderTela(
      api({
        rotas: {
          [`${API}/${ID_2}`]: () => {
            excluido = true;
            return json(resposta({ id: ID_2 }));
          },
        },
      }),
    );
    await screen.findByText('Retorno');

    await user.click(screen.getByRole('button', { name: 'Excluir Retorno' }));
    const dialogo = await screen.findByRole('alertdialog', { name: 'Excluir resposta rápida' });
    expect(within(dialogo).getByText('Deseja excluir a resposta rápida "Retorno"?')).toBeVisible();

    await user.click(within(dialogo).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(excluido).toBe(false);

    await user.click(screen.getByRole('button', { name: 'Excluir Retorno' }));
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Confirmar' }),
    );
    await waitFor(() => expect(excluido).toBe(true));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
  });

  it('sem permissão de criar, editar e excluir, esconde os botões', async () => {
    const somenteVer = PERMISSOES.filter((p) => p === 'configuracoes-gestao.respostas-rapidas.ver');
    renderTela(api({ usuario: { ...USUARIO_TESTE, permissoes: somenteVer } }));

    await screen.findByText('Boas-vindas');

    expect(screen.queryByRole('button', { name: 'Nova Resposta' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Editar Boas-vindas' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Excluir Boas-vindas' })).not.toBeInTheDocument();
  });

  it('sem permissão de criar, o estado vazio não mostra "Criar primeira resposta"', async () => {
    const somenteVer = PERMISSOES.filter((p) => p === 'configuracoes-gestao.respostas-rapidas.ver');
    renderTela(
      api({
        usuario: { ...USUARIO_TESTE, permissoes: somenteVer },
        rotas: { [API]: () => pagina([]) },
      }),
    );

    expect(await screen.findByText('Nenhuma resposta rápida cadastrada')).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Criar primeira resposta' }),
    ).not.toBeInTheDocument();
  });

  it('erro ao carregar mostra mensagem e permite tentar de novo', async () => {
    let falhar = true;
    const { user } = renderTela(
      api({
        rotas: {
          [API]: () =>
            falhar
              ? json({ statusCode: 500, code: 'ERRO_INTERNO', message: 'Erro interno' }, 500)
              : pagina(RESPOSTAS),
        },
      }),
    );

    expect(await screen.findByText(/Não foi possível carregar/)).toBeVisible();
    falhar = false;
    await user.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByText('Boas-vindas')).toBeVisible();
  });
});
