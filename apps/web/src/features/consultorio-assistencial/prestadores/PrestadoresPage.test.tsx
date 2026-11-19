import { PERMISSOES, type Prestador } from '@torres/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { apiFalsa, chamadasPara, json, renderApp, USUARIO_TESTE } from '@/test/render-app';

const API = '/api/consultorio-assistencial/prestadores';
const ID_1 = '00000000-0000-4000-8000-0000000000d1';
const ID_2 = '00000000-0000-4000-8000-0000000000d2';

function prestador(parcial: Partial<Prestador>): Prestador {
  return {
    id: ID_1,
    nome: 'Alfa Manutenção',
    nomeFantasia: null,
    tipoPessoa: 'FISICA',
    documento: null,
    telefone: '65999998888',
    email: null,
    status: 'ATIVO',
    endereco: null,
    categoria: 'AR_CONDICIONADO',
    descricaoServico: null,
    atendeUrgencia: true,
    atendeFimSemana: false,
    formaPagamento: 'PIX',
    chavePix: 'alfa@teste.example',
    valorHora: 80.5,
    valorDiaria: null,
    emiteNotaFiscal: false,
    notaQualidade: 4,
    notaPontualidade: 3,
    avaliacaoPreco: 'JUSTO',
    observacoes: null,
    createdAt: '2026-11-18T12:00:00.000Z',
    updatedAt: '2026-11-18T12:00:00.000Z',
    ...parcial,
  };
}

const PRESTADORES = [
  prestador({}),
  prestador({
    id: ID_2,
    nome: 'Beta Pinturas',
    telefone: null,
    categoria: 'PINTURA',
    atendeUrgencia: false,
    notaQualidade: 2,
    status: 'BLOQUEADO',
    formaPagamento: 'BOLETO',
    chavePix: null,
  }),
];

function pagina(data: Prestador[]) {
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
  return apiFalsa({ ...rotas, rotas: { [API]: () => pagina(PRESTADORES), ...rotas.rotas } });
}

function renderTela(fetchMock = api()) {
  return { user: userEvent.setup(), ...renderApp('/prestadores', fetchMock) };
}

async function abrirMenu(user: Usuario, linha: string, item: string) {
  const tr = (await screen.findByText(linha)).closest('tr') as HTMLElement;
  await user.click(within(tr).getByRole('button', { name: 'Ações' }));
  await user.click(await screen.findByRole('menuitem', { name: item }));
}

async function abrirNovo(user: Usuario) {
  await screen.findByText('Alfa Manutenção');
  await user.click(screen.getByRole('button', { name: 'Novo Prestador' }));
  return screen.findByRole('dialog', { name: 'Novo Prestador' });
}

async function escolher(user: Usuario, modal: HTMLElement, campo: string, opcao: string) {
  await user.click(within(modal).getByRole('combobox', { name: campo }));
  await user.click(await screen.findByRole('option', { name: opcao }));
}

describe('Prestadores (/prestadores)', { timeout: 20_000 }, () => {
  it('mostra título, filtros, chips, ações e a grid com as colunas do inventário', async () => {
    const fetchMock = api();
    renderTela(fetchMock);

    expect(
      await screen.findByRole('heading', { name: 'Prestadores de Serviço' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Controle de fornecedores de manutenção')).toBeVisible();
    const cabecalhos = within(await screen.findByRole('table')).getAllByRole('columnheader');
    expect(cabecalhos.map((c) => c.textContent)).toEqual([
      'Nome',
      'Categoria',
      'Telefone',
      'Urgência',
      'Avaliação',
      'Status',
      'Ações',
    ]);
    for (const nome of ['Todos', 'Ativo', 'Inativo', 'Bloqueado']) {
      expect(screen.getByRole('button', { name: nome })).toBeVisible();
    }
    expect(screen.getByPlaceholderText('Buscar prestador...')).toBeVisible();
    expect(screen.getByPlaceholderText('Buscar prestadores...')).toBeVisible();
    expect(screen.getByRole('combobox', { name: 'Categoria' })).toHaveTextContent(
      'Todas categorias',
    );
    expect(screen.getByRole('button', { name: 'Novo Prestador' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Exportar' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Colunas' })).toBeVisible();
    expect(parametros(fetchMock)).toMatchObject({ page: '1', pageSize: '10' });
  });

  it('mostra categoria, telefone, urgência, avaliação e status com rótulos', async () => {
    renderTela();

    const alfa = (await screen.findByText('Alfa Manutenção')).closest('tr') as HTMLElement;
    expect(within(alfa).getByText('Ar Condicionado')).toBeVisible();
    expect(within(alfa).getByText('(65) 99999-8888')).toBeVisible();
    expect(within(alfa).getByText('Sim')).toBeVisible();
    expect(within(alfa).getByText('4 - Bom')).toBeVisible();
    expect(within(alfa).getByText('Ativo')).toBeVisible();

    const beta = screen.getByText('Beta Pinturas').closest('tr') as HTMLElement;
    expect(within(beta).getByText('-')).toBeVisible();
    expect(within(beta).getByText('Não')).toBeVisible();
    expect(within(beta).getByText('2 - Ruim')).toBeVisible();
    expect(within(beta).getByText('Bloqueado')).toBeVisible();
  });

  it('chips de status e categoria filtram na API', async () => {
    const fetchMock = api();
    const { user } = renderTela(fetchMock);
    await screen.findByText('Alfa Manutenção');

    for (const [chip, status] of [
      ['Ativo', 'ATIVO'],
      ['Inativo', 'INATIVO'],
      ['Bloqueado', 'BLOQUEADO'],
    ]) {
      await user.click(screen.getByRole('button', { name: chip }));
      await waitFor(() => expect(parametros(fetchMock)).toMatchObject({ status }));
    }

    await user.click(screen.getByRole('combobox', { name: 'Categoria' }));
    const opcoes = await screen.findAllByRole('option');
    expect(opcoes.map((o) => o.textContent)).toEqual([
      'Todas categorias',
      'Elétrica',
      'Hidráulica',
      'Pintura',
      'Ar Condicionado',
      'Jardinagem',
      'Serralheria',
      'Marcenaria',
      'Gesso',
      'Dedetização',
      'Limpeza Caixa',
      'TI',
      'Refrigeração',
      'Outros',
    ]);
    await user.click(screen.getByRole('option', { name: 'Gesso' }));
    await waitFor(() =>
      expect(parametros(fetchMock)).toMatchObject({ status: 'BLOQUEADO', categoria: 'GESSO' }),
    );
  });

  it('as duas buscas enviam nome e search juntos', async () => {
    const fetchMock = api();
    const { user } = renderTela(fetchMock);
    await screen.findByText('Alfa Manutenção');

    await user.type(screen.getByPlaceholderText('Buscar prestador...'), 'alfa');
    await waitFor(() => expect(parametros(fetchMock)).toMatchObject({ nome: 'alfa' }));

    await user.type(screen.getByPlaceholderText('Buscar prestadores...'), '6599');
    await waitFor(() =>
      expect(parametros(fetchMock)).toMatchObject({ nome: 'alfa', search: '6599' }),
    );
  });

  it('ordenar por cada coluna chama a API com o sort', async () => {
    const fetchMock = api();
    const { user } = renderTela(fetchMock);
    await screen.findByText('Alfa Manutenção');

    const colunas = {
      Nome: 'nome',
      Categoria: 'categoria',
      Telefone: 'telefone',
      Urgência: 'urgencia',
      Avaliação: 'avaliacao',
      Status: 'status',
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
          json({ data: PRESTADORES, meta: { page: 1, pageSize: 10, total: 12, totalPages: 2 } }),
      },
    });
    const { user } = renderTela(fetchMock);
    await screen.findByText('Alfa Manutenção');

    await user.click(screen.getByRole('button', { name: 'Ir para próxima página' }));

    await waitFor(() => expect(parametros(fetchMock)).toMatchObject({ page: '2' }));
  });

  it('Colunas permite ocultar uma coluna', async () => {
    const { user } = renderTela();
    await screen.findByText('Alfa Manutenção');

    await user.click(screen.getByRole('button', { name: 'Colunas' }));
    await user.click(await screen.findByRole('menuitemcheckbox', { name: 'Avaliação' }));
    await user.keyboard('{Escape}');

    await waitFor(() =>
      expect(
        within(screen.getByRole('table'))
          .getAllByRole('columnheader')
          .map((c) => c.textContent),
      ).not.toContain('Avaliação'),
    );
  }, 15_000);

  it('Novo Prestador: quatro abas com os campos e padrões dos prints', async () => {
    const { user } = renderTela();
    const modal = await abrirNovo(user);

    const abas = within(modal).getAllByRole('tab');
    expect(abas.map((a) => a.textContent)).toEqual(['Dados', 'Serviço', 'Comercial', 'Avaliação']);

    for (const rotulo of ['Nome', 'Nome Fantasia', 'CPF/CNPJ', 'Telefone', 'Email', 'Endereço']) {
      expect(within(modal).getByLabelText(rotulo)).toBeVisible();
    }
    expect(within(modal).getByRole('combobox', { name: 'Tipo Pessoa' })).toHaveTextContent(
      'Pessoa Física',
    );
    expect(within(modal).getByRole('combobox', { name: 'Status' })).toHaveTextContent('Ativo');

    await user.click(within(modal).getByRole('tab', { name: 'Serviço' }));
    expect(within(modal).getByRole('combobox', { name: 'Categoria' })).toHaveTextContent(
      'Elétrica',
    );
    expect(within(modal).getByLabelText('Descrição do Serviço')).toBeVisible();
    expect(within(modal).getByRole('switch', { name: 'Atende Urgência' })).not.toBeChecked();
    expect(within(modal).getByRole('switch', { name: 'Atende Fim de Semana' })).not.toBeChecked();
    expect(within(modal).queryByLabelText('Nome Fantasia')).not.toBeVisible();

    await user.click(within(modal).getByRole('tab', { name: 'Comercial' }));
    expect(within(modal).getByRole('combobox', { name: 'Forma de Pagamento' })).toHaveTextContent(
      'PIX',
    );
    expect(within(modal).getByLabelText('Chave PIX')).toBeVisible();
    expect(within(modal).getByLabelText('Valor/Hora (R$)')).toBeVisible();
    expect(within(modal).getByLabelText('Valor/Diária (R$)')).toBeVisible();
    expect(within(modal).getByRole('switch', { name: 'Emite Nota Fiscal' })).not.toBeChecked();

    await user.click(within(modal).getByRole('tab', { name: 'Avaliação' }));
    expect(
      within(modal).getByRole('combobox', { name: 'Qualidade do Serviço (1-5)' }),
    ).toHaveTextContent('3 - Regular');
    expect(within(modal).getByRole('combobox', { name: 'Pontualidade (1-5)' })).toHaveTextContent(
      '3 - Regular',
    );
    expect(within(modal).getByRole('combobox', { name: 'Avaliação de Preço' })).toHaveTextContent(
      'Justo',
    );
    expect(within(modal).getByLabelText('Observações')).toBeVisible();
    expect(within(modal).getByRole('button', { name: 'Cancelar' })).toBeVisible();
    expect(within(modal).getByRole('button', { name: 'Cadastrar' })).toBeVisible();
  });

  it('Chave PIX só aparece com a forma de pagamento PIX', async () => {
    const { user } = renderTela();
    const modal = await abrirNovo(user);
    await user.click(within(modal).getByRole('tab', { name: 'Comercial' }));

    await escolher(user, modal, 'Forma de Pagamento', 'Boleto');

    expect(within(modal).queryByLabelText('Chave PIX')).not.toBeInTheDocument();
  });

  it('Novo Prestador: vazio mostra "Nome é obrigatório." na aba Dados e não envia', async () => {
    const fetchMock = api();
    const { user } = renderTela(fetchMock);
    const modal = await abrirNovo(user);
    await user.click(within(modal).getByRole('tab', { name: 'Avaliação' }));

    await user.click(within(modal).getByRole('button', { name: 'Cadastrar' }));

    expect(await within(modal).findByText('Nome é obrigatório.')).toBeVisible();
    expect(within(modal).getByRole('tab', { name: 'Dados' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(posts(fetchMock)).toHaveLength(0);
  });

  it('Novo Prestador: CPF/CNPJ com dígitos errados mostra "CNPJ inválido" e não envia', async () => {
    const fetchMock = api();
    const { user } = renderTela(fetchMock);
    const modal = await abrirNovo(user);
    await user.type(within(modal).getByLabelText('Nome'), 'Gama');
    await user.type(within(modal).getByLabelText('CPF/CNPJ'), '11444777000162');
    await user.click(within(modal).getByRole('button', { name: 'Cadastrar' }));

    expect(await within(modal).findByText('CNPJ inválido')).toBeVisible();
    expect(posts(fetchMock)).toHaveLength(0);
  });

  it('Novo Prestador: envia as quatro abas, fecha o modal e recarrega a lista', async () => {
    let corpo: Corpo = {};
    const fetchMock = api({
      rotas: {
        [API]: (init) => {
          if (init?.method !== 'POST') return pagina(PRESTADORES);
          corpo = corpoDe(init);
          return json(prestador({ id: '00000000-0000-4000-8000-0000000000d3', nome: 'Gama' }), 201);
        },
      },
    });
    const { user } = renderTela(fetchMock);
    const modal = await abrirNovo(user);

    await user.type(within(modal).getByLabelText('Nome'), 'Gama');
    await user.type(within(modal).getByLabelText('Telefone'), '65999998888');
    await escolher(user, modal, 'Tipo Pessoa', 'Pessoa Jurídica');
    await escolher(user, modal, 'Status', 'Bloqueado');

    await user.click(within(modal).getByRole('tab', { name: 'Serviço' }));
    await escolher(user, modal, 'Categoria', 'Jardinagem');
    await user.click(within(modal).getByRole('switch', { name: 'Atende Urgência' }));

    await user.click(within(modal).getByRole('tab', { name: 'Comercial' }));
    await user.type(within(modal).getByLabelText('Chave PIX'), 'gama@teste.example');
    await user.click(within(modal).getByRole('switch', { name: 'Emite Nota Fiscal' }));

    await user.click(within(modal).getByRole('tab', { name: 'Avaliação' }));
    await escolher(user, modal, 'Qualidade do Serviço (1-5)', '5 - Ótimo');
    await escolher(user, modal, 'Avaliação de Preço', 'Caro');

    await user.click(within(modal).getByRole('button', { name: 'Cadastrar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(corpo).toMatchObject({
      nome: 'Gama',
      telefone: '65999998888',
      tipoPessoa: 'JURIDICA',
      status: 'BLOQUEADO',
      categoria: 'JARDINAGEM',
      atendeUrgencia: true,
      atendeFimSemana: false,
      formaPagamento: 'PIX',
      chavePix: 'gama@teste.example',
      emiteNotaFiscal: true,
      notaQualidade: 5,
      notaPontualidade: 3,
      avaliacaoPreco: 'CARO',
      email: null,
    });
    expect(
      chamadasPara(fetchMock, API).filter(([, i]) => !i?.method || i.method === 'GET'),
    ).toHaveLength(2);
  });

  it('menu ⋯ tem Editar e Excluir; Editar abre com os dados e envia PATCH com Salvar', async () => {
    let corpo: Corpo = {};
    const { user } = renderTela(
      api({
        rotas: {
          [`${API}/${ID_2}`]: (init) => {
            corpo = corpoDe(init);
            return json(prestador({ id: ID_2, nome: 'Beta Ltda' }));
          },
        },
      }),
    );

    await abrirMenu(user, 'Beta Pinturas', 'Editar');
    const modal = await screen.findByRole('dialog', { name: 'Editar Prestador' });
    const nome = within(modal).getByLabelText('Nome');
    expect(nome).toHaveValue('Beta Pinturas');
    expect(within(modal).getByRole('combobox', { name: 'Status' })).toHaveTextContent('Bloqueado');
    await user.click(within(modal).getByRole('tab', { name: 'Avaliação' }));
    expect(
      within(modal).getByRole('combobox', { name: 'Qualidade do Serviço (1-5)' }),
    ).toHaveTextContent('2 - Ruim');
    await user.click(within(modal).getByRole('tab', { name: 'Dados' }));
    await user.clear(nome);
    await user.type(nome, 'Beta Ltda');
    await user.click(within(modal).getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(corpo).toMatchObject({
      nome: 'Beta Ltda',
      categoria: 'PINTURA',
      status: 'BLOQUEADO',
      formaPagamento: 'BOLETO',
      chavePix: null,
      notaQualidade: 2,
    });
  });

  it('Excluir: confirma antes e envia DELETE; Cancelar não exclui', async () => {
    let excluidos = 0;
    const { user } = renderTela(
      api({
        rotas: {
          [`${API}/${ID_1}`]: () => {
            excluidos += 1;
            return json(prestador({}));
          },
        },
      }),
    );

    await abrirMenu(user, 'Alfa Manutenção', 'Excluir');
    const dialogo = await screen.findByRole('alertdialog', { name: 'Excluir Prestador' });
    expect(dialogo).toHaveTextContent(
      'Tem certeza que deseja excluir o prestador "Alfa Manutenção"? Esta ação não pode ser desfeita.',
    );
    await user.click(within(dialogo).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(excluidos).toBe(0);

    await abrirMenu(user, 'Alfa Manutenção', 'Excluir');
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Excluir' }),
    );
    await waitFor(() => expect(excluidos).toBe(1));
  });

  it('sem permissão de criar, editar, excluir e exportar, esconde os botões e as ações', async () => {
    const somenteVer = PERMISSOES.filter((p) => p === 'consultorio-assistencial.prestadores.ver');
    renderTela(api({ usuario: { ...USUARIO_TESTE, permissoes: somenteVer } }));

    await screen.findByText('Alfa Manutenção');

    expect(screen.queryByRole('button', { name: 'Novo Prestador' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Exportar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ações' })).not.toBeInTheDocument();
  });
});
