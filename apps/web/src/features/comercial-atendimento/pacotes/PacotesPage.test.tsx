import { type Pacote } from '@torres/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { apiFalsa, chamadasPara, json, renderApp } from '@/test/render-app';

vi.setConfig({ testTimeout: 20_000 });

const API = '/api/comercial-atendimento/pacotes';
const ID_1 = '00000000-0000-4000-8000-0000000000d1';
const ID_2 = '00000000-0000-4000-8000-0000000000d2';
const ID_PACIENTE = '00000000-0000-4000-8000-0000000000b1';
const ID_PROFISSIONAL = '00000000-0000-4000-8000-0000000000c1';
const ID_PRODUTO = '00000000-0000-4000-8000-0000000000a1';
const ID_USO = '00000000-0000-4000-8000-0000000000e1';

function pacote(parcial: Partial<Pacote> = {}): Pacote {
  return {
    id: ID_1,
    pacienteId: ID_PACIENTE,
    cliente: 'Cliente Teste',
    nome: 'Pacote 10 sessões',
    descricao: 'Dez sessões de drenagem',
    valorTotal: '1000',
    dataInicio: '2026-11-01',
    dataVencimento: '2026-12-31',
    profissionalId: ID_PROFISSIONAL,
    profissional: 'Dra. Ana Teste',
    observacoes: 'Sem observações',
    sessoesTotal: 10,
    sessoesUsadas: 1,
    saldo: 9,
    status: 'ATIVO',
    itens: [
      {
        id: '00000000-0000-4000-8000-0000000000f1',
        produtoId: ID_PRODUTO,
        descricao: 'Drenagem',
        quantidade: 10,
        valorUnitario: '100',
        usadas: 1,
      },
    ],
    usos: [
      {
        id: ID_USO,
        profissionalId: ID_PROFISSIONAL,
        profissional: 'Dra. Ana Teste',
        quantidade: 1,
        observacoes: 'Primeira sessão',
        data: '2026-11-05T15:00:00.000Z',
      },
    ],
    ...parcial,
  };
}

const PACOTES = [
  pacote(),
  pacote({
    id: ID_2,
    cliente: 'Outro Cliente',
    nome: 'Pacote vencido',
    descricao: null,
    valorTotal: '250.5',
    dataVencimento: null,
    sessoesTotal: 2,
    sessoesUsadas: 0,
    saldo: 2,
    status: 'VENCIDO',
    usos: [],
  }),
];

const LOOKUP = (id: string, label: string) =>
  json({
    data: [{ id, label, descricao: null }],
    meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
  });

function pagina<T>(data: T[]) {
  return json({ data, meta: { page: 1, pageSize: 10, total: data.length, totalPages: 1 } });
}

function parametros(fetchMock: ReturnType<typeof apiFalsa>, caminho = API) {
  const [url] = chamadasPara(fetchMock, caminho).at(-1) ?? [''];
  return Object.fromEntries(new URL(url, 'http://x').searchParams);
}

const escritas = (fetchMock: ReturnType<typeof apiFalsa>, caminho: string, metodo: string) =>
  chamadasPara(fetchMock, caminho).filter(([, init]) => init?.method === metodo);

function apiPacotes(aoEscrever?: (metodo: string, caminho: string, corpo: unknown) => void) {
  const escrever = (caminho: string) => (init?: RequestInit) => {
    const corpo = init?.body ? JSON.parse(String(init.body)) : undefined;
    aoEscrever?.(init?.method ?? 'GET', caminho, corpo);
    return json(pacote({ sessoesUsadas: 2, saldo: 8 }), init?.method === 'POST' ? 201 : 200);
  };
  return apiFalsa({
    rotas: {
      [API]: (init) => (init?.method === 'POST' ? escrever(API)(init) : pagina(PACOTES)),
      [`${API}/${ID_1}`]: (init) =>
        init?.method ? escrever(`${API}/${ID_1}`)(init) : json(pacote()),
      [`${API}/${ID_1}/usos`]: escrever(`${API}/${ID_1}/usos`),
      [`${API}/${ID_1}/usos/${ID_USO}`]: escrever(`${API}/${ID_1}/usos/${ID_USO}`),
      [`${API}/catalogo`]: () =>
        pagina([{ id: ID_PRODUTO, nome: 'Drenagem', categoria: null, valor: 100 }]),
      '/api/lookups/pacientes': () => LOOKUP(ID_PACIENTE, 'Cliente Teste'),
      '/api/lookups/profissionais': () => LOOKUP(ID_PROFISSIONAL, 'Dra. Ana Teste'),
    },
  });
}

function renderTela(fetchMock = apiPacotes()) {
  return { user: userEvent.setup(), ...renderApp('/pacotes', fetchMock) };
}

describe('Pacotes (/pacotes)', () => {
  it('mostra título, ações, colunas, chips e os valores formatados', async () => {
    renderTela();

    expect(await screen.findByRole('heading', { name: 'Pacotes de Sessões' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Novo Pacote' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Exportar' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Colunas' })).toBeVisible();
    expect(screen.getByPlaceholderText('Buscar pacotes...')).toBeVisible();
    for (const chip of ['Todos', 'Ativo', 'Finalizado', 'Vencido', 'Cancelado']) {
      expect(screen.getByRole('button', { name: chip })).toBeVisible();
    }
    const cabecalhos = within(await screen.findByRole('table')).getAllByRole('columnheader');
    expect(cabecalhos.map((c) => c.textContent)).toEqual([
      'Cliente',
      'Pacote',
      'Sessões',
      'Saldo',
      'Valor',
      'Vencimento',
      'Status',
      'Ações',
    ]);
    const primeira = (await screen.findByText('Cliente Teste')).closest('tr') as HTMLElement;
    expect(within(primeira).getByText('1/10')).toBeVisible();
    expect(within(primeira).getByText('9')).toBeVisible();
    expect(within(primeira).getByText(/1\.000,00/)).toBeVisible();
    expect(within(primeira).getByText('31/12/2026')).toBeVisible();
    expect(within(primeira).getByText('Ativo')).toBeVisible();
    const segunda = screen.getByText('Outro Cliente').closest('tr') as HTMLElement;
    expect(within(segunda).getByText(/250,50/)).toBeVisible();
    expect(within(segunda).getByText('Vencido')).toBeVisible();
  });

  it('chips de status, busca e ordenação chamam a API', async () => {
    const { fetchMock, user } = renderTela();
    await screen.findByText('Cliente Teste');

    for (const [chip, valor] of [
      ['Ativo', 'ativo'],
      ['Finalizado', 'finalizado'],
      ['Vencido', 'vencido'],
      ['Cancelado', 'cancelado'],
    ] as const) {
      await user.click(screen.getByRole('button', { name: chip }));
      await waitFor(() => expect(parametros(fetchMock)).toMatchObject({ status: valor }));
    }
    for (const [coluna, campo] of [
      ['Cliente', 'cliente'],
      ['Pacote', 'nome'],
      ['Valor', 'valor'],
      ['Vencimento', 'vencimento'],
      ['Status', 'status'],
    ] as const) {
      await user.click(screen.getByRole('button', { name: coluna }));
      await waitFor(() => expect(parametros(fetchMock)).toMatchObject({ sort: `${campo}:asc` }));
    }
    await user.type(screen.getByPlaceholderText('Buscar pacotes...'), 'ana');
    await waitFor(() => expect(parametros(fetchMock)).toMatchObject({ search: 'ana' }));
  });

  it('Novo Pacote: mostra os campos do modal', async () => {
    const { user } = renderTela();
    await screen.findByText('Cliente Teste');

    await user.click(screen.getByRole('button', { name: 'Novo Pacote' }));
    const modal = await screen.findByRole('dialog', { name: 'Novo Pacote' });

    for (const rotulo of [
      'Cliente',
      'Nome do Pacote',
      'Descrição',
      'Valor Total do Pacote (R$)',
      'Data Início',
      'Data Vencimento',
      'Profissional',
      'Observações',
    ]) {
      expect(within(modal).getByText(rotulo)).toBeVisible();
    }
    expect(within(modal).getByText('Itens / Procedimentos')).toBeVisible();
    expect(
      within(modal).getByText('Nenhum item adicionado. Busque um produto acima.'),
    ).toBeVisible();
    expect(within(modal).getByRole('button', { name: 'Cancelar' })).toBeVisible();
    expect(within(modal).getByRole('button', { name: 'Cadastrar' })).toBeVisible();
  });

  it('Cadastrar com os campos vazios mostra as mensagens e não envia', async () => {
    const { fetchMock, user } = renderTela();
    await screen.findByText('Cliente Teste');

    await user.click(screen.getByRole('button', { name: 'Novo Pacote' }));
    const modal = await screen.findByRole('dialog', { name: 'Novo Pacote' });
    await user.click(within(modal).getByRole('button', { name: 'Cadastrar' }));

    expect(await within(modal).findByText('Cliente é obrigatório.')).toBeVisible();
    expect(within(modal).getByText('Nome do Pacote é obrigatório.')).toBeVisible();
    expect(within(modal).getByRole('alert')).toHaveTextContent(
      'Itens / Procedimentos é obrigatório.',
    );
    expect(escritas(fetchMock, API, 'POST')).toHaveLength(0);
  });

  it('busca o produto, soma a quantidade do repetido, calcula a soma e envia só produto e quantidade', async () => {
    const corpos: unknown[] = [];
    const { user } = renderTela(
      apiPacotes((metodo, _c, corpo) => metodo === 'POST' && corpos.push(corpo)),
    );
    await screen.findByText('Cliente Teste');

    await user.click(screen.getByRole('button', { name: 'Novo Pacote' }));
    const modal = await screen.findByRole('dialog', { name: 'Novo Pacote' });

    await user.click(within(modal).getByRole('combobox', { name: 'Cliente' }));
    await user.click(await screen.findByRole('option', { name: /Cliente Teste/ }));
    await user.type(within(modal).getByLabelText('Nome do Pacote'), '  Pacote novo ');
    const busca = within(modal).getByLabelText('Buscar produto/procedimento');
    await user.type(busca, 'dre');
    await user.click(await within(modal).findByRole('button', { name: /Drenagem/ }));
    await user.type(busca, 'dre');
    await user.click(await within(modal).findByRole('button', { name: /Drenagem/ }));

    expect(within(modal).getByLabelText('Quantidade do item 1')).toHaveValue(2);
    expect(within(modal).getByText(/Soma dos itens/)).toHaveTextContent(/200,00/);

    await user.click(within(modal).getByRole('combobox', { name: 'Profissional' }));
    await user.click(await screen.findByRole('option', { name: /Dra. Ana Teste/ }));
    await user.click(within(modal).getByRole('button', { name: 'Cadastrar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(corpos).toEqual([
      {
        pacienteId: ID_PACIENTE,
        nome: 'Pacote novo',
        descricao: null,
        itens: [{ produtoId: ID_PRODUTO, quantidade: 2 }],
        valorTotal: null,
        dataInicio: null,
        dataVencimento: null,
        profissionalId: ID_PROFISSIONAL,
        observacoes: null,
      },
    ]);
  });

  it('remove um item pela lixeira', async () => {
    const { user } = renderTela();
    await screen.findByText('Cliente Teste');
    await user.click(screen.getByRole('button', { name: 'Novo Pacote' }));
    const modal = await screen.findByRole('dialog', { name: 'Novo Pacote' });

    await user.type(within(modal).getByLabelText('Buscar produto/procedimento'), 'dre');
    await user.click(await within(modal).findByRole('button', { name: /Drenagem/ }));
    await user.click(within(modal).getByRole('button', { name: 'Remover item 1' }));

    expect(
      within(modal).getByText('Nenhum item adicionado. Busque um produto acima.'),
    ).toBeVisible();
  });

  it('clicar na linha abre o detalhe com progresso, itens e histórico', async () => {
    const { user } = renderTela();
    await user.click(await screen.findByText('Cliente Teste'));

    const detalhe = await screen.findByRole('dialog', { name: 'Pacote 10 sessões' });
    expect(within(detalhe).getByText('Dez sessões de drenagem', { selector: 'dd' })).toBeVisible();
    expect(within(detalhe).getByText('1 / 10 sessões')).toBeVisible();
    expect(within(detalhe).getByText('10% utilizado')).toBeVisible();
    expect(within(detalhe).getByText('Saldo: 9 sessão(ões)')).toBeVisible();
    expect(within(detalhe).getByText('Drenagem')).toBeVisible();
    expect(within(detalhe).getByText('9 restante(s)')).toBeVisible();
    expect(within(detalhe).getByText('Primeira sessão')).toBeVisible();
    for (const botao of ['Usar Sessão', 'Editar']) {
      expect(within(detalhe).getByRole('button', { name: botao })).toBeVisible();
    }
    // "Fechar" do rodapé e o X do diálogo têm o mesmo nome acessível.
    expect(within(detalhe).getAllByRole('button', { name: 'Fechar' })).toHaveLength(2);
    await user.click(within(detalhe).getAllByRole('button', { name: 'Fechar' })[0] as HTMLElement);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('menu de ações tem Visualizar, Editar e Excluir', async () => {
    const { user } = renderTela();
    const linha = (await screen.findByText('Cliente Teste')).closest('tr') as HTMLElement;

    await user.click(within(linha).getByRole('button', { name: /ações|acoes/i }));
    for (const item of ['Visualizar', 'Editar', 'Excluir']) {
      expect(await screen.findByRole('menuitem', { name: item })).toBeVisible();
    }
  });

  it('Editar abre o modal preenchido e envia PATCH', async () => {
    const corpos: unknown[] = [];
    const { user } = renderTela(apiPacotes((m, _c, corpo) => m === 'PATCH' && corpos.push(corpo)));
    const linha = (await screen.findByText('Cliente Teste')).closest('tr') as HTMLElement;
    await user.click(within(linha).getByRole('button', { name: /ações|acoes/i }));
    await user.click(await screen.findByRole('menuitem', { name: 'Editar' }));

    const modal = await screen.findByRole('dialog', { name: 'Editar Pacote' });
    expect(within(modal).getByLabelText('Nome do Pacote')).toHaveValue('Pacote 10 sessões');
    expect(within(modal).getByLabelText('Quantidade do item 1')).toHaveValue(10);
    await user.clear(within(modal).getByLabelText('Nome do Pacote'));
    await user.type(within(modal).getByLabelText('Nome do Pacote'), 'Renomeado');
    await user.click(within(modal).getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(corpos).toMatchObject([
      { nome: 'Renomeado', itens: [{ produtoId: ID_PRODUTO, quantidade: 10 }], valorTotal: null },
    ]);
  });

  it('Usar Sessão: exige o profissional e registra o uso', async () => {
    const corpos: unknown[] = [];
    const { fetchMock, user } = renderTela(
      apiPacotes((m, c, corpo) => m === 'POST' && c.endsWith('/usos') && corpos.push(corpo)),
    );
    await user.click(await screen.findByText('Cliente Teste'));
    const detalhe = await screen.findByRole('dialog', { name: 'Pacote 10 sessões' });

    await user.click(within(detalhe).getByRole('button', { name: 'Usar Sessão' }));
    const uso = await screen.findByRole('dialog', { name: 'Registrar Uso de Sessão' });
    expect(within(uso).getByLabelText('Quantidade')).toHaveValue(1);
    expect(within(uso).getByLabelText('Observações')).toBeVisible();

    await user.click(within(uso).getByRole('button', { name: 'Confirmar Uso' }));
    expect(await within(uso).findByText('Profissional é obrigatório.')).toBeVisible();
    expect(escritas(fetchMock, `${API}/${ID_1}/usos`, 'POST')).toHaveLength(0);

    await user.click(within(uso).getByRole('combobox', { name: 'Profissional' }));
    await user.click(await screen.findByRole('option', { name: /Dra. Ana Teste/ }));
    await user.type(within(uso).getByLabelText('Observações'), 'Tudo certo');
    await user.click(within(uso).getByRole('button', { name: 'Confirmar Uso' }));

    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Registrar Uso de Sessão' }),
      ).not.toBeInTheDocument(),
    );
    expect(corpos).toEqual([
      { profissionalId: ID_PROFISSIONAL, quantidade: 1, observacoes: 'Tudo certo' },
    ]);
    // O detalhe passa a mostrar o saldo devolvido pela API.
    expect(await screen.findByText('Saldo: 8 sessão(ões)')).toBeVisible();
  });

  it('remove um uso do histórico depois de confirmar', async () => {
    const { fetchMock, user } = renderTela();
    await user.click(await screen.findByText('Cliente Teste'));
    const detalhe = await screen.findByRole('dialog', { name: 'Pacote 10 sessões' });

    await user.click(within(detalhe).getByRole('button', { name: 'Remover uso de sessão' }));
    const confirmar = await screen.findByRole('alertdialog');
    expect(escritas(fetchMock, `${API}/${ID_1}/usos/${ID_USO}`, 'DELETE')).toHaveLength(0);
    await user.click(within(confirmar).getByRole('button', { name: 'Remover' }));

    await waitFor(() =>
      expect(escritas(fetchMock, `${API}/${ID_1}/usos/${ID_USO}`, 'DELETE')).toHaveLength(1),
    );
  });

  it('Excluir pede confirmação com o texto do sistema atual e só então chama a API', async () => {
    const { fetchMock, user } = renderTela();
    const linha = (await screen.findByText('Cliente Teste')).closest('tr') as HTMLElement;
    await user.click(within(linha).getByRole('button', { name: /ações|acoes/i }));
    await user.click(await screen.findByRole('menuitem', { name: 'Excluir' }));

    const confirmar = await screen.findByRole('alertdialog', { name: 'Excluir Pacote' });
    expect(confirmar).toHaveTextContent(
      'Tem certeza que deseja excluir o pacote "Pacote 10 sessões" do cliente Cliente Teste? Esta ação não pode ser desfeita.',
    );
    expect(escritas(fetchMock, `${API}/${ID_1}`, 'DELETE')).toHaveLength(0);
    await user.click(within(confirmar).getByRole('button', { name: 'Excluir' }));

    await waitFor(() => expect(escritas(fetchMock, `${API}/${ID_1}`, 'DELETE')).toHaveLength(1));
  });
});
