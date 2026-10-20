import { CATEGORIA_CORES, PERMISSOES, type Categoria } from '@torres/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { apiFalsa, chamadasPara, json, renderApp, USUARIO_TESTE } from '@/test/render-app';

const API = '/api/compras-estoque/categorias';
const ID_1 = '00000000-0000-4000-8000-0000000000b1';
const ID_2 = '00000000-0000-4000-8000-0000000000b2';

function categoria(parcial: Partial<Categoria>): Categoria {
  return {
    id: ID_1,
    nome: 'Marketing',
    tipo: 'SERVICO',
    cor: CATEGORIA_CORES[9],
    descricao: null,
    createdAt: '2026-10-14T12:00:00.000Z',
    updatedAt: '2026-10-14T12:00:00.000Z',
    ...parcial,
  };
}

const CATEGORIAS = [
  categoria({}),
  categoria({ id: ID_2, nome: 'Insumos', tipo: 'PRODUTO', descricao: 'Material de consumo' }),
];

function pagina(data: Categoria[]) {
  return json({ data, meta: { page: 1, pageSize: 10, total: data.length, totalPages: 1 } });
}

type Corpo = Record<string, unknown>;

function corpoDe(init?: RequestInit): Corpo {
  return JSON.parse(String(init?.body)) as Corpo;
}

function parametros(fetchMock: ReturnType<typeof apiFalsa>) {
  const [url] = chamadasPara(fetchMock, API).at(-1) ?? [''];
  return Object.fromEntries(new URL(url, 'http://x').searchParams);
}

function api(rotas: Parameters<typeof apiFalsa>[0] = {}) {
  return apiFalsa({ ...rotas, rotas: { [API]: () => pagina(CATEGORIAS), ...rotas.rotas } });
}

function renderTela(fetchMock = api()) {
  return { user: userEvent.setup(), ...renderApp('/categorias', fetchMock) };
}

async function abrirMenu(user: ReturnType<typeof userEvent.setup>, linha: string, item: string) {
  const tr = (await screen.findByText(linha)).closest('tr') as HTMLElement;
  await user.click(within(tr).getByRole('button', { name: 'Ações' }));
  await user.click(await screen.findByRole('menuitem', { name: item }));
}

describe('Categorias (/categorias)', () => {
  it('mostra título, descrição, chips e a grid com Nome, Tipo, Cor e Descrição', async () => {
    const fetchMock = api();
    renderTela(fetchMock);

    expect(await screen.findByRole('heading', { name: 'Categorias' })).toBeInTheDocument();
    expect(screen.getByText('Gerencie as categorias de produtos e serviços.')).toBeVisible();
    const cabecalhos = within(await screen.findByRole('table')).getAllByRole('columnheader');
    expect(cabecalhos.map((c) => c.textContent)).toEqual([
      'Nome',
      'Tipo',
      'Cor',
      'Descrição',
      'Ações',
    ]);
    expect(await screen.findByText('Marketing')).toBeVisible();
    expect(screen.getByText('Serviço')).toBeVisible();
    expect(screen.getByText('Produto')).toBeVisible();
    expect(screen.getByText('Material de consumo')).toBeVisible();
    for (const nome of ['Todos', 'Produtos', 'Serviços']) {
      expect(screen.getByRole('button', { name: nome })).toBeVisible();
    }
    expect(screen.getByPlaceholderText('Buscar categorias...')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Nova Categoria' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Exportar' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Colunas' })).toBeVisible();
    expect(parametros(fetchMock)).toMatchObject({ page: '1', pageSize: '10' });
  });

  it('chips Produtos e Serviços filtram por tipo na API; Todos volta à lista completa', async () => {
    const fetchMock = api();
    const { user } = renderTela(fetchMock);
    await screen.findByText('Marketing');

    await user.click(screen.getByRole('button', { name: 'Produtos' }));
    await waitFor(() => expect(parametros(fetchMock)).toMatchObject({ tipo: 'produto' }));

    await user.click(screen.getByRole('button', { name: 'Serviços' }));
    await waitFor(() => expect(parametros(fetchMock)).toMatchObject({ tipo: 'servico' }));

    await user.click(screen.getByRole('button', { name: 'Todos' }));
    // A consulta sem tipo já está em cache: o que muda é o chip marcado.
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Todos' })).toHaveAttribute('aria-pressed', 'true'),
    );
  });

  it('ordenar por Nome, Tipo e Descrição chama a API com o sort', async () => {
    const fetchMock = api();
    const { user } = renderTela(fetchMock);
    await screen.findByText('Marketing');

    for (const coluna of ['Nome', 'Tipo', 'Descrição']) {
      await user.click(screen.getByRole('button', { name: coluna }));
      await waitFor(() =>
        expect(parametros(fetchMock)).toMatchObject({
          sort: `${coluna.toLowerCase().replace('ç', 'c').replace('ã', 'a')}:asc`,
        }),
      );
    }
  });

  it('busca envia o texto na API', async () => {
    const fetchMock = api();
    const { user } = renderTela(fetchMock);
    await screen.findByText('Marketing');

    await user.type(screen.getByPlaceholderText('Buscar categorias...'), 'mark');

    await waitFor(() => expect(parametros(fetchMock)).toMatchObject({ search: 'mark' }));
  });

  it('Nova Categoria: campos, padrões (Serviço e primeira cor) e botões', async () => {
    const { user } = renderTela();
    await screen.findByText('Marketing');

    await user.click(screen.getByRole('button', { name: 'Nova Categoria' }));
    const modal = await screen.findByRole('dialog', { name: 'Nova Categoria' });

    expect(within(modal).getByPlaceholderText('Nome da categoria')).toBeVisible();
    expect(within(modal).getByRole('combobox', { name: 'Tipo' })).toHaveTextContent('Serviço');
    expect(within(modal).getAllByRole('radio')).toHaveLength(CATEGORIA_CORES.length);
    expect(within(modal).getByRole('radio', { name: 'Índigo' })).toBeChecked();
    expect(within(modal).getByPlaceholderText('Descrição opcional')).toBeVisible();
    expect(within(modal).getByRole('button', { name: 'Cancelar' })).toBeVisible();
    expect(within(modal).getByRole('button', { name: 'Cadastrar' })).toBeVisible();
  });

  it('Nova Categoria: vazio mostra "O nome da categoria é obrigatório." e não envia', async () => {
    const fetchMock = api();
    const { user } = renderTela(fetchMock);
    await screen.findByText('Marketing');

    await user.click(screen.getByRole('button', { name: 'Nova Categoria' }));
    const modal = await screen.findByRole('dialog', { name: 'Nova Categoria' });
    await user.click(within(modal).getByRole('button', { name: 'Cadastrar' }));

    expect(await within(modal).findByText('O nome da categoria é obrigatório.')).toBeVisible();
    expect(chamadasPara(fetchMock, API).filter(([, init]) => init?.method === 'POST')).toHaveLength(
      0,
    );
  });

  it('Nova Categoria: salva com tipo e cor escolhidos, fecha o modal e recarrega a lista', async () => {
    let corpo: Corpo = {};
    const fetchMock = api({
      rotas: {
        [API]: (init) => {
          if (init?.method !== 'POST') return pagina(CATEGORIAS);
          corpo = corpoDe(init);
          return json(
            categoria({ id: '00000000-0000-4000-8000-0000000000b3', nome: 'Luvas' }),
            201,
          );
        },
      },
    });
    const { user } = renderTela(fetchMock);
    await screen.findByText('Marketing');

    await user.click(screen.getByRole('button', { name: 'Nova Categoria' }));
    const modal = await screen.findByRole('dialog', { name: 'Nova Categoria' });
    await user.type(within(modal).getByLabelText(/Nome/), 'Luvas');
    await user.click(within(modal).getByRole('combobox', { name: 'Tipo' }));
    await user.click(await screen.findByRole('option', { name: 'Produto' }));
    await user.click(within(modal).getByRole('radio', { name: 'Verde' }));
    await user.type(within(modal).getByLabelText('Descrição'), 'Descartáveis');
    await user.click(within(modal).getByRole('button', { name: 'Cadastrar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(corpo).toEqual({
      nome: 'Luvas',
      tipo: 'produto',
      cor: CATEGORIA_CORES[2],
      descricao: 'Descartáveis',
    });
    expect(
      chamadasPara(fetchMock, API).filter(([, i]) => !i?.method || i.method === 'GET'),
    ).toHaveLength(2);
  });

  it('Esc fecha o modal sem salvar', async () => {
    const { user } = renderTela();
    await screen.findByText('Marketing');

    await user.click(screen.getByRole('button', { name: 'Nova Categoria' }));
    await screen.findByRole('dialog', { name: 'Nova Categoria' });
    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('menu ⋯ tem Editar e Excluir; Editar abre com os dados e envia PATCH com Salvar', async () => {
    let corpo: Corpo = {};
    const { user } = renderTela(
      api({
        rotas: {
          [`${API}/${ID_1}`]: (init) => {
            corpo = corpoDe(init);
            return json(categoria({ nome: 'Marketing digital' }));
          },
        },
      }),
    );

    await abrirMenu(user, 'Marketing', 'Editar');
    const modal = await screen.findByRole('dialog', { name: 'Editar Categoria' });
    const nome = within(modal).getByLabelText(/Nome/);
    expect(nome).toHaveValue('Marketing');
    expect(within(modal).getByRole('combobox', { name: 'Tipo' })).toHaveTextContent('Serviço');
    expect(within(modal).getByRole('radio', { name: 'Turquesa' })).toBeChecked();
    await user.clear(nome);
    await user.type(nome, 'Marketing digital');
    await user.click(within(modal).getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(corpo).toEqual({
      nome: 'Marketing digital',
      tipo: 'servico',
      cor: CATEGORIA_CORES[9],
      descricao: null,
    });
  });

  it('Editar categoria com cor fora da paleta mantém a cor ao salvar', async () => {
    let corpo: Corpo = {};
    const { user } = renderTela(
      api({
        rotas: {
          [API]: () => pagina([categoria({ cor: '#cff2e8' })]),
          [`${API}/${ID_1}`]: (init) => {
            corpo = corpoDe(init);
            return json(categoria({ cor: '#cff2e8' }));
          },
        },
      }),
    );

    await abrirMenu(user, 'Marketing', 'Editar');
    const modal = await screen.findByRole('dialog', { name: 'Editar Categoria' });
    expect(within(modal).queryByRole('radio', { checked: true })).not.toBeInTheDocument();
    await user.click(within(modal).getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(corpo).toMatchObject({ cor: '#cff2e8' });
  });

  it('Excluir: confirma antes e envia DELETE; Cancelar não exclui', async () => {
    let excluidas = 0;
    const { user } = renderTela(
      api({
        rotas: {
          [`${API}/${ID_1}`]: () => {
            excluidas += 1;
            return json(categoria({}));
          },
        },
      }),
    );

    await abrirMenu(user, 'Marketing', 'Excluir');
    const dialogo = await screen.findByRole('alertdialog', { name: 'Excluir Categoria' });
    expect(dialogo).toHaveTextContent(
      'Tem certeza que deseja excluir a categoria "Marketing"? Esta ação não pode ser desfeita.',
    );
    await user.click(within(dialogo).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(excluidas).toBe(0);

    await abrirMenu(user, 'Marketing', 'Excluir');
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Excluir' }),
    );
    await waitFor(() => expect(excluidas).toBe(1));
  });

  it('Excluir categoria em uso: mostra o erro e mantém a confirmação aberta', async () => {
    const { user } = renderTela(
      api({
        rotas: {
          [`${API}/${ID_1}`]: () =>
            json(
              {
                statusCode: 409,
                code: 'CATEGORIA_EM_USO',
                message: 'Não é possível excluir: há produtos ou serviços usando esta categoria.',
              },
              409,
            ),
        },
      }),
    );

    await abrirMenu(user, 'Marketing', 'Excluir');
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Excluir' }),
    );

    expect(
      await screen.findByText(
        'Não é possível excluir: há produtos ou serviços usando esta categoria.',
      ),
    ).toBeVisible();
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });

  it('sem permissão de criar, editar, excluir e exportar, esconde os botões e as ações', async () => {
    const somenteVer = PERMISSOES.filter((p) => p === 'compras-estoque.categorias.ver');
    renderTela(api({ usuario: { ...USUARIO_TESTE, permissoes: somenteVer } }));

    await screen.findByText('Marketing');

    expect(screen.queryByRole('button', { name: 'Nova Categoria' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Exportar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ações' })).not.toBeInTheDocument();
  });
});
