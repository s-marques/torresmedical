import { PERMISSOES, PREFERENCIAS_PADRAO, type Bem } from '@torres/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { apiFalsa, chamadasPara, json, renderApp, USUARIO_TESTE } from '@/test/render-app';

const API = '/api/patrimonio-pessoal/patrimonio';
const ID_1 = '00000000-0000-4000-8000-0000000000f1';
const ID_2 = '00000000-0000-4000-8000-0000000000f2';

function bem(parcial: Partial<Bem>): Bem {
  return {
    id: ID_1,
    produtoId: null,
    descricao: 'Corolla 2024',
    tipo: 'AUTOMOVEL',
    valorCompra: 150_000,
    valorAtual: 140_000.5,
    dataAquisicao: '2024-01-10',
    marca: 'Marca X',
    modelo: 'Modelo Y',
    ano: 2024,
    placa: 'ABC-1D23',
    renavam: null,
    financiado: true,
    possuiSeguro: false,
    impostosPendentes: 0,
    createdAt: '2026-11-23T12:00:00.000Z',
    updatedAt: '2026-11-23T12:00:00.000Z',
    ...parcial,
  };
}

const BENS = [
  bem({}),
  bem({
    id: ID_2,
    descricao: 'Fazenda Norte',
    tipo: 'IMOVEL_RURAL',
    valorCompra: null,
    valorAtual: null,
    dataAquisicao: null,
    marca: null,
    modelo: null,
    ano: null,
    placa: null,
    financiado: false,
  }),
];

const RESUMO = { valorTotal: 140_000.5, impostosPendentes: 0, alertasProximos: 0 };

function pagina(data: Bem[]) {
  return json({ data, meta: { page: 1, pageSize: 10, total: data.length, totalPages: 1 } });
}

type Corpo = Record<string, unknown>;
type Usuario = ReturnType<typeof userEvent.setup>;

const corpoDe = (init?: RequestInit): Corpo => JSON.parse(String(init?.body)) as Corpo;

function parametros(fetchMock: ReturnType<typeof apiFalsa>) {
  const [url] = chamadasPara(fetchMock, API)
    .filter(([u]) => !u.includes('/resumo'))
    .at(-1) ?? [''];
  return Object.fromEntries(new URL(url, 'http://x').searchParams);
}

const posts = (fetchMock: ReturnType<typeof apiFalsa>) =>
  chamadasPara(fetchMock, API).filter(([, init]) => init?.method === 'POST');

function api(rotas: Parameters<typeof apiFalsa>[0] = {}) {
  return apiFalsa({
    ...rotas,
    rotas: {
      [API]: () => pagina(BENS),
      [`${API}/resumo`]: () => json(RESUMO),
      ...rotas.rotas,
    },
  });
}

function renderTela(fetchMock = api(), url = '/patrimonio') {
  return { user: userEvent.setup(), ...renderApp(url, fetchMock) };
}

const cabecalhos = () =>
  within(screen.getByRole('table'))
    .getAllByRole('columnheader')
    .map((c) => c.textContent);

async function abrirMenu(user: Usuario, linha: string, item: string) {
  const tr = (await screen.findByText(linha)).closest('tr') as HTMLElement;
  await user.click(within(tr).getByRole('button', { name: 'Ações' }));
  await user.click(await screen.findByRole('menuitem', { name: item }));
}

async function abrirNovo(user: Usuario) {
  await screen.findByText('Corolla 2024');
  await user.click(screen.getByRole('button', { name: 'Novo Bem' }));
  return screen.findByRole('dialog', { name: 'Novo Bem' });
}

async function escolher(user: Usuario, modal: HTMLElement, campo: string, opcao: string) {
  await user.click(within(modal).getByRole('combobox', { name: campo }));
  await user.click(await screen.findByRole('option', { name: opcao }));
}

describe('Patrimônio (/patrimonio)', { timeout: 20_000 }, () => {
  it('mostra título, cartões, abas, busca, ações e a grid com as colunas do inventário', async () => {
    const fetchMock = api();
    renderTela(fetchMock);

    expect(await screen.findByRole('heading', { name: 'Patrimônio' })).toBeInTheDocument();
    expect(screen.getByText('Gerencie veículos, imóveis e bens do cliente.')).toBeVisible();
    await screen.findByText('Corolla 2024');
    expect(cabecalhos()).toEqual([
      'Descrição',
      'Tipo',
      'Valor Compra',
      'Valor Atual',
      'Data Aquisição',
      'Impostos Pend.',
      'Ações',
    ]);
    expect(screen.getByText('Valor Total Patrimônio')).toBeVisible();
    expect(screen.getByText('Impostos Pendentes')).toBeVisible();
    expect(screen.getByText('Alertas Próximos')).toBeVisible();
    await waitFor(() =>
      expect(screen.getByTestId('resumo-valorTotal')).toHaveTextContent(/140\.000,50/),
    );
    expect(screen.getByTestId('resumo-impostosPendentes')).toHaveTextContent('0');
    for (const aba of ['Bens', 'Impostos/Taxas', 'Alertas']) {
      expect(screen.getByRole('tab', { name: aba })).toBeVisible();
    }
    expect(screen.getByPlaceholderText('Buscar bens...')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Novo Bem' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Exportar' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Colunas' })).toBeVisible();
    expect(parametros(fetchMock)).toMatchObject({ page: '1', pageSize: '10' });
  });

  it('mostra o tipo pelo rótulo, valores em R$, data e "-" quando vazio', async () => {
    renderTela();

    const carro = (await screen.findByText('Corolla 2024')).closest('tr') as HTMLElement;
    expect(within(carro).getByText('Automóvel')).toBeVisible();
    expect(within(carro).getByText(/R\$\s150\.000,00/)).toBeVisible();
    expect(within(carro).getByText(/R\$\s140\.000,50/)).toBeVisible();
    expect(within(carro).getByText('10/01/2024')).toBeVisible();

    const fazenda = screen.getByText('Fazenda Norte').closest('tr') as HTMLElement;
    expect(within(fazenda).getByText('Imóvel Rural')).toBeVisible();
    expect(within(fazenda).getAllByText('-')).toHaveLength(3);
  });

  it('mostra o estado vazio', async () => {
    renderTela(api({ rotas: { [API]: () => pagina([]) } }));

    expect(await screen.findByText('Nenhum bem encontrado.')).toBeVisible();
  });

  it('a busca envia search para a API', async () => {
    const fetchMock = api();
    const { user } = renderTela(fetchMock);
    await screen.findByText('Corolla 2024');

    await user.type(screen.getByPlaceholderText('Buscar bens...'), 'corolla');

    await waitFor(() => expect(parametros(fetchMock)).toMatchObject({ search: 'corolla' }));
  });

  it('filtro Tipo lista Todos e os quatro tipos e envia tipo para a API', async () => {
    const fetchMock = api();
    const { user } = renderTela(fetchMock);
    await screen.findByText('Corolla 2024');

    await user.click(screen.getByRole('combobox', { name: 'Tipo' }));
    const opcoes = await screen.findAllByRole('option');
    expect(opcoes.map((o) => o.textContent)).toEqual([
      'Todos',
      'Automóvel',
      'Imóvel Urbano',
      'Imóvel Rural',
      'Bem Móvel',
    ]);
    await user.click(screen.getByRole('option', { name: 'Imóvel Urbano' }));

    await waitFor(() => expect(parametros(fetchMock)).toMatchObject({ tipo: 'IMOVEL_URBANO' }));
  });

  it('ordena pelas colunas do inventário; Impostos Pend. não ordena', async () => {
    const fetchMock = api();
    const { user } = renderTela(fetchMock);
    await screen.findByText('Corolla 2024');

    const colunas = {
      Descrição: 'descricao',
      Tipo: 'tipo',
      'Valor Compra': 'valorCompra',
      'Valor Atual': 'valorAtual',
      'Data Aquisição': 'dataAquisicao',
    };
    for (const [titulo, campo] of Object.entries(colunas)) {
      await user.click(screen.getByRole('button', { name: titulo }));
      await waitFor(() => expect(parametros(fetchMock)).toMatchObject({ sort: `${campo}:asc` }));
    }
    expect(screen.queryByRole('button', { name: 'Impostos Pend.' })).not.toBeInTheDocument();
  });

  it('paginação: próxima página chama a API com page=2', async () => {
    const fetchMock = api({
      rotas: {
        [API]: () =>
          json({ data: BENS, meta: { page: 1, pageSize: 10, total: 12, totalPages: 2 } }),
      },
    });
    const { user } = renderTela(fetchMock);
    await screen.findByText('Corolla 2024');

    await user.click(screen.getByRole('button', { name: 'Ir para próxima página' }));

    await waitFor(() => expect(parametros(fetchMock)).toMatchObject({ page: '2' }));
  });

  it('Colunas lista as seis colunas e permite ocultar uma', async () => {
    const { user } = renderTela();
    await screen.findByText('Corolla 2024');

    await user.click(screen.getByRole('button', { name: 'Colunas' }));
    const itens = await screen.findAllByRole('menuitemcheckbox');
    expect(itens.map((i) => i.textContent)).toEqual([
      'Descrição',
      'Tipo',
      'Valor Compra',
      'Valor Atual',
      'Data Aquisição',
      'Impostos Pend.',
    ]);
    await user.click(screen.getByRole('menuitemcheckbox', { name: 'Valor Atual' }));
    await user.keyboard('{Escape}');

    await waitFor(() => expect(cabecalhos()).not.toContain('Valor Atual'));
  }, 15_000);

  it('aba Impostos/Taxas: pede para selecionar um bem e "Ir para Bens" volta à aba Bens', async () => {
    const { user } = renderTela();
    await screen.findByText('Corolla 2024');

    await user.click(screen.getByRole('tab', { name: 'Impostos/Taxas' }));
    expect(
      await screen.findByText('Selecione um bem na aba "Bens" para ver seus impostos e taxas.'),
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Ir para Bens' }));

    expect(await screen.findByText('Corolla 2024')).toBeVisible();
  });

  it('aba Alertas: mostra "Nenhum alerta nos próximos 30 dias."', async () => {
    const { user } = renderTela();
    await screen.findByText('Corolla 2024');

    await user.click(screen.getByRole('tab', { name: 'Alertas' }));

    expect(await screen.findByText('Nenhum alerta nos próximos 30 dias.')).toBeVisible();
  });

  it('Novo Bem: campos do print, Tipo Automóvel e seção Dados do Veículo', async () => {
    const { user } = renderTela();
    const modal = await abrirNovo(user);

    for (const rotulo of [
      'Descrição',
      'Valor Compra (R$)',
      'Data Aquisição',
      'Marca',
      'Modelo',
      'Ano',
      'Placa',
      'RENAVAM',
    ]) {
      expect(within(modal).getByLabelText(rotulo)).toBeVisible();
    }
    expect(within(modal).getByText('Vincular a Produto (opcional)')).toBeVisible();
    expect(
      within(modal).getByText('Vincule a um produto cadastrado para rastrear via notas de compra'),
    ).toBeVisible();
    expect(within(modal).getByRole('group', { name: 'Dados do Veículo' })).toBeVisible();
    expect(within(modal).getByRole('switch', { name: 'Financiado' })).not.toBeChecked();
    expect(within(modal).getByRole('switch', { name: 'Possui Seguro' })).not.toBeChecked();
    expect(within(modal).getByPlaceholderText('Ex: Corolla 2024')).toBeVisible();
    expect(within(modal).getByPlaceholderText('ABC-1D23')).toBeVisible();
    expect(within(modal).getByRole('combobox', { name: 'Tipo' })).toHaveTextContent('Automóvel');
    expect(within(modal).getByRole('button', { name: 'Cancelar' })).toBeVisible();
    expect(within(modal).getByRole('button', { name: 'Cadastrar' })).toBeVisible();
  });

  it('Novo Bem: fora de Automóvel a seção Dados do Veículo some', async () => {
    const { user } = renderTela();
    const modal = await abrirNovo(user);

    await escolher(user, modal, 'Tipo', 'Bem Móvel');

    expect(
      within(modal).queryByRole('group', { name: 'Dados do Veículo' }),
    ).not.toBeInTheDocument();
    expect(within(modal).queryByLabelText('Placa')).not.toBeInTheDocument();
  });

  it('Novo Bem: vazio mostra "Descrição é obrigatória." e não envia', async () => {
    const fetchMock = api();
    const { user } = renderTela(fetchMock);
    const modal = await abrirNovo(user);

    await user.click(within(modal).getByRole('button', { name: 'Cadastrar' }));

    expect(await within(modal).findByText('Descrição é obrigatória.')).toBeVisible();
    expect(posts(fetchMock)).toHaveLength(0);
  });

  it('Novo Bem: envia o Automóvel, fecha o modal e recarrega a lista e os cartões', async () => {
    let corpo: Corpo = {};
    const fetchMock = api({
      rotas: {
        [API]: (init) => {
          if (init?.method !== 'POST') return pagina(BENS);
          corpo = corpoDe(init);
          return json(bem({ id: '00000000-0000-4000-8000-0000000000f3' }), 201);
        },
      },
    });
    const { user } = renderTela(fetchMock);
    const modal = await abrirNovo(user);

    await user.type(within(modal).getByLabelText('Descrição'), 'Carro Teste');
    await user.type(within(modal).getByLabelText('Valor Compra (R$)'), '12000050');
    await user.type(within(modal).getByLabelText('Data Aquisição'), '2024-05-20');
    await user.type(within(modal).getByLabelText('Marca'), 'Marca X');
    await user.type(within(modal).getByLabelText('Modelo'), 'Modelo Y');
    await user.type(within(modal).getByLabelText('Ano'), '2024');
    await user.type(within(modal).getByLabelText('Placa'), 'ABC-1D23');
    await user.click(within(modal).getByRole('switch', { name: 'Financiado' }));

    await user.click(within(modal).getByRole('button', { name: 'Cadastrar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(corpo).toEqual({
      produtoId: null,
      descricao: 'Carro Teste',
      tipo: 'AUTOMOVEL',
      valorCompra: 120_000.5,
      dataAquisicao: '2024-05-20',
      marca: 'Marca X',
      modelo: 'Modelo Y',
      ano: 2024,
      placa: 'ABC-1D23',
      renavam: null,
      financiado: true,
      possuiSeguro: false,
    });
    expect(await screen.findByText('Bem cadastrado.')).toBeInTheDocument();
    await waitFor(() =>
      expect(chamadasPara(fetchMock, `${API}/resumo`).length).toBeGreaterThanOrEqual(2),
    );
  });

  it('menu ⋯ tem Editar e Excluir; Editar abre com os dados e envia PATCH com Salvar', async () => {
    let corpo: Corpo = {};
    const { user } = renderTela(
      api({
        rotas: {
          [`${API}/${ID_2}`]: (init) => {
            corpo = corpoDe(init);
            return json(bem({ id: ID_2, descricao: 'Fazenda Sul' }));
          },
        },
      }),
    );

    await abrirMenu(user, 'Fazenda Norte', 'Editar');
    const modal = await screen.findByRole('dialog', { name: 'Editar Bem' });
    const descricao = within(modal).getByLabelText('Descrição');
    expect(descricao).toHaveValue('Fazenda Norte');
    expect(within(modal).getByRole('combobox', { name: 'Tipo' })).toHaveTextContent('Imóvel Rural');
    await user.clear(descricao);
    await user.type(descricao, 'Fazenda Sul');
    await user.click(within(modal).getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(corpo).toMatchObject({
      descricao: 'Fazenda Sul',
      tipo: 'IMOVEL_RURAL',
      valorCompra: null,
      dataAquisicao: null,
    });
  });

  it('Excluir: confirma antes e envia DELETE; Cancelar não exclui', async () => {
    let excluidos = 0;
    const { user } = renderTela(
      api({
        rotas: {
          [`${API}/${ID_1}`]: () => {
            excluidos += 1;
            return json(bem({}));
          },
        },
      }),
    );

    await abrirMenu(user, 'Corolla 2024', 'Excluir');
    const dialogo = await screen.findByRole('alertdialog', { name: 'Excluir Bem' });
    expect(dialogo).toHaveTextContent(
      'Tem certeza que deseja excluir o bem "Corolla 2024"? Esta ação não pode ser desfeita.',
    );
    await user.click(within(dialogo).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(excluidos).toBe(0);

    await abrirMenu(user, 'Corolla 2024', 'Excluir');
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Excluir' }),
    );
    await waitFor(() => expect(excluidos).toBe(1));
  });

  it('sem permissão de criar, editar, excluir e exportar, esconde os botões e as ações', async () => {
    const somenteVer = PERMISSOES.filter((p) => p === 'patrimonio-pessoal.patrimonio.ver');
    renderTela(api({ usuario: { ...USUARIO_TESTE, permissoes: somenteVer } }));

    await screen.findByText('Corolla 2024');

    expect(screen.queryByRole('button', { name: 'Novo Bem' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Exportar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ações' })).not.toBeInTheDocument();
  });

  it('em inglês: textos da tela, do modal e da validação traduzidos', async () => {
    const usuario = {
      ...USUARIO_TESTE,
      preferencias: { ...PREFERENCIAS_PADRAO, idioma: 'en' as const },
    };
    const fetchMock = api({ usuario });
    const { user } = renderTela(fetchMock);

    expect(await screen.findByRole('heading', { name: 'Assets' })).toBeInTheDocument();
    await screen.findByText('Corolla 2024');
    expect(cabecalhos()).toEqual([
      'Description',
      'Type',
      'Purchase Value',
      'Current Value',
      'Acquisition Date',
      'Pending Taxes',
      'Actions',
    ]);
    expect(screen.getByText('Total Asset Value')).toBeVisible();
    expect(screen.getByRole('tab', { name: 'Taxes/Fees' })).toBeVisible();
    expect(screen.getByPlaceholderText('Search assets...')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'New Asset' }));
    const modal = await screen.findByRole('dialog', { name: 'New Asset' });
    expect(within(modal).getByRole('group', { name: 'Vehicle Details' })).toBeVisible();
    expect(within(modal).getByLabelText('Purchase Value (R$)')).toBeVisible();
    await user.click(within(modal).getByRole('button', { name: 'Register' }));

    expect(await within(modal).findByText('Description is required.')).toBeVisible();
    expect(posts(fetchMock)).toHaveLength(0);
  });
});
