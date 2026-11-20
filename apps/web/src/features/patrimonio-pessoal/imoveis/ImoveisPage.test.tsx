import { PERMISSOES, PREFERENCIAS_PADRAO, type Imovel } from '@torres/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { apiFalsa, chamadasPara, json, renderApp, USUARIO_TESTE } from '@/test/render-app';

const API = '/api/patrimonio-pessoal/imoveis';
const ID_1 = '00000000-0000-4000-8000-0000000000e1';
const ID_2 = '00000000-0000-4000-8000-0000000000e2';

function imovel(parcial: Partial<Imovel>): Imovel {
  return {
    id: ID_1,
    descricao: 'Apto Centro',
    tipo: 'APARTAMENTO',
    endereco: 'Rua Fictícia, 10',
    matricula: null,
    valorCompra: 300_000,
    dataCompra: '2024-03-10',
    iptuAnual: null,
    itbiPago: null,
    banco: 'Banco Teste',
    financiamentoParcela: 1500.5,
    saldoDevedor: null,
    vencimentoFinanciamento: null,
    condominio: 450,
    contaLuz: 120,
    contaAgua: null,
    internet: 100,
    seguro: null,
    despesaMensal: 670,
    observacoes: null,
    createdAt: '2026-11-19T12:00:00.000Z',
    updatedAt: '2026-11-19T12:00:00.000Z',
    ...parcial,
  };
}

const IMOVEIS = [
  imovel({}),
  imovel({
    id: ID_2,
    descricao: 'Galpão Industrial',
    tipo: 'GALPAO',
    endereco: null,
    valorCompra: null,
    financiamentoParcela: null,
    condominio: null,
    contaLuz: null,
    internet: null,
    despesaMensal: 0,
  }),
];

function pagina(data: Imovel[]) {
  return json({ data, meta: { page: 1, pageSize: 10, total: data.length, totalPages: 1 } });
}

type Corpo = Record<string, unknown>;
type Usuario = ReturnType<typeof userEvent.setup>;

function corpoDe(init?: RequestInit): Corpo {
  return JSON.parse(String(init?.body)) as Corpo;
}

function parametros(fetchMock: ReturnType<typeof apiFalsa>) {
  const [url] = chamadasPara(fetchMock, API).at(-1) ?? [''];
  return Object.fromEntries(new URL(url, 'http://x').searchParams);
}

function posts(fetchMock: ReturnType<typeof apiFalsa>) {
  return chamadasPara(fetchMock, API).filter(([, init]) => init?.method === 'POST');
}

function api(rotas: Parameters<typeof apiFalsa>[0] = {}) {
  return apiFalsa({ ...rotas, rotas: { [API]: () => pagina(IMOVEIS), ...rotas.rotas } });
}

function renderTela(fetchMock = api()) {
  return { user: userEvent.setup(), ...renderApp('/imoveis', fetchMock) };
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
  await screen.findByText('Apto Centro');
  await user.click(screen.getByRole('button', { name: 'Novo Imóvel' }));
  return screen.findByRole('dialog', { name: 'Novo Imóvel' });
}

async function escolher(user: Usuario, modal: HTMLElement, campo: string, opcao: string) {
  await user.click(within(modal).getByRole('combobox', { name: campo }));
  await user.click(await screen.findByRole('option', { name: opcao }));
}

describe('Imóveis (/imoveis)', { timeout: 20_000 }, () => {
  it('mostra título, busca, ações e a grid com as colunas do inventário', async () => {
    const fetchMock = api();
    renderTela(fetchMock);

    expect(await screen.findByRole('heading', { name: 'Imóveis' })).toBeInTheDocument();
    expect(screen.getByText('Gerencie os imóveis cadastrados.')).toBeVisible();
    await screen.findByText('Apto Centro');
    expect(cabecalhos()).toEqual([
      'Descrição',
      'Tipo',
      'Endereço',
      'Valor Compra',
      'Financ. Parcela',
      'Desp. Mensal',
      'Ações',
    ]);
    expect(screen.getByPlaceholderText('Buscar imóveis...')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Novo Imóvel' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Exportar' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Colunas' })).toBeVisible();
    expect(parametros(fetchMock)).toMatchObject({ page: '1', pageSize: '10' });
  });

  it('mostra o tipo pelo rótulo, os valores em R$ e "-" quando vazio', async () => {
    renderTela();

    const apto = (await screen.findByText('Apto Centro')).closest('tr') as HTMLElement;
    expect(within(apto).getByText('Apartamento')).toBeVisible();
    expect(within(apto).getByText('Rua Fictícia, 10')).toBeVisible();
    expect(within(apto).getByText(/R\$\s300\.000,00/)).toBeVisible();
    expect(within(apto).getByText(/R\$\s1\.500,50/)).toBeVisible();
    expect(within(apto).getByText(/R\$\s670,00/)).toBeVisible();

    const galpao = screen.getByText('Galpão Industrial').closest('tr') as HTMLElement;
    expect(within(galpao).getAllByText('Galpão').length).toBeGreaterThan(0);
    expect(within(galpao).getAllByText('-')).toHaveLength(3);
    expect(within(galpao).getByText(/R\$\s0,00/)).toBeVisible();
  });

  it('mostra o estado vazio', async () => {
    renderTela(api({ rotas: { [API]: () => pagina([]) } }));

    expect(await screen.findByText('Nenhum imóvel encontrado.')).toBeVisible();
  });

  it('a busca envia search para a API', async () => {
    const fetchMock = api();
    const { user } = renderTela(fetchMock);
    await screen.findByText('Apto Centro');

    await user.type(screen.getByPlaceholderText('Buscar imóveis...'), 'centro');

    await waitFor(() => expect(parametros(fetchMock)).toMatchObject({ search: 'centro' }));
  });

  it('ordena pelas colunas do inventário; Desp. Mensal não ordena', async () => {
    const fetchMock = api();
    const { user } = renderTela(fetchMock);
    await screen.findByText('Apto Centro');

    const colunas = {
      Descrição: 'descricao',
      Tipo: 'tipo',
      Endereço: 'endereco',
      'Valor Compra': 'valorCompra',
      'Financ. Parcela': 'financiamentoParcela',
    };
    for (const [titulo, campo] of Object.entries(colunas)) {
      await user.click(screen.getByRole('button', { name: titulo }));
      await waitFor(() => expect(parametros(fetchMock)).toMatchObject({ sort: `${campo}:asc` }));
    }
    expect(screen.queryByRole('button', { name: 'Desp. Mensal' })).not.toBeInTheDocument();
  });

  it('paginação: próxima página chama a API com page=2', async () => {
    const fetchMock = api({
      rotas: {
        [API]: () =>
          json({ data: IMOVEIS, meta: { page: 1, pageSize: 10, total: 12, totalPages: 2 } }),
      },
    });
    const { user } = renderTela(fetchMock);
    await screen.findByText('Apto Centro');

    await user.click(screen.getByRole('button', { name: 'Ir para próxima página' }));

    await waitFor(() => expect(parametros(fetchMock)).toMatchObject({ page: '2' }));
  });

  it('Colunas lista as cinco colunas do inventário e permite ocultar uma', async () => {
    const { user } = renderTela();
    await screen.findByText('Apto Centro');

    await user.click(screen.getByRole('button', { name: 'Colunas' }));
    const itens = await screen.findAllByRole('menuitemcheckbox');
    expect(itens.map((i) => i.textContent)).toEqual([
      'Descrição',
      'Tipo',
      'Endereço',
      'Valor Compra',
      'Financ. Parcela',
    ]);
    await user.click(screen.getByRole('menuitemcheckbox', { name: 'Endereço' }));
    await user.keyboard('{Escape}');

    await waitFor(() => expect(cabecalhos()).not.toContain('Endereço'));
  }, 15_000);

  it('Novo Imóvel: três seções com os campos do print e o Tipo Apartamento', async () => {
    const { user } = renderTela();
    const modal = await abrirNovo(user);

    for (const secao of ['Dados do Imóvel', 'Financiamento', 'Despesas Mensais Vinculadas']) {
      expect(within(modal).getByRole('group', { name: secao })).toBeVisible();
    }
    for (const rotulo of [
      'Descrição',
      'Endereço',
      'Matrícula',
      'Valor Compra (R$)',
      'Data Compra',
      'IPTU Anual (R$)',
      'ITBI Pago (R$)',
      'Banco',
      'Parcela (R$)',
      'Saldo Devedor (R$)',
      'Vencimento Financiamento',
      'Condomínio (R$)',
      'Conta Luz (R$)',
      'Conta Água (R$)',
      'Internet (R$)',
      'Seguro (R$)',
      'Observações',
    ]) {
      expect(within(modal).getByLabelText(rotulo)).toBeVisible();
    }
    expect(within(modal).getByPlaceholderText('Ex: Apto 302 Ed. Solar')).toBeVisible();
    expect(within(modal).getByRole('combobox', { name: 'Tipo' })).toHaveTextContent('Apartamento');
    await user.click(within(modal).getByRole('combobox', { name: 'Tipo' }));
    const opcoes = await screen.findAllByRole('option');
    expect(opcoes.map((o) => o.textContent)).toEqual([
      'Apartamento',
      'Sala Comercial',
      'Terreno',
      'Casa',
      'Galpão',
    ]);
    await user.keyboard('{Escape}');
    expect(within(modal).getByRole('button', { name: 'Cancelar' })).toBeVisible();
    expect(within(modal).getByRole('button', { name: 'Cadastrar' })).toBeVisible();
  });

  it('Novo Imóvel: vazio mostra "Descrição é obrigatória." e não envia', async () => {
    const fetchMock = api();
    const { user } = renderTela(fetchMock);
    const modal = await abrirNovo(user);

    await user.click(within(modal).getByRole('button', { name: 'Cadastrar' }));

    expect(await within(modal).findByText('Descrição é obrigatória.')).toBeVisible();
    expect(posts(fetchMock)).toHaveLength(0);
  });

  it('Novo Imóvel: envia as três seções, fecha o modal e recarrega a lista', async () => {
    let corpo: Corpo = {};
    const fetchMock = api({
      rotas: {
        [API]: (init) => {
          if (init?.method !== 'POST') return pagina(IMOVEIS);
          corpo = corpoDe(init);
          return json(imovel({ id: '00000000-0000-4000-8000-0000000000e3' }), 201);
        },
      },
    });
    const { user } = renderTela(fetchMock);
    const modal = await abrirNovo(user);

    await user.type(within(modal).getByLabelText('Descrição'), 'Sala 302');
    await escolher(user, modal, 'Tipo', 'Sala Comercial');
    await user.type(within(modal).getByLabelText('Valor Compra (R$)'), '42000000');
    await user.type(within(modal).getByLabelText('Data Compra'), '2023-08-15');
    await user.type(within(modal).getByLabelText('Banco'), 'Banco Teste');
    await user.type(within(modal).getByLabelText('Parcela (R$)'), '220050');
    await user.type(within(modal).getByLabelText('Condomínio (R$)'), '60000');
    await user.type(within(modal).getByLabelText('Seguro (R$)'), '4500');
    await user.type(within(modal).getByLabelText('Observações'), 'Alugada');

    await user.click(within(modal).getByRole('button', { name: 'Cadastrar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(corpo).toEqual({
      descricao: 'Sala 302',
      tipo: 'SALA_COMERCIAL',
      endereco: null,
      matricula: null,
      valorCompra: 420_000,
      dataCompra: '2023-08-15',
      iptuAnual: null,
      itbiPago: null,
      banco: 'Banco Teste',
      financiamentoParcela: 2200.5,
      saldoDevedor: null,
      vencimentoFinanciamento: null,
      condominio: 600,
      contaLuz: null,
      contaAgua: null,
      internet: null,
      seguro: 45,
      observacoes: 'Alugada',
    });
    expect(
      chamadasPara(fetchMock, API).filter(([, i]) => !i?.method || i.method === 'GET'),
    ).toHaveLength(2);
    expect(await screen.findByText('Imóvel cadastrado.')).toBeInTheDocument();
  });

  it('menu ⋯ tem Editar e Excluir; Editar abre com os dados e envia PATCH com Salvar', async () => {
    let corpo: Corpo = {};
    const { user } = renderTela(
      api({
        rotas: {
          [`${API}/${ID_2}`]: (init) => {
            corpo = corpoDe(init);
            return json(imovel({ id: ID_2, descricao: 'Galpão Norte' }));
          },
        },
      }),
    );

    await abrirMenu(user, 'Galpão Industrial', 'Editar');
    const modal = await screen.findByRole('dialog', { name: 'Editar Imóvel' });
    const descricao = within(modal).getByLabelText('Descrição');
    expect(descricao).toHaveValue('Galpão Industrial');
    expect(within(modal).getByRole('combobox', { name: 'Tipo' })).toHaveTextContent('Galpão');
    expect(within(modal).getByLabelText('Data Compra')).toHaveValue('2024-03-10');
    await user.clear(descricao);
    await user.type(descricao, 'Galpão Norte');
    await user.click(within(modal).getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(corpo).toMatchObject({
      descricao: 'Galpão Norte',
      tipo: 'GALPAO',
      dataCompra: '2024-03-10',
      banco: 'Banco Teste',
      valorCompra: null,
    });
  });

  it('Excluir: confirma antes e envia DELETE; Cancelar não exclui', async () => {
    let excluidos = 0;
    const { user } = renderTela(
      api({
        rotas: {
          [`${API}/${ID_1}`]: () => {
            excluidos += 1;
            return json(imovel({}));
          },
        },
      }),
    );

    await abrirMenu(user, 'Apto Centro', 'Excluir');
    const dialogo = await screen.findByRole('alertdialog', { name: 'Excluir Imóvel' });
    expect(dialogo).toHaveTextContent(
      'Tem certeza que deseja excluir o imóvel "Apto Centro"? Esta ação não pode ser desfeita.',
    );
    await user.click(within(dialogo).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(excluidos).toBe(0);

    await abrirMenu(user, 'Apto Centro', 'Excluir');
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Excluir' }),
    );
    await waitFor(() => expect(excluidos).toBe(1));
  });

  it('sem permissão de criar, editar, excluir e exportar, esconde os botões e as ações', async () => {
    const somenteVer = PERMISSOES.filter((p) => p === 'patrimonio-pessoal.imoveis.ver');
    renderTela(api({ usuario: { ...USUARIO_TESTE, permissoes: somenteVer } }));

    await screen.findByText('Apto Centro');

    expect(screen.queryByRole('button', { name: 'Novo Imóvel' })).not.toBeInTheDocument();
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

    expect(await screen.findByRole('heading', { name: 'Real Estate' })).toBeInTheDocument();
    await screen.findByText('Apto Centro');
    expect(cabecalhos()).toEqual([
      'Description',
      'Type',
      'Address',
      'Purchase Price',
      'Loan Installment',
      'Monthly Expenses',
      'Actions',
    ]);
    expect(screen.getByText('Apartment')).toBeVisible();
    expect(screen.getByPlaceholderText('Search properties...')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'New Property' }));
    const modal = await screen.findByRole('dialog', { name: 'New Property' });
    expect(within(modal).getByRole('group', { name: 'Financing' })).toBeVisible();
    expect(within(modal).getByLabelText('Purchase Price (R$)')).toBeVisible();
    await user.click(within(modal).getByRole('button', { name: 'Register' }));

    expect(await within(modal).findByText('Description is required.')).toBeVisible();
    expect(posts(fetchMock)).toHaveLength(0);
  });
});
