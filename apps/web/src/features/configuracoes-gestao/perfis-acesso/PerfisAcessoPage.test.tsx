import { PERMISSOES, PREFERENCIAS_PADRAO, type Perfil } from '@torres/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { apiFalsa, json, renderApp, USUARIO_TESTE } from '@/test/render-app';

const API = '/api/configuracoes-gestao/perfis-acesso';
const ID_1 = '00000000-0000-4000-8000-0000000000c1';
const ID_2 = '00000000-0000-4000-8000-0000000000c2';

function perfil(parcial: Partial<Perfil>): Perfil {
  return {
    id: ID_1,
    nome: 'Recepção',
    descricao: 'Acesso para recepcionistas',
    paginasPermitidas: ['painel.painel'],
    escopoDados: 'TODOS',
    padrao: false,
    ativo: true,
    createdAt: '2026-10-14T12:00:00.000Z',
    updatedAt: '2026-10-14T12:00:00.000Z',
    ...parcial,
  };
}

const PERFIS = [
  perfil({}),
  perfil({
    id: ID_2,
    nome: 'Administrador',
    descricao: null,
    ativo: false,
    paginasPermitidas: ['painel.painel', 'comercial-atendimento.agenda'],
  }),
];

function pagina(data: Perfil[]) {
  return json({ data, meta: { page: 1, pageSize: 10, total: data.length, totalPages: 1 } });
}

type Corpo = Record<string, unknown>;

function corpoDe(init?: RequestInit): Corpo {
  return JSON.parse(String(init?.body)) as Corpo;
}

function api(rotas: Parameters<typeof apiFalsa>[0] = {}) {
  return apiFalsa({ ...rotas, rotas: { [API]: () => pagina(PERFIS), ...rotas.rotas } });
}

function renderTela(fetchMock = api()) {
  return { user: userEvent.setup(), ...renderApp('/perfis', fetchMock) };
}

async function abrirMenu(user: ReturnType<typeof userEvent.setup>, linha: string, item: string) {
  const tr = (await screen.findByText(linha)).closest('tr') as HTMLElement;
  await user.click(within(tr).getByRole('button', { name: 'Ações' }));
  await user.click(await screen.findByRole('menuitem', { name: item }));
}

describe('Perfis de Acesso (/perfis)', () => {
  it('mostra título, descrição e a grid com Nome, Páginas e Status', async () => {
    const fetchMock = api();
    renderTela(fetchMock);

    expect(await screen.findByRole('heading', { name: 'Perfis de Acesso' })).toBeInTheDocument();
    expect(
      screen.getByText(
        'Crie e gerencie perfis para controlar o acesso dos usuários às páginas do sistema.',
      ),
    ).toBeVisible();
    const cabecalhos = within(await screen.findByRole('table')).getAllByRole('columnheader');
    expect(cabecalhos.map((c) => c.textContent)).toEqual(['Nome', 'Páginas', 'Status', 'Ações']);
    expect(await screen.findByText('Recepção')).toBeVisible();
    expect(screen.getByText('Acesso para recepcionistas')).toBeVisible();
    expect(screen.getByText(/1 de \d+ páginas/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Novo Perfil' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Exportar' })).toBeVisible();
  });

  it('Novo Perfil: valida Nome e Páginas Permitidas vazios', async () => {
    const { user } = renderTela();
    await screen.findByText('Recepção');

    await user.click(screen.getByRole('button', { name: 'Novo Perfil' }));
    const modal = await screen.findByRole('dialog', { name: 'Novo Perfil' });
    await user.click(within(modal).getByRole('button', { name: 'Cadastrar' }));

    expect(await within(modal).findByText('Nome é obrigatório.')).toBeVisible();
    expect(within(modal).getByText('Selecione ao menos uma página.')).toBeVisible();
  });

  it('Novo Perfil: marcar um módulo inteiro marca todas as suas páginas', async () => {
    const { user } = renderTela();
    await screen.findByText('Recepção');

    await user.click(screen.getByRole('button', { name: 'Novo Perfil' }));
    const modal = await screen.findByRole('dialog', { name: 'Novo Perfil' });
    await user.click(within(modal).getByRole('checkbox', { name: 'COMERCIAL / ATENDIMENTO' }));
    await user.click(
      within(modal).getByRole('button', { name: 'Expandir COMERCIAL / ATENDIMENTO' }),
    );

    expect(within(modal).getByRole('checkbox', { name: 'Negócios' })).toBeChecked();
  });

  it('Novo Perfil: cadastra com Nome, Descrição e uma página marcada', async () => {
    let corpo: Corpo = {};
    const fetchMock = api({
      rotas: {
        [API]: (init) => {
          if (init?.method !== 'POST') return pagina(PERFIS);
          corpo = corpoDe(init);
          return json(
            perfil({ id: '00000000-0000-4000-8000-0000000000c3', nome: 'Marketing' }),
            201,
          );
        },
      },
    });
    const { user } = renderTela(fetchMock);
    await screen.findByText('Recepção');

    await user.click(screen.getByRole('button', { name: 'Novo Perfil' }));
    const modal = await screen.findByRole('dialog', { name: 'Novo Perfil' });
    await user.type(within(modal).getByLabelText(/Nome/), 'Marketing');
    await user.type(within(modal).getByLabelText('Descrição'), 'Acesso de marketing');
    await user.click(within(modal).getByRole('button', { name: 'Expandir PAINEL' }));
    await user.click(within(modal).getByRole('checkbox', { name: 'Painel' }));
    expect(within(modal).getByRole('combobox', { name: 'Dados visíveis' })).toHaveTextContent(
      'Todos os profissionais',
    );
    await user.click(within(modal).getByRole('combobox', { name: 'Dados visíveis' }));
    await user.click(
      await screen.findByRole('option', { name: 'Somente os profissionais vinculados ao usuário' }),
    );
    await user.click(within(modal).getByRole('button', { name: 'Cadastrar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(corpo).toEqual({
      nome: 'Marketing',
      descricao: 'Acesso de marketing',
      paginasPermitidas: ['painel.painel'],
      escopoDados: 'PROFISSIONAIS_VINCULADOS',
    });
  });

  it('menu ⋯ tem Editar e Excluir; Editar abre com os dados e envia PATCH com Salvar', async () => {
    let corpo: Corpo = {};
    const { user } = renderTela(
      api({
        rotas: {
          [`${API}/${ID_1}`]: (init) => {
            corpo = corpoDe(init);
            return json(perfil({ nome: 'Recepção Geral' }));
          },
        },
      }),
    );

    await abrirMenu(user, 'Recepção', 'Editar');
    const modal = await screen.findByRole('dialog', { name: 'Editar Perfil' });
    const nome = within(modal).getByLabelText(/Nome/);
    expect(nome).toHaveValue('Recepção');
    expect(within(modal).getByText('1 página(s) selecionada(s)')).toBeVisible();
    await user.clear(nome);
    await user.type(nome, 'Recepção Geral');
    await user.click(within(modal).getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(corpo).toEqual({
      nome: 'Recepção Geral',
      descricao: 'Acesso para recepcionistas',
      paginasPermitidas: ['painel.painel'],
      escopoDados: 'TODOS',
    });
  });

  it('Excluir: confirma antes e envia DELETE; Cancelar não exclui', async () => {
    let excluidas = 0;
    const { user } = renderTela(
      api({
        rotas: {
          [`${API}/${ID_1}`]: () => {
            excluidas += 1;
            return json(perfil({}));
          },
        },
      }),
    );

    await abrirMenu(user, 'Recepção', 'Excluir');
    const dialogo = await screen.findByRole('alertdialog', { name: 'Excluir Perfil' });
    expect(dialogo).toHaveTextContent(
      'Tem certeza que deseja excluir o perfil "Recepção"? Esta ação não pode ser desfeita.',
    );
    await user.click(within(dialogo).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(excluidas).toBe(0);

    await abrirMenu(user, 'Recepção', 'Excluir');
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Excluir' }),
    );
    await waitFor(() => expect(excluidas).toBe(1));
  });

  it('sem permissão de criar, editar, excluir e exportar, esconde os botões e as ações', async () => {
    const somenteVer = PERMISSOES.filter((p) => p === 'configuracoes-gestao.perfis-acesso.ver');
    renderTela(api({ usuario: { ...USUARIO_TESTE, permissoes: somenteVer } }));

    await screen.findByText('Recepção');

    expect(screen.queryByRole('button', { name: 'Novo Perfil' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Exportar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ações' })).not.toBeInTheDocument();
  });

  describe('perfis padrão (issue #154)', () => {
    const PADRAO = perfil({ id: ID_2, nome: 'Gerência', descricao: null, padrao: true });
    const comPadrao = (
      rotas: NonNullable<NonNullable<Parameters<typeof apiFalsa>[0]>['rotas']> = {},
    ) => api({ rotas: { [API]: () => pagina([perfil({}), PADRAO]), ...rotas } });

    it('mostra a marca Padrão e não oferece Excluir no perfil padrão', async () => {
      const { user } = renderTela(comPadrao());

      const linha = (await screen.findByText('Gerência')).closest('tr') as HTMLElement;
      expect(within(linha).getByText('Padrão')).toBeVisible();
      await user.click(within(linha).getByRole('button', { name: 'Ações' }));
      expect(await screen.findByRole('menuitem', { name: 'Duplicar' })).toBeVisible();
      expect(screen.queryByRole('menuitem', { name: 'Excluir' })).not.toBeInTheDocument();

      const comum = (await screen.findByText('Recepção')).closest('tr') as HTMLElement;
      expect(within(comum).queryByText('Padrão')).not.toBeInTheDocument();
    });

    it('Duplicar envia POST /:id/duplicar e atualiza a grid', async () => {
      let duplicados = 0;
      const { user } = renderTela(
        comPadrao({
          [`${API}/${ID_2}/duplicar`]: () => {
            duplicados += 1;
            return json(perfil({ id: ID_1, nome: 'Cópia de Gerência' }));
          },
        }),
      );

      await abrirMenu(user, 'Gerência', 'Duplicar');

      await waitFor(() => expect(duplicados).toBe(1));
      expect(await screen.findByText('Perfil duplicado.')).toBeVisible();
    });

    it('sem permissão de criar, não oferece Duplicar', async () => {
      const permissoes = PERMISSOES.filter(
        (p) =>
          p === 'configuracoes-gestao.perfis-acesso.ver' ||
          p === 'configuracoes-gestao.perfis-acesso.editar',
      );
      const { user } = renderTela(
        api({
          usuario: { ...USUARIO_TESTE, permissoes },
          rotas: { [API]: () => pagina([PADRAO]) },
        }),
      );

      const linha = (await screen.findByText('Gerência')).closest('tr') as HTMLElement;
      await user.click(within(linha).getByRole('button', { name: 'Ações' }));
      expect(screen.queryByRole('menuitem', { name: 'Duplicar' })).not.toBeInTheDocument();
    });

    it('em inglês, traduz a marca e a ação', async () => {
      const { user } = renderTela(
        api({
          usuario: { ...USUARIO_TESTE, preferencias: { ...PREFERENCIAS_PADRAO, idioma: 'en' } },
          rotas: { [API]: () => pagina([PADRAO]) },
        }),
      );

      const linha = (await screen.findByText('Gerência')).closest('tr') as HTMLElement;
      expect(within(linha).getByText('Default')).toBeVisible();
      await user.click(within(linha).getByRole('button', { name: /Actions/ }));
      expect(await screen.findByRole('menuitem', { name: 'Duplicate' })).toBeVisible();
    });
  });
});
