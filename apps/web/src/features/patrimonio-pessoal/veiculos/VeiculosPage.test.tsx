import { PERMISSOES, PREFERENCIAS_PADRAO, type Veiculo } from '@torres/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { apiFalsa, chamadasPara, json, renderApp, USUARIO_TESTE } from '@/test/render-app';

const API = '/api/patrimonio-pessoal/veiculos';
const ID_1 = '00000000-0000-4000-8000-0000000000f1';
const ID_2 = '00000000-0000-4000-8000-0000000000f2';

function veiculo(parcial: Partial<Veiculo>): Veiculo {
  return {
    id: ID_1,
    descricao: 'Corolla Clínica',
    tipo: 'CARRO',
    placa: 'ABC1D23',
    renavam: null,
    chassi: null,
    ano: 2024,
    cor: 'Branco',
    uso: 'CLINICA',
    valorCompra: 150_000,
    dataCompra: '2024-03-10',
    ipvaAnual: 3200,
    licenciamento: null,
    seguroAnual: 4100.5,
    vencimentoSeguro: null,
    banco: 'Banco Teste',
    financiamentoParcela: 2500,
    saldoDevedor: null,
    vencimentoFinanciamento: null,
    observacoes: null,
    createdAt: '2026-11-25T12:00:00.000Z',
    updatedAt: '2026-11-25T12:00:00.000Z',
    ...parcial,
  };
}

const VEICULOS = [
  veiculo({}),
  veiculo({
    id: ID_2,
    descricao: 'Moto Entrega',
    tipo: 'MOTO',
    uso: 'MISTO',
    placa: null,
    ipvaAnual: null,
    seguroAnual: null,
    financiamentoParcela: null,
    valorCompra: null,
    banco: null,
  }),
];

function pagina(data: Veiculo[]) {
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
  return apiFalsa({ ...rotas, rotas: { [API]: () => pagina(VEICULOS), ...rotas.rotas } });
}

function renderTela(fetchMock = api()) {
  return { user: userEvent.setup(), ...renderApp('/veiculos', fetchMock) };
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
  await screen.findByText('Corolla Clínica');
  await user.click(screen.getByRole('button', { name: 'Novo Veiculo' }));
  return screen.findByRole('dialog', { name: 'Novo Veiculo' });
}

async function escolher(user: Usuario, modal: HTMLElement, campo: string, opcao: string) {
  await user.click(within(modal).getByRole('combobox', { name: campo }));
  await user.click(await screen.findByRole('option', { name: opcao }));
}

const COLUNAS = ['Descrição', 'Placa', 'Tipo', 'Uso', 'IPVA', 'Seguro', 'Financ. Parcela'];

describe('Veículos (/veiculos)', { timeout: 20_000 }, () => {
  it('mostra título, busca, ações e a grid com as colunas do inventário', async () => {
    const fetchMock = api();
    renderTela(fetchMock);

    expect(await screen.findByRole('heading', { name: 'Veículos' })).toBeInTheDocument();
    expect(screen.getByText('Gerencie os veiculos cadastrados.')).toBeVisible();
    await screen.findByText('Corolla Clínica');
    expect(cabecalhos()).toEqual([...COLUNAS, 'Ações']);
    expect(screen.getByPlaceholderText('Buscar veiculos...')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Novo Veiculo' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Exportar' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Colunas' })).toBeVisible();
    expect(parametros(fetchMock)).toMatchObject({ page: '1', pageSize: '10' });
  });

  it('mostra tipo e uso pelos rótulos, os valores em R$ e "-" quando vazio', async () => {
    renderTela();

    const carro = (await screen.findByText('Corolla Clínica')).closest('tr') as HTMLElement;
    expect(within(carro).getByText('ABC1D23')).toBeVisible();
    expect(within(carro).getByText('Carro')).toBeVisible();
    expect(within(carro).getByText('Clínica')).toBeVisible();
    expect(within(carro).getByText(/R\$\s3\.200,00/)).toBeVisible();
    expect(within(carro).getByText(/R\$\s4\.100,50/)).toBeVisible();
    expect(within(carro).getByText(/R\$\s2\.500,00/)).toBeVisible();

    const moto = screen.getByText('Moto Entrega').closest('tr') as HTMLElement;
    expect(within(moto).getByText('Moto')).toBeVisible();
    expect(within(moto).getByText('Misto')).toBeVisible();
    expect(within(moto).getAllByText('-')).toHaveLength(4);
  });

  it('mostra o estado vazio', async () => {
    renderTela(api({ rotas: { [API]: () => pagina([]) } }));

    expect(await screen.findByText('Nenhum veiculo encontrado.')).toBeVisible();
  });

  it('a busca envia search para a API', async () => {
    const fetchMock = api();
    const { user } = renderTela(fetchMock);
    await screen.findByText('Corolla Clínica');

    await user.type(screen.getByPlaceholderText('Buscar veiculos...'), 'corolla');

    await waitFor(() => expect(parametros(fetchMock)).toMatchObject({ search: 'corolla' }));
  });

  it('ordena por cada uma das sete colunas do inventário', async () => {
    const fetchMock = api();
    const { user } = renderTela(fetchMock);
    await screen.findByText('Corolla Clínica');

    const colunas = {
      Descrição: 'descricao',
      Placa: 'placa',
      Tipo: 'tipo',
      Uso: 'uso',
      IPVA: 'ipvaAnual',
      Seguro: 'seguroAnual',
      'Financ. Parcela': 'financiamentoParcela',
    };
    for (const [titulo, campo] of Object.entries(colunas)) {
      await user.click(screen.getByRole('button', { name: titulo }));
      await waitFor(() => expect(parametros(fetchMock)).toMatchObject({ sort: `${campo}:asc` }));
    }
  });

  it('paginação: próxima página chama a API com page=2', async () => {
    const fetchMock = api({
      rotas: {
        [API]: () =>
          json({ data: VEICULOS, meta: { page: 1, pageSize: 10, total: 12, totalPages: 2 } }),
      },
    });
    const { user } = renderTela(fetchMock);
    await screen.findByText('Corolla Clínica');

    await user.click(screen.getByRole('button', { name: 'Ir para próxima página' }));

    await waitFor(() => expect(parametros(fetchMock)).toMatchObject({ page: '2' }));
  });

  it('Colunas lista as sete colunas do inventário e permite ocultar uma', async () => {
    const { user } = renderTela();
    await screen.findByText('Corolla Clínica');

    await user.click(screen.getByRole('button', { name: 'Colunas' }));
    const itens = await screen.findAllByRole('menuitemcheckbox');
    expect(itens.map((i) => i.textContent)).toEqual(COLUNAS);
    await user.click(screen.getByRole('menuitemcheckbox', { name: 'Placa' }));
    await user.keyboard('{Escape}');

    await waitFor(() => expect(cabecalhos()).not.toContain('Placa'));
  }, 15_000);

  it('Novo Veiculo: três seções com os campos do print, Tipo Carro e Uso Clínica', async () => {
    const { user } = renderTela();
    const modal = await abrirNovo(user);

    for (const secao of ['Dados do Veículo', 'Valores e Impostos', 'Financiamento/Leasing']) {
      expect(within(modal).getByRole('group', { name: secao })).toBeVisible();
    }
    for (const rotulo of [
      'Descrição',
      'Placa',
      'RENAVAM',
      'Chassi',
      'Ano',
      'Cor',
      'Valor Compra (R$)',
      'Data Compra',
      'IPVA Anual (R$)',
      'Licenciamento (R$)',
      'Seguro Anual (R$)',
      'Vencimento Seguro',
      'Banco',
      'Parcela (R$)',
      'Saldo Devedor (R$)',
      'Vencimento Financiamento',
      'Observações',
    ]) {
      expect(within(modal).getByLabelText(rotulo)).toBeVisible();
    }
    expect(within(modal).getByPlaceholderText('Ex: Corolla XEi 2024')).toBeVisible();
    expect(within(modal).getByRole('combobox', { name: 'Tipo' })).toHaveTextContent('Carro');
    expect(within(modal).getByRole('combobox', { name: 'Uso' })).toHaveTextContent('Clínica');

    await user.click(within(modal).getByRole('combobox', { name: 'Tipo' }));
    expect((await screen.findAllByRole('option')).map((o) => o.textContent)).toEqual([
      'Carro',
      'Moto',
      'Utilitário',
    ]);
    await user.keyboard('{Escape}');
    await user.click(within(modal).getByRole('combobox', { name: 'Uso' }));
    expect((await screen.findAllByRole('option')).map((o) => o.textContent)).toEqual([
      'Clínica',
      'Pessoal',
      'Misto',
    ]);
    await user.keyboard('{Escape}');
    expect(within(modal).getByRole('button', { name: 'Cancelar' })).toBeVisible();
    expect(within(modal).getByRole('button', { name: 'Cadastrar' })).toBeVisible();
  });

  it('Novo Veiculo: vazio mostra "Descrição é obrigatória." e não envia', async () => {
    const fetchMock = api();
    const { user } = renderTela(fetchMock);
    const modal = await abrirNovo(user);

    await user.click(within(modal).getByRole('button', { name: 'Cadastrar' }));

    expect(await within(modal).findByText('Descrição é obrigatória.')).toBeVisible();
    expect(posts(fetchMock)).toHaveLength(0);
  });

  it('Novo Veiculo: envia as três seções, fecha o modal e recarrega a lista', async () => {
    let corpo: Corpo = {};
    const fetchMock = api({
      rotas: {
        [API]: (init) => {
          if (init?.method !== 'POST') return pagina(VEICULOS);
          corpo = corpoDe(init);
          return json(veiculo({ id: '00000000-0000-4000-8000-0000000000f3' }), 201);
        },
      },
    });
    const { user } = renderTela(fetchMock);
    const modal = await abrirNovo(user);

    await user.type(within(modal).getByLabelText('Descrição'), 'Fiorino');
    await escolher(user, modal, 'Tipo', 'Utilitário');
    await escolher(user, modal, 'Uso', 'Misto');
    await user.type(within(modal).getByLabelText('Placa'), 'XYZ9K88');
    await user.type(within(modal).getByLabelText('Ano'), '2023');
    await user.type(within(modal).getByLabelText('Valor Compra (R$)'), '9500000');
    await user.type(within(modal).getByLabelText('Vencimento Seguro'), '2027-08-15');
    await user.type(within(modal).getByLabelText('Seguro Anual (R$)'), '390000');
    await user.type(within(modal).getByLabelText('Banco'), 'Banco Teste');
    await user.type(within(modal).getByLabelText('Parcela (R$)'), '220050');
    await user.type(within(modal).getByLabelText('Observações'), 'Equipe');

    await user.click(within(modal).getByRole('button', { name: 'Cadastrar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(corpo).toEqual({
      descricao: 'Fiorino',
      tipo: 'UTILITARIO',
      placa: 'XYZ9K88',
      renavam: null,
      chassi: null,
      ano: 2023,
      cor: null,
      uso: 'MISTO',
      valorCompra: 95_000,
      dataCompra: null,
      ipvaAnual: null,
      licenciamento: null,
      seguroAnual: 3900,
      vencimentoSeguro: '2027-08-15',
      banco: 'Banco Teste',
      financiamentoParcela: 2200.5,
      saldoDevedor: null,
      vencimentoFinanciamento: null,
      observacoes: 'Equipe',
    });
    expect(
      chamadasPara(fetchMock, API).filter(([, i]) => !i?.method || i.method === 'GET'),
    ).toHaveLength(2);
    expect(await screen.findByText('Veículo cadastrado.')).toBeInTheDocument();
  });

  it('menu ⋯ tem Editar e Excluir; Editar abre com os dados e envia PATCH com Salvar', async () => {
    let corpo: Corpo = {};
    const { user } = renderTela(
      api({
        rotas: {
          [`${API}/${ID_2}`]: (init) => {
            corpo = corpoDe(init);
            return json(veiculo({ id: ID_2, descricao: 'Moto Norte' }));
          },
        },
      }),
    );

    await abrirMenu(user, 'Moto Entrega', 'Editar');
    const modal = await screen.findByRole('dialog', { name: 'Editar Veiculo' });
    const descricao = within(modal).getByLabelText('Descrição');
    expect(descricao).toHaveValue('Moto Entrega');
    expect(within(modal).getByRole('combobox', { name: 'Tipo' })).toHaveTextContent('Moto');
    expect(within(modal).getByRole('combobox', { name: 'Uso' })).toHaveTextContent('Misto');
    expect(within(modal).getByLabelText('Data Compra')).toHaveValue('2024-03-10');
    await user.clear(descricao);
    await user.type(descricao, 'Moto Norte');
    await user.click(within(modal).getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(corpo).toMatchObject({
      descricao: 'Moto Norte',
      tipo: 'MOTO',
      uso: 'MISTO',
      dataCompra: '2024-03-10',
      ano: 2024,
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
            return json(veiculo({}));
          },
        },
      }),
    );

    await abrirMenu(user, 'Corolla Clínica', 'Excluir');
    const dialogo = await screen.findByRole('alertdialog', { name: 'Excluir Veículo' });
    expect(dialogo).toHaveTextContent(
      'Tem certeza que deseja excluir o veículo "Corolla Clínica"? Esta ação não pode ser desfeita.',
    );
    await user.click(within(dialogo).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(excluidos).toBe(0);

    await abrirMenu(user, 'Corolla Clínica', 'Excluir');
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Excluir' }),
    );
    await waitFor(() => expect(excluidos).toBe(1));
  });

  it('sem permissão de criar, editar, excluir e exportar, esconde os botões e as ações', async () => {
    const somenteVer = PERMISSOES.filter((p) => p === 'patrimonio-pessoal.veiculos.ver');
    renderTela(api({ usuario: { ...USUARIO_TESTE, permissoes: somenteVer } }));

    await screen.findByText('Corolla Clínica');

    expect(screen.queryByRole('button', { name: 'Novo Veiculo' })).not.toBeInTheDocument();
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

    expect(await screen.findByRole('heading', { name: 'Vehicles' })).toBeInTheDocument();
    await screen.findByText('Corolla Clínica');
    expect(cabecalhos()).toEqual([
      'Description',
      'Plate',
      'Type',
      'Use',
      'Vehicle Tax',
      'Insurance',
      'Loan Installment',
      'Actions',
    ]);
    expect(screen.getByText('Car')).toBeVisible();
    expect(screen.getByPlaceholderText('Search vehicles...')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'New Vehicle' }));
    const modal = await screen.findByRole('dialog', { name: 'New Vehicle' });
    expect(within(modal).getByRole('group', { name: 'Financing/Leasing' })).toBeVisible();
    expect(within(modal).getByLabelText('Purchase Price (R$)')).toBeVisible();
    await user.click(within(modal).getByRole('button', { name: 'Register' }));

    expect(await within(modal).findByText('Description is required.')).toBeVisible();
    expect(posts(fetchMock)).toHaveLength(0);
  });

  it('em espanhol: título e colunas traduzidos', async () => {
    const usuario = {
      ...USUARIO_TESTE,
      preferencias: { ...PREFERENCIAS_PADRAO, idioma: 'es' as const },
    };
    renderTela(api({ usuario }));

    expect(await screen.findByRole('heading', { name: 'Vehículos' })).toBeInTheDocument();
    await screen.findByText('Corolla Clínica');
    expect(cabecalhos()).toEqual([
      'Descripción',
      'Placa',
      'Tipo',
      'Uso',
      'Impuesto Vehicular',
      'Seguro',
      'Cuota Financ.',
      'Acciones',
    ]);
  });
});
