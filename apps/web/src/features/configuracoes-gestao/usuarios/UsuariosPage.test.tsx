import { PERMISSOES, type Usuario } from '@torres/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { apiFalsa, chamadasPara, json, renderApp, USUARIO_TESTE } from '@/test/render-app';

// Tela com grid, vários modais e comboboxes: estoura os 5 s padrão no CI (cobertura).
vi.setConfig({ testTimeout: 20_000 });

const API = '/api/configuracoes-gestao/usuarios';
const ID_1 = '00000000-0000-4000-8000-0000000000c1';
const ID_2 = '00000000-0000-4000-8000-0000000000c2';
const PERFIL_ID = '00000000-0000-4000-8000-0000000000f1';
const PROF_ID = '00000000-0000-4000-8000-0000000000a1';
const META = { page: 1, pageSize: 10, total: 2, totalPages: 1 };

function usuario(parcial: Partial<Usuario>): Usuario {
  return {
    id: ID_1,
    nome: 'Ana Luiza Cardoso Silva',
    email: 'ana@example.com',
    telefone: '65999465190',
    cargo: 'Médica',
    perfilId: null,
    perfilNome: null,
    verDadosSensiveis: false,
    profissionais: [],
    ativo: true,
    ultimoLoginEm: '2026-08-27T15:57:00.000Z',
    createdAt: '2026-01-01T12:00:00.000Z',
    updatedAt: '2026-01-01T12:00:00.000Z',
    ...parcial,
  };
}

const USUARIOS = [
  usuario({}),
  usuario({
    id: ID_2,
    nome: 'Eduardo',
    email: 'ti@biologicanet.com.br',
    telefone: null,
    cargo: 'Gerente TI',
    perfilId: PERFIL_ID,
    perfilNome: 'Administrador',
    ativo: false,
  }),
];

function pagina(data: Usuario[]) {
  return json({ data, meta: META });
}

type Corpo = Record<string, unknown>;

function corpoDe(init?: RequestInit): Corpo {
  return JSON.parse(String(init?.body)) as Corpo;
}

const lookupPerfis = () =>
  json({
    data: [{ id: PERFIL_ID, label: 'Administrador', descricao: null }],
    meta: META,
  });

const lookupProfissionais = () =>
  json({
    data: [{ id: PROF_ID, label: 'Profissional Fictício', descricao: null }],
    meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
  });

function api(rotas: Parameters<typeof apiFalsa>[0] = {}) {
  return apiFalsa({
    ...rotas,
    rotas: {
      [API]: () => pagina(USUARIOS),
      '/api/lookups/perfis': lookupPerfis,
      '/api/lookups/profissionais': lookupProfissionais,
      ...rotas.rotas,
    },
  });
}

function renderTela(fetchMock = api()) {
  return { user: userEvent.setup(), ...renderApp('/usuarios', fetchMock) };
}

async function abrirMenu(user: ReturnType<typeof userEvent.setup>, linha: string, item: string) {
  const tr = (await screen.findByText(linha)).closest('tr') as HTMLElement;
  await user.click(within(tr).getByRole('button', { name: 'Ações' }));
  await user.click(await screen.findByRole('menuitem', { name: item }));
}

describe('Usuários (/usuarios)', () => {
  it('mostra título, descrição e as colunas do inventário', async () => {
    const fetchMock = api();
    renderTela(fetchMock);

    expect(await screen.findByRole('heading', { name: 'Usuarios do Sistema' })).toBeInTheDocument();
    expect(screen.getByText('Gerencie os usuarios que tem acesso ao sistema.')).toBeVisible();
    const cabecalhos = within(await screen.findByRole('table')).getAllByRole('columnheader');
    expect(cabecalhos.map((c) => c.textContent)).toEqual([
      'Nome',
      'Email',
      'Telefone',
      'Role',
      'Perfil',
      'Status',
      'Ultimo Login',
      'Ações',
    ]);
    expect(screen.getByPlaceholderText('Buscar usuarios...')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Novo Usuario' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Exportar' })).toBeVisible();
  });

  it('mostra cargo abaixo do nome, perfil "Sem perfil" e status', async () => {
    renderTela();

    const ana = (await screen.findByText('Ana Luiza Cardoso Silva')).closest('tr') as HTMLElement;
    expect(within(ana).getByText('Médica')).toBeVisible();
    expect(within(ana).getByText('Sem perfil')).toBeVisible();
    expect(within(ana).getByText('Sem perfil (usa padrão da role)')).toBeVisible();
    expect(within(ana).getByText('Ativo')).toBeVisible();

    const eduardo = screen.getByText('Eduardo').closest('tr') as HTMLElement;
    expect(within(eduardo).getAllByText('Administrador').length).toBeGreaterThan(0);
    expect(within(eduardo).getByText('Inativo')).toBeVisible();
  });

  it('Novo Usuario: só Nome, Email e Senha são obrigatórios', async () => {
    const fetchMock = api();
    const { user } = renderTela(fetchMock);
    await screen.findByText('Ana Luiza Cardoso Silva');

    await user.click(screen.getByRole('button', { name: 'Novo Usuario' }));
    const modal = within(await screen.findByRole('dialog', { name: 'Novo Usuario' }));
    await user.click(modal.getByRole('button', { name: 'Cadastrar' }));

    expect(await modal.findByText('Nome é obrigatório.')).toBeVisible();
    expect(modal.getByText('Email é obrigatório.')).toBeVisible();
    expect(modal.getByText('A senha deve ter no mínimo 8 caracteres')).toBeVisible();
    expect(modal.queryByText('Telefone é obrigatório.')).not.toBeInTheDocument();
    expect(chamadasPara(fetchMock, API).filter(([, i]) => i?.method === 'POST')).toHaveLength(0);
  });

  it('Novo Usuario: cadastra com perfil selecionado e fecha o modal', async () => {
    let corpo: Corpo = {};
    const fetchMock = api({
      rotas: {
        [API]: (init) => {
          if (init?.method !== 'POST') return pagina(USUARIOS);
          corpo = corpoDe(init);
          return json(usuario({ id: '00000000-0000-4000-8000-0000000000c3', nome: 'Carlos' }), 201);
        },
      },
    });
    const { user } = renderTela(fetchMock);
    await screen.findByText('Ana Luiza Cardoso Silva');

    await user.click(screen.getByRole('button', { name: 'Novo Usuario' }));
    const modal = within(await screen.findByRole('dialog', { name: 'Novo Usuario' }));
    await user.type(modal.getByLabelText('Nome'), 'Carlos');
    await user.type(modal.getByLabelText('Email'), 'carlos@example.com');
    await user.type(modal.getByLabelText('Senha'), 'senha-123456');
    await user.click(modal.getByRole('combobox', { name: /Perfil de Acesso/ }));
    await user.click(await screen.findByRole('option', { name: /Administrador/ }));
    await user.click(modal.getByRole('button', { name: 'Cadastrar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(corpo).toMatchObject({
      nome: 'Carlos',
      email: 'carlos@example.com',
      senha: 'senha-123456',
      perfilId: PERFIL_ID,
    });
  });

  it('menu ⋯ tem Visualizar, Editar, Resetar Senha e Desativar', async () => {
    renderTela();
    await screen.findByText('Ana Luiza Cardoso Silva');

    const tr = screen.getByText('Ana Luiza Cardoso Silva').closest('tr') as HTMLElement;
    const user = userEvent.setup();
    await user.click(within(tr).getByRole('button', { name: 'Ações' }));

    for (const item of ['Visualizar', 'Editar', 'Resetar Senha', 'Desativar']) {
      expect(await screen.findByRole('menuitem', { name: item })).toBeVisible();
    }
  });

  it('Visualizar: mostra os dados em modo leitura', async () => {
    const { user } = renderTela();
    await abrirMenu(user, 'Ana Luiza Cardoso Silva', 'Visualizar');

    const modal = within(await screen.findByRole('dialog', { name: 'Visualizar Usuario' }));
    expect(modal.getByText('ana@example.com')).toBeVisible();
    // "Fechar" também nomeia o X do modal (sr-only); o rodapé é o 2º botão com esse nome.
    expect(modal.getAllByRole('button', { name: 'Fechar' })).toHaveLength(2);
    expect(modal.queryByRole('button', { name: 'Salvar' })).not.toBeInTheDocument();
  });

  it('Editar: abre com os valores atuais e envia PATCH com Salvar', async () => {
    let corpo: Corpo = {};
    const { user } = renderTela(
      api({
        rotas: {
          [`${API}/${ID_1}`]: (init) => {
            corpo = corpoDe(init);
            return json(usuario({ nome: 'Ana Luiza Alterada' }));
          },
        },
      }),
    );
    await abrirMenu(user, 'Ana Luiza Cardoso Silva', 'Editar');

    const modal = within(await screen.findByRole('dialog', { name: 'Editar Usuario' }));
    expect(modal.getByLabelText('Nome')).toHaveValue('Ana Luiza Cardoso Silva');
    expect(modal.getByLabelText('Email')).toHaveValue('ana@example.com');
    expect(modal.queryByLabelText('Senha')).not.toBeInTheDocument();
    await user.clear(modal.getByLabelText('Nome'));
    await user.type(modal.getByLabelText('Nome'), 'Ana Luiza Alterada');
    await user.click(modal.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(corpo).toMatchObject({
      nome: 'Ana Luiza Alterada',
      email: 'ana@example.com',
      status: 'ativo',
    });
  });

  it('Resetar Senha: pede a nova senha e envia PATCH em /resetar-senha', async () => {
    let corpo: Corpo = {};
    const { user } = renderTela(
      api({
        rotas: {
          [`${API}/${ID_1}/resetar-senha`]: (init) => {
            corpo = corpoDe(init);
            return json(usuario({}));
          },
        },
      }),
    );
    await abrirMenu(user, 'Ana Luiza Cardoso Silva', 'Resetar Senha');

    const modal = within(await screen.findByRole('dialog', { name: /Resetar Senha/ }));
    expect(modal.getByText('Ana Luiza Cardoso Silva')).toBeVisible();
    await user.type(modal.getByLabelText('Nova Senha'), 'nova-senha-123');
    await user.click(modal.getByRole('button', { name: 'Resetar Senha' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(corpo).toEqual({ senha: 'nova-senha-123' });
  });

  it('Desativar: pede confirmação e só desativa ao confirmar', async () => {
    let corpo: Corpo = {};
    const { user } = renderTela(
      api({
        rotas: {
          [`${API}/${ID_1}`]: (init) => {
            corpo = corpoDe(init);
            return json(usuario({ ativo: false }));
          },
        },
      }),
    );

    await abrirMenu(user, 'Ana Luiza Cardoso Silva', 'Desativar');
    const dialogo = await screen.findByRole('alertdialog', { name: 'Desativar Usuario' });
    await user.click(within(dialogo).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(Object.keys(corpo)).toHaveLength(0);

    await abrirMenu(user, 'Ana Luiza Cardoso Silva', 'Desativar');
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Desativar' }),
    );
    await waitFor(() => expect(corpo).toMatchObject({ status: 'inativo' }));
  });

  it('sem permissão de criar e editar, esconde os botões e desabilita Desativar', async () => {
    const somenteVer = PERMISSOES.filter((p) => p === 'configuracoes-gestao.usuarios.ver');
    const { user } = renderTela(api({ usuario: { ...USUARIO_TESTE, permissoes: somenteVer } }));
    await screen.findByText('Ana Luiza Cardoso Silva');

    expect(screen.queryByRole('button', { name: 'Novo Usuario' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Exportar' })).not.toBeInTheDocument();

    const tr = screen.getByText('Ana Luiza Cardoso Silva').closest('tr') as HTMLElement;
    await user.click(within(tr).getByRole('button', { name: 'Ações' }));
    expect(screen.queryByRole('menuitem', { name: 'Editar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Resetar Senha' })).not.toBeInTheDocument();
    expect(await screen.findByRole('menuitem', { name: 'Visualizar' })).toBeVisible();
  });

  describe('profissionais vinculados (issue #153)', () => {
    const VINCULADO = { id: PROF_ID, nome: 'Profissional Fictício' };

    it('Novo Usuario: adiciona um profissional e envia profissionalIds', async () => {
      let corpo: Corpo = {};
      const fetchMock = api({
        rotas: {
          [API]: (init) => {
            if (init?.method !== 'POST') return pagina(USUARIOS);
            corpo = corpoDe(init);
            return json(usuario({ id: '00000000-0000-4000-8000-0000000000c3' }), 201);
          },
        },
      });
      const { user } = renderTela(fetchMock);
      await screen.findByText('Ana Luiza Cardoso Silva');

      await user.click(screen.getByRole('button', { name: 'Novo Usuario' }));
      const modal = within(await screen.findByRole('dialog', { name: 'Novo Usuario' }));
      expect(modal.getByText('Nenhum profissional vinculado.')).toBeVisible();
      await user.type(modal.getByLabelText('Nome'), 'Carlos');
      await user.type(modal.getByLabelText('Email'), 'carlos@example.com');
      await user.type(modal.getByLabelText('Senha'), 'senha-123456');
      await user.click(modal.getByRole('combobox', { name: /Profissionais vinculados/ }));
      await user.click(await screen.findByRole('option', { name: /Profissional Fictício/ }));
      expect(modal.getByRole('button', { name: 'Remover Profissional Fictício' })).toBeVisible();
      await user.click(modal.getByRole('button', { name: 'Cadastrar' }));

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(corpo).toMatchObject({ profissionalIds: [PROF_ID] });
    });

    it('Editar: mostra o vínculo atual e remove pelo chip', async () => {
      let corpo: Corpo = {};
      const { user } = renderTela(
        api({
          rotas: {
            [API]: () => pagina([usuario({ profissionais: [VINCULADO] })]),
            [`${API}/${ID_1}`]: (init) => {
              corpo = corpoDe(init);
              return json(usuario({}));
            },
          },
        }),
      );
      await abrirMenu(user, 'Ana Luiza Cardoso Silva', 'Editar');

      const modal = within(await screen.findByRole('dialog', { name: 'Editar Usuario' }));
      await user.click(modal.getByRole('button', { name: 'Remover Profissional Fictício' }));
      expect(modal.getByText('Nenhum profissional vinculado.')).toBeVisible();
      await user.click(modal.getByRole('button', { name: 'Salvar' }));

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(corpo).toMatchObject({ profissionalIds: [] });
    });

    it('Visualizar mostra os vinculados e Desativar preserva os vínculos', async () => {
      let corpo: Corpo = {};
      const { user } = renderTela(
        api({
          rotas: {
            [API]: () => pagina([usuario({ profissionais: [VINCULADO] })]),
            [`${API}/${ID_1}`]: (init) => {
              corpo = corpoDe(init);
              return json(usuario({ ativo: false, profissionais: [VINCULADO] }));
            },
          },
        }),
      );

      await abrirMenu(user, 'Ana Luiza Cardoso Silva', 'Visualizar');
      const visualizar = within(await screen.findByRole('dialog', { name: 'Visualizar Usuario' }));
      expect(visualizar.getByText('Profissional Fictício')).toBeVisible();
      await user.click(visualizar.getAllByRole('button', { name: 'Fechar' })[0] as HTMLElement);
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

      await abrirMenu(user, 'Ana Luiza Cardoso Silva', 'Desativar');
      await user.click(
        within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Desativar' }),
      );
      await waitFor(() =>
        expect(corpo).toMatchObject({ status: 'inativo', profissionalIds: [PROF_ID] }),
      );
    });
  });
});
