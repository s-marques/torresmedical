import { PERMISSOES, type Produto } from '@torres/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { apiFalsa, chamadasPara, json, renderApp, USUARIO_TESTE } from '@/test/render-app';

const API = '/api/compras-estoque/produtos';
const API_UNIDADES = '/api/compras-estoque/unidades-medida';
const LOOKUP_UNIDADES = '/api/lookups/unidades-medida';
const ID_1 = '00000000-0000-4000-8000-0000000000c1';
const ID_2 = '00000000-0000-4000-8000-0000000000c2';
const ID_UNIDADE = '00000000-0000-4000-8000-0000000000d1';

function produto(parcial: Partial<Produto>): Produto {
  return {
    id: ID_1,
    nome: 'Soro fisiológico',
    tipo: 'PRODUTO',
    categoriaId: null,
    unidadeMedidaId: null,
    marca: null,
    codigoBarras: null,
    sku: 'SORO-01',
    precoCusto: '6',
    precoVenda: '10',
    estoqueMinimo: '0',
    controlaEstoque: true,
    estoqueAtual: '4',
    ncm: null,
    descricao: null,
    ativo: true,
    createdAt: '2026-10-14T12:00:00.000Z',
    updatedAt: '2026-10-14T12:00:00.000Z',
    ...parcial,
  };
}

const PRODUTOS = [
  produto({}),
  produto({
    id: ID_2,
    nome: 'Consulta',
    tipo: 'SERVICO',
    sku: null,
    codigoBarras: '789',
    precoCusto: null,
    precoVenda: '300',
    estoqueAtual: '0',
    ativo: false,
  }),
];

function pagina(data: Produto[]) {
  return json({ data, meta: { page: 1, pageSize: 10, total: data.length, totalPages: 1 } });
}

function lookup(itens: { id: string; label: string }[]) {
  return json({
    data: itens.map((item) => ({ ...item, descricao: null })),
    meta: { page: 1, pageSize: 20, total: itens.length, totalPages: 1 },
  });
}

type Corpo = Record<string, unknown>;
const corpoDe = (init?: RequestInit): Corpo => JSON.parse(String(init?.body)) as Corpo;

function parametros(fetchMock: ReturnType<typeof apiFalsa>) {
  const [url] = chamadasPara(fetchMock, API).at(-1) ?? [''];
  return Object.fromEntries(new URL(url, 'http://x').searchParams);
}

function api(rotas: Parameters<typeof apiFalsa>[0] = {}) {
  return apiFalsa({
    ...rotas,
    rotas: {
      [API]: () => pagina(PRODUTOS),
      [LOOKUP_UNIDADES]: () => lookup([{ id: ID_UNIDADE, label: 'CX – Caixa' }]),
      '/api/lookups/categorias': () => lookup([]),
      ...rotas.rotas,
    },
  });
}

function renderTela(fetchMock = api()) {
  return { user: userEvent.setup(), ...renderApp('/produtos', fetchMock) };
}

async function abrirMenu(user: ReturnType<typeof userEvent.setup>, linha: string, item: string) {
  const tr = (await screen.findByText(linha)).closest('tr') as HTMLElement;
  await user.click(within(tr).getByRole('button', { name: 'Ações' }));
  await user.click(await screen.findByRole('menuitem', { name: item }));
}

describe('Produtos/Serviços (/produtos)', () => {
  it('mostra título, botões, chips e as colunas do inventário', async () => {
    const fetchMock = api();
    renderTela(fetchMock);

    expect(await screen.findByRole('heading', { name: 'Produtos e Serviços' })).toBeVisible();
    expect(screen.getByText('Gerencie o catálogo da clínica.')).toBeVisible();
    const cabecalhos = within(await screen.findByRole('table')).getAllByRole('columnheader');
    expect(cabecalhos.map((c) => c.textContent)).toEqual([
      'Produto/Serviço',
      'Código',
      'Preço Venda',
      'Custo',
      'Estoque',
      'Status',
      'Ações',
    ]);
    for (const nome of ['Nova Categoria', 'Unidades', 'Novo Produto', 'Exportar', 'Colunas']) {
      expect(screen.getByRole('button', { name: nome })).toBeVisible();
    }
    for (const nome of ['Todos', 'Produtos', 'Serviços']) {
      expect(screen.getByRole('button', { name: nome })).toBeVisible();
    }
    expect(
      screen.getByPlaceholderText('Buscar produtos por nome, SKU ou código de barras...'),
    ).toBeVisible();
    expect(parametros(fetchMock)).toMatchObject({ page: '1', pageSize: '10' });
  });

  it('formata linhas: tipo, código (SKU ou código de barras), preços, estoque e status', async () => {
    renderTela();

    const soro = (await screen.findByText('Soro fisiológico')).closest('tr') as HTMLElement;
    const consulta = screen
      .getByText('Consulta', { selector: 'span' })
      .closest('tr') as HTMLElement;

    expect(soro).toHaveTextContent('Produto');
    expect(soro).toHaveTextContent('SORO-01');
    expect(soro.textContent).toMatch(/R\$\s10,00/);
    expect(soro.textContent).toMatch(/R\$\s6,00/);
    expect(within(soro).getByText('Ativo')).toBeVisible();
    expect(consulta).toHaveTextContent('Serviço');
    expect(consulta).toHaveTextContent('789');
    expect(consulta.textContent).toMatch(/R\$\s300,00/);
    expect(within(consulta).getByText('Inativo')).toBeVisible();
  });

  it('chips Produtos e Serviços filtram por tipo na API', async () => {
    const fetchMock = api();
    const { user } = renderTela(fetchMock);
    await screen.findByText('Soro fisiológico');

    await user.click(screen.getByRole('button', { name: 'Produtos' }));
    await waitFor(() => expect(parametros(fetchMock)).toMatchObject({ tipo: 'produto' }));
    await user.click(screen.getByRole('button', { name: 'Serviços' }));
    await waitFor(() => expect(parametros(fetchMock)).toMatchObject({ tipo: 'servico' }));
  });

  it('busca envia o texto na API', async () => {
    const fetchMock = api();
    const { user } = renderTela(fetchMock);
    await screen.findByText('Soro fisiológico');

    await user.type(
      screen.getByPlaceholderText('Buscar produtos por nome, SKU ou código de barras...'),
      'soro',
    );

    await waitFor(() => expect(parametros(fetchMock)).toMatchObject({ search: 'soro' }));
  });

  it.each([
    ['Produto/Serviço', 'nome'],
    ['Código', 'codigo'],
    ['Preço Venda', 'precoVenda'],
    ['Custo', 'precoCusto'],
    ['Estoque', 'estoqueAtual'],
    ['Status', 'ativo'],
  ])('ordenar por %s chama a API com sort=%s:asc', async (coluna, campo) => {
    const fetchMock = api();
    const { user } = renderTela(fetchMock);
    await screen.findByText('Soro fisiológico');

    await user.click(screen.getByRole('button', { name: coluna }));

    await waitFor(() => expect(parametros(fetchMock)).toMatchObject({ sort: `${campo}:asc` }));
  });

  it('Novo Produto: mostra os campos do inventário e os botões', async () => {
    const { user } = renderTela();
    await screen.findByText('Soro fisiológico');

    await user.click(screen.getByRole('button', { name: 'Novo Produto' }));
    const modal = await screen.findByRole('dialog', { name: 'Novo Produto/Serviço' });

    for (const rotulo of [
      /Nome/,
      'Tipo',
      'Categoria',
      'Unidade de Medida',
      'Marca',
      'Código de barras',
      'SKU',
      'Preço de custo (R$)',
      /Preço de venda/,
      'Margem',
      'Estoque mínimo',
      'NCM (fiscal)',
      'Descrição',
    ]) {
      expect(within(modal).getByLabelText(rotulo)).toBeVisible();
    }
    expect(within(modal).getByRole('switch', { name: 'Controla estoque' })).toBeChecked();
    expect(within(modal).getByLabelText('Margem')).toHaveValue('-');
    expect(within(modal).getByRole('combobox', { name: 'Tipo' })).toHaveTextContent('Produto');
    expect(within(modal).getByRole('button', { name: 'Cancelar' })).toBeVisible();
    expect(within(modal).getByRole('button', { name: 'Cadastrar' })).toBeVisible();
  });

  it('Novo Produto: o Tipo oferece Produto, Revenda, Uso e Consumo e Serviço', async () => {
    const { user } = renderTela();
    await screen.findByText('Soro fisiológico');

    await user.click(screen.getByRole('button', { name: 'Novo Produto' }));
    const modal = await screen.findByRole('dialog', { name: 'Novo Produto/Serviço' });
    await user.click(within(modal).getByRole('combobox', { name: 'Tipo' }));

    const opcoes = (await screen.findAllByRole('option')).map((o) => o.textContent);
    expect(opcoes).toEqual(['Produto', 'Revenda', 'Uso e Consumo', 'Serviço']);
  });

  it('Novo Produto: vazio mostra "Nome é obrigatório." e o preço de venda, sem enviar', async () => {
    const fetchMock = api();
    const { user } = renderTela(fetchMock);
    await screen.findByText('Soro fisiológico');

    await user.click(screen.getByRole('button', { name: 'Novo Produto' }));
    const modal = await screen.findByRole('dialog', { name: 'Novo Produto/Serviço' });
    await user.click(within(modal).getByRole('button', { name: 'Cadastrar' }));

    expect(await within(modal).findByText('Nome é obrigatório.')).toBeVisible();
    expect(within(modal).getByText('Preço de venda é obrigatório.')).toBeVisible();
    expect(chamadasPara(fetchMock, API).filter(([, i]) => i?.method === 'POST')).toHaveLength(0);
  });

  it('Margem = (venda − custo) / venda, atualizada ao digitar', async () => {
    const { user } = renderTela();
    await screen.findByText('Soro fisiológico');

    await user.click(screen.getByRole('button', { name: 'Novo Produto' }));
    const modal = await screen.findByRole('dialog', { name: 'Novo Produto/Serviço' });
    await user.type(within(modal).getByLabelText('Preço de custo (R$)'), '3000');
    await user.type(within(modal).getByLabelText(/Preço de venda/), '5000');

    expect(within(modal).getByLabelText('Margem')).toHaveValue('40,0%');
  });

  it('Novo Produto: salva com os valores digitados, fecha o modal e recarrega a lista', async () => {
    let corpo: Corpo = {};
    const fetchMock = api({
      rotas: {
        [API]: (init) => {
          if (init?.method !== 'POST') return pagina(PRODUTOS);
          corpo = corpoDe(init);
          return json(produto({ id: '00000000-0000-4000-8000-0000000000c3' }), 201);
        },
      },
    });
    const { user } = renderTela(fetchMock);
    await screen.findByText('Soro fisiológico');

    await user.click(screen.getByRole('button', { name: 'Novo Produto' }));
    const modal = await screen.findByRole('dialog', { name: 'Novo Produto/Serviço' });
    await user.type(within(modal).getByLabelText(/Nome/), 'Luva');
    await user.click(within(modal).getByRole('combobox', { name: 'Tipo' }));
    await user.click(await screen.findByRole('option', { name: 'Uso e Consumo' }));
    await user.type(within(modal).getByLabelText('SKU'), 'LUV-01');
    await user.type(within(modal).getByLabelText(/Preço de venda/), '3590');
    await user.click(within(modal).getByRole('button', { name: 'Cadastrar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(corpo).toMatchObject({
      nome: 'Luva',
      tipo: 'uso-consumo',
      sku: 'LUV-01',
      precoCusto: null,
      precoVenda: 35.9,
      estoqueMinimo: 0,
      controlaEstoque: true,
      categoriaId: null,
      unidadeMedidaId: null,
    });
    expect(
      chamadasPara(fetchMock, API).filter(([, i]) => !i?.method || i.method === 'GET'),
    ).toHaveLength(2);
  });

  it('menu ⋯ tem Editar, Movimentar Estoque (desabilitado) e Excluir', async () => {
    const { user } = renderTela();
    const tr = (await screen.findByText('Soro fisiológico')).closest('tr') as HTMLElement;

    await user.click(within(tr).getByRole('button', { name: 'Ações' }));

    const itens = await screen.findAllByRole('menuitem');
    expect(itens.map((i) => i.textContent)).toEqual(['Editar', 'Movimentar Estoque', 'Excluir']);
    expect(screen.getByRole('menuitem', { name: 'Movimentar Estoque' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  it('Editar: abre com os dados (margem 0,0% com custo = venda) e envia PATCH com Salvar', async () => {
    let corpo: Corpo = {};
    const { user } = renderTela(
      api({
        rotas: {
          [API]: () => pagina([produto({ precoCusto: '10', precoVenda: '10' })]),
          [`${API}/${ID_1}`]: (init) => {
            corpo = corpoDe(init);
            return json(produto({ nome: 'Soro 500ml' }));
          },
        },
      }),
    );

    await abrirMenu(user, 'Soro fisiológico', 'Editar');
    const modal = await screen.findByRole('dialog', { name: 'Editar Produto' });
    const nome = within(modal).getByLabelText(/Nome/);
    expect(nome).toHaveValue('Soro fisiológico');
    expect(within(modal).getByLabelText('SKU')).toHaveValue('SORO-01');
    expect(within(modal).getByLabelText('Margem')).toHaveValue('0,0%');
    await user.clear(nome);
    await user.type(nome, 'Soro 500ml');
    await user.click(within(modal).getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(corpo).toMatchObject({
      nome: 'Soro 500ml',
      tipo: 'produto',
      sku: 'SORO-01',
      precoCusto: 10,
      precoVenda: 10,
    });
  });

  it('Excluir: confirma com o nome antes de enviar DELETE; Cancelar não exclui', async () => {
    let excluidos = 0;
    const { user } = renderTela(
      api({
        rotas: {
          [`${API}/${ID_1}`]: () => {
            excluidos += 1;
            return json(produto({}));
          },
        },
      }),
    );

    await abrirMenu(user, 'Soro fisiológico', 'Excluir');
    const dialogo = await screen.findByRole('alertdialog', { name: 'Excluir Produto' });
    expect(dialogo).toHaveTextContent('Tem certeza que deseja excluir "Soro fisiológico"?');
    await user.click(within(dialogo).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(excluidos).toBe(0);

    await abrirMenu(user, 'Soro fisiológico', 'Excluir');
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Excluir' }),
    );
    await waitFor(() => expect(excluidos).toBe(1));
  });

  it('Unidades: lista as cadastradas, valida e inclui nome e sigla', async () => {
    let corpo: Corpo = {};
    const fetchMock = api({
      rotas: {
        [API_UNIDADES]: (init) => {
          corpo = corpoDe(init);
          return json(
            {
              id: ID_UNIDADE,
              nome: 'Mililitro',
              sigla: 'ML',
              createdAt: '2026-10-14T12:00:00.000Z',
              updatedAt: '2026-10-14T12:00:00.000Z',
            },
            201,
          );
        },
      },
    });
    const { user } = renderTela(fetchMock);
    await screen.findByText('Soro fisiológico');

    await user.click(screen.getByRole('button', { name: 'Unidades' }));
    const modal = await screen.findByRole('dialog', { name: 'Unidades de Medida' });
    expect(await within(modal).findByText('CX – Caixa')).toBeVisible();

    await user.click(within(modal).getByRole('button', { name: 'Incluir' }));
    expect(await within(modal).findByText('O nome é obrigatório.')).toBeVisible();
    expect(within(modal).getByText('A sigla é obrigatória.')).toBeVisible();
    expect(chamadasPara(fetchMock, API_UNIDADES)).toHaveLength(0);

    await user.type(within(modal).getByPlaceholderText('Ex: Mililitro'), 'Mililitro');
    await user.type(within(modal).getByPlaceholderText('Ex: ML'), 'ml');
    await user.click(within(modal).getByRole('button', { name: 'Incluir' }));

    await waitFor(() => expect(corpo).toEqual({ nome: 'Mililitro', sigla: 'ML' }));
  });

  it('Nova Categoria abre o modal de categoria', async () => {
    const { user } = renderTela();
    await screen.findByText('Soro fisiológico');

    await user.click(screen.getByRole('button', { name: 'Nova Categoria' }));

    expect(await screen.findByRole('dialog', { name: 'Nova Categoria' })).toBeVisible();
  });

  it('sem permissões de escrita, esconde os botões e as ações', async () => {
    const somenteVer = PERMISSOES.filter((p) => p === 'compras-estoque.produtos-servicos.ver');
    renderTela(api({ usuario: { ...USUARIO_TESTE, permissoes: somenteVer } }));

    await screen.findByText('Soro fisiológico');

    for (const nome of ['Novo Produto', 'Unidades', 'Nova Categoria', 'Exportar', 'Ações']) {
      expect(screen.queryByRole('button', { name: nome })).not.toBeInTheDocument();
    }
  });
});
