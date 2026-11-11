import { PERMISSOES, type Fornecedor } from '@torres/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { apiFalsa, chamadasPara, json, renderApp, USUARIO_TESTE } from '@/test/render-app';

const API = '/api/compras-estoque/fornecedores';
const ID_1 = '00000000-0000-4000-8000-0000000000c1';
const ID_2 = '00000000-0000-4000-8000-0000000000c2';

function fornecedor(parcial: Partial<Fornecedor>): Fornecedor {
  return {
    id: ID_1,
    nome: 'Distribuidora Alfa',
    nomeFantasia: null,
    documento: '11444777000161',
    email: 'alfa@teste.example',
    contato: null,
    telefone: '6533334444',
    celular: null,
    cep: null,
    logradouro: null,
    numero: null,
    complemento: null,
    bairro: null,
    cidade: 'Cuiabá',
    uf: 'MT',
    ativo: true,
    observacoes: null,
    createdAt: '2026-10-14T12:00:00.000Z',
    updatedAt: '2026-10-14T12:00:00.000Z',
    ...parcial,
  };
}

const FORNECEDORES = [
  fornecedor({}),
  fornecedor({
    id: ID_2,
    nome: 'Beta Materiais',
    documento: null,
    email: null,
    telefone: null,
    cidade: null,
    uf: 'SP',
    ativo: false,
  }),
];

function pagina(data: Fornecedor[]) {
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
  return apiFalsa({ ...rotas, rotas: { [API]: () => pagina(FORNECEDORES), ...rotas.rotas } });
}

function renderTela(fetchMock = api()) {
  return { user: userEvent.setup(), ...renderApp('/fornecedores', fetchMock) };
}

async function abrirMenu(user: ReturnType<typeof userEvent.setup>, linha: string, item: string) {
  const tr = (await screen.findByText(linha)).closest('tr') as HTMLElement;
  await user.click(within(tr).getByRole('button', { name: 'Ações' }));
  await user.click(await screen.findByRole('menuitem', { name: item }));
}

describe('Fornecedores (/fornecedores)', () => {
  it('mostra título, chips, ações e a grid com as colunas do inventário', async () => {
    const fetchMock = api();
    renderTela(fetchMock);

    expect(await screen.findByRole('heading', { name: 'Fornecedores' })).toBeInTheDocument();
    expect(screen.getByText('Gerencie seus fornecedores e parceiros comerciais.')).toBeVisible();
    const cabecalhos = within(await screen.findByRole('table')).getAllByRole('columnheader');
    expect(cabecalhos.map((c) => c.textContent)).toEqual([
      'Nome',
      'CNPJ/CPF',
      'Email',
      'Telefone',
      'Cidade/UF',
      'Status',
      'Ações',
    ]);
    for (const nome of ['Todos', 'Ativo', 'Inativo']) {
      expect(screen.getByRole('button', { name: nome })).toBeVisible();
    }
    expect(screen.getByPlaceholderText('Buscar fornecedores...')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Novo Fornecedor' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Exportar' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Colunas' })).toBeVisible();
    expect(parametros(fetchMock)).toMatchObject({ page: '1', pageSize: '10' });
  });

  it('formata documento, telefone, cidade/UF e status; vazio vira "-"', async () => {
    renderTela();

    const alfa = (await screen.findByText('Distribuidora Alfa')).closest('tr') as HTMLElement;
    expect(within(alfa).getByText('11.444.777/0001-61')).toBeVisible();
    expect(within(alfa).getByText('alfa@teste.example')).toBeVisible();
    expect(within(alfa).getByText('(65) 3333-4444')).toBeVisible();
    expect(within(alfa).getByText('Cuiabá/MT')).toBeVisible();
    expect(within(alfa).getByText('Ativo')).toBeVisible();

    const beta = screen.getByText('Beta Materiais').closest('tr') as HTMLElement;
    expect(within(beta).getAllByText('-')).toHaveLength(3);
    expect(within(beta).getByText('SP')).toBeVisible();
    expect(within(beta).getByText('Inativo')).toBeVisible();
  });

  it('chips Ativo e Inativo filtram por status na API; Todos volta à lista completa', async () => {
    const fetchMock = api();
    const { user } = renderTela(fetchMock);
    await screen.findByText('Distribuidora Alfa');

    await user.click(screen.getByRole('button', { name: 'Ativo' }));
    await waitFor(() => expect(parametros(fetchMock)).toMatchObject({ status: 'ativo' }));

    await user.click(screen.getByRole('button', { name: 'Inativo' }));
    await waitFor(() => expect(parametros(fetchMock)).toMatchObject({ status: 'inativo' }));

    await user.click(screen.getByRole('button', { name: 'Todos' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Todos' })).toHaveAttribute('aria-pressed', 'true'),
    );
  });

  it('ordenar por cada coluna chama a API com o sort', async () => {
    const fetchMock = api();
    const { user } = renderTela(fetchMock);
    await screen.findByText('Distribuidora Alfa');

    const colunas = {
      Nome: 'nome',
      'CNPJ/CPF': 'documento',
      Email: 'email',
      Telefone: 'telefone',
      'Cidade/UF': 'cidade',
      Status: 'status',
    };
    for (const [titulo, campo] of Object.entries(colunas)) {
      await user.click(screen.getByRole('button', { name: titulo }));
      await waitFor(() => expect(parametros(fetchMock)).toMatchObject({ sort: `${campo}:asc` }));
    }
    // 6 colunas em sequência: mais lento sob cobertura no CI, por isso o timeout maior.
  }, 10_000);

  it('busca envia o texto na API', async () => {
    const fetchMock = api();
    const { user } = renderTela(fetchMock);
    await screen.findByText('Distribuidora Alfa');

    await user.type(screen.getByPlaceholderText('Buscar fornecedores...'), 'alfa');

    await waitFor(() => expect(parametros(fetchMock)).toMatchObject({ search: 'alfa' }));
  });

  it('paginação: próxima página chama a API com page=2', async () => {
    const fetchMock = api({
      rotas: {
        [API]: () =>
          json({ data: FORNECEDORES, meta: { page: 1, pageSize: 10, total: 12, totalPages: 2 } }),
      },
    });
    const { user } = renderTela(fetchMock);
    await screen.findByText('Distribuidora Alfa');

    await user.click(screen.getByRole('button', { name: 'Ir para próxima página' }));

    await waitFor(() => expect(parametros(fetchMock)).toMatchObject({ page: '2' }));
  });

  it('Colunas permite ocultar uma coluna', async () => {
    const { user } = renderTela();
    await screen.findByText('Distribuidora Alfa');

    await user.click(screen.getByRole('button', { name: 'Colunas' }));
    await user.click(await screen.findByRole('menuitemcheckbox', { name: 'Email' }));
    await user.keyboard('{Escape}');

    await waitFor(() =>
      expect(
        within(screen.getByRole('table'))
          .getAllByRole('columnheader')
          .map((c) => c.textContent),
      ).not.toContain('Email'),
    );
  }, 15_000);

  it('Novo Fornecedor: mostra os campos do inventário, Status Ativo e os botões', async () => {
    const { user } = renderTela();
    await screen.findByText('Distribuidora Alfa');

    await user.click(screen.getByRole('button', { name: 'Novo Fornecedor' }));
    const modal = await screen.findByRole('dialog', { name: 'Novo Fornecedor' });

    for (const rotulo of [
      /Nome \/ Razão Social/,
      'Nome Fantasia',
      'CNPJ/CPF',
      'Email',
      'Pessoa de Contato',
      'Telefone',
      'Celular',
      'CEP',
      'Logradouro',
      'Número',
      'Complemento',
      'Bairro',
      'Cidade',
      'Observações',
    ]) {
      expect(within(modal).getByLabelText(rotulo)).toBeVisible();
    }
    expect(within(modal).getByRole('combobox', { name: 'UF' })).toBeVisible();
    expect(within(modal).getByRole('combobox', { name: 'Status' })).toHaveTextContent('Ativo');
    expect(within(modal).getByRole('button', { name: 'Cancelar' })).toBeVisible();
    expect(within(modal).getByRole('button', { name: 'Cadastrar' })).toBeVisible();
  });

  it('Novo Fornecedor: vazio mostra "Nome / Razão Social é obrigatório." e não envia', async () => {
    const fetchMock = api();
    const { user } = renderTela(fetchMock);
    await screen.findByText('Distribuidora Alfa');

    await user.click(screen.getByRole('button', { name: 'Novo Fornecedor' }));
    const modal = await screen.findByRole('dialog', { name: 'Novo Fornecedor' });
    await user.click(within(modal).getByRole('button', { name: 'Cadastrar' }));

    expect(await within(modal).findByText('Nome / Razão Social é obrigatório.')).toBeVisible();
    expect(chamadasPara(fetchMock, API).filter(([, init]) => init?.method === 'POST')).toHaveLength(
      0,
    );
  });

  it('Novo Fornecedor: documento com dígitos errados mostra "CNPJ inválido" e não envia', async () => {
    const fetchMock = api();
    const { user } = renderTela(fetchMock);
    await screen.findByText('Distribuidora Alfa');

    await user.click(screen.getByRole('button', { name: 'Novo Fornecedor' }));
    const modal = await screen.findByRole('dialog', { name: 'Novo Fornecedor' });
    await user.type(within(modal).getByLabelText(/Nome \/ Razão Social/), 'Gama');
    await user.type(within(modal).getByLabelText('CNPJ/CPF'), '11444777000162');
    await user.click(within(modal).getByRole('button', { name: 'Cadastrar' }));

    expect(await within(modal).findByText('CNPJ inválido')).toBeVisible();
    expect(chamadasPara(fetchMock, API).filter(([, init]) => init?.method === 'POST')).toHaveLength(
      0,
    );
  });

  it('Novo Fornecedor: salva só os dígitos, fecha o modal e recarrega a lista', async () => {
    let corpo: Corpo = {};
    const fetchMock = api({
      rotas: {
        [API]: (init) => {
          if (init?.method !== 'POST') return pagina(FORNECEDORES);
          corpo = corpoDe(init);
          return json(
            fornecedor({ id: '00000000-0000-4000-8000-0000000000c3', nome: 'Gama' }),
            201,
          );
        },
      },
    });
    const { user } = renderTela(fetchMock);
    await screen.findByText('Distribuidora Alfa');

    await user.click(screen.getByRole('button', { name: 'Novo Fornecedor' }));
    const modal = await screen.findByRole('dialog', { name: 'Novo Fornecedor' });
    await user.type(within(modal).getByLabelText(/Nome \/ Razão Social/), 'Gama');
    await user.type(within(modal).getByLabelText('CNPJ/CPF'), '11444777000161');
    await user.type(within(modal).getByLabelText('Telefone'), '6533334444');
    await user.click(within(modal).getByRole('combobox', { name: 'UF' }));
    await user.click(await screen.findByRole('option', { name: 'MT' }));
    await user.click(within(modal).getByRole('combobox', { name: 'Status' }));
    await user.click(await screen.findByRole('option', { name: 'Inativo' }));
    await user.click(within(modal).getByRole('button', { name: 'Cadastrar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(corpo).toMatchObject({
      nome: 'Gama',
      documento: '11444777000161',
      telefone: '6533334444',
      uf: 'MT',
      status: 'inativo',
      email: null,
    });
    expect(
      chamadasPara(fetchMock, API).filter(([, i]) => !i?.method || i.method === 'GET'),
    ).toHaveLength(2);
    // Modal com vários campos digitados em sequência: mais lento sob cobertura no CI.
  }, 10_000);

  it('Esc fecha o modal sem salvar', async () => {
    const { user } = renderTela();
    await screen.findByText('Distribuidora Alfa');

    await user.click(screen.getByRole('button', { name: 'Novo Fornecedor' }));
    await screen.findByRole('dialog', { name: 'Novo Fornecedor' });
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
            return json(fornecedor({ nome: 'Alfa Ltda' }));
          },
        },
      }),
    );

    await abrirMenu(user, 'Distribuidora Alfa', 'Editar');
    const modal = await screen.findByRole('dialog', { name: 'Editar Fornecedor' });
    const nome = within(modal).getByLabelText(/Nome \/ Razão Social/);
    expect(nome).toHaveValue('Distribuidora Alfa');
    expect(within(modal).getByLabelText('CNPJ/CPF')).toHaveValue('11.444.777/0001-61');
    expect(within(modal).getByRole('combobox', { name: 'UF' })).toHaveTextContent('MT');
    await user.clear(nome);
    await user.type(nome, 'Alfa Ltda');
    await user.click(within(modal).getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(corpo).toMatchObject({
      nome: 'Alfa Ltda',
      documento: '11444777000161',
      cidade: 'Cuiabá',
      uf: 'MT',
      status: 'ativo',
    });
  });

  it('Editar fornecedor inativo abre com Status Inativo', async () => {
    const { user } = renderTela();

    await abrirMenu(user, 'Beta Materiais', 'Editar');

    const modal = await screen.findByRole('dialog', { name: 'Editar Fornecedor' });
    expect(within(modal).getByRole('combobox', { name: 'Status' })).toHaveTextContent('Inativo');
  });

  it('Excluir: confirma antes e envia DELETE; Cancelar não exclui', async () => {
    let excluidos = 0;
    const { user } = renderTela(
      api({
        rotas: {
          [`${API}/${ID_1}`]: () => {
            excluidos += 1;
            return json(fornecedor({}));
          },
        },
      }),
    );

    await abrirMenu(user, 'Distribuidora Alfa', 'Excluir');
    const dialogo = await screen.findByRole('alertdialog', { name: 'Excluir Fornecedor' });
    expect(dialogo).toHaveTextContent(
      'Tem certeza que deseja excluir o fornecedor "Distribuidora Alfa"? Esta ação não pode ser desfeita.',
    );
    await user.click(within(dialogo).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(excluidos).toBe(0);

    await abrirMenu(user, 'Distribuidora Alfa', 'Excluir');
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Excluir' }),
    );
    await waitFor(() => expect(excluidos).toBe(1));
  });

  it('sem permissão de criar, editar, excluir e exportar, esconde os botões e as ações', async () => {
    const somenteVer = PERMISSOES.filter((p) => p === 'compras-estoque.fornecedores.ver');
    renderTela(api({ usuario: { ...USUARIO_TESTE, permissoes: somenteVer } }));

    await screen.findByText('Distribuidora Alfa');

    expect(screen.queryByRole('button', { name: 'Novo Fornecedor' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Exportar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ações' })).not.toBeInTheDocument();
  });
});
