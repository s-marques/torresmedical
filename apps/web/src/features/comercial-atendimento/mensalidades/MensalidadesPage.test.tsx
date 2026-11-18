import { type Mensalidade } from '@torres/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { apiFalsa, chamadasPara, json, renderApp } from '@/test/render-app';

vi.setConfig({ testTimeout: 20_000 });

const API = '/api/comercial-atendimento/mensalidades';
const ID_1 = '00000000-0000-4000-8000-0000000000d1';
const ID_2 = '00000000-0000-4000-8000-0000000000d2';
const ID_3 = '00000000-0000-4000-8000-0000000000d3';
const ID_PACIENTE = '00000000-0000-4000-8000-0000000000b1';
const ID_FORMA = '00000000-0000-4000-8000-0000000000c1';

function mensalidade(parcial: Partial<Mensalidade> = {}): Mensalidade {
  return {
    id: ID_1,
    pacienteId: ID_PACIENTE,
    cliente: 'Cliente Teste',
    descricao: 'Plano mensal fisioterapia',
    valor: '1160',
    diaVencimento: 10,
    formaPagamentoId: ID_FORMA,
    dataInicio: '2026-11-01',
    dataFim: '2027-10-31',
    observacoes: null,
    status: 'ATIVO',
    ...parcial,
  };
}

const MENSALIDADES = [
  mensalidade(),
  mensalidade({
    id: ID_2,
    cliente: 'Outro Cliente',
    descricao: 'Plano pausado',
    valor: '250.5',
    dataFim: null,
    status: 'PAUSADO',
  }),
  mensalidade({ id: ID_3, cliente: 'Cliente Cancelado', status: 'CANCELADO' }),
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

type AoEscrever = (metodo: string, caminho: string, corpo: unknown) => void;

function apiMensalidades(aoEscrever?: AoEscrever) {
  const escrever = (caminho: string, resposta: unknown) => (init?: RequestInit) => {
    const corpo = init?.body ? JSON.parse(String(init.body)) : undefined;
    aoEscrever?.(init?.method ?? 'GET', caminho, corpo);
    return json(resposta, init?.method === 'POST' && caminho === API ? 201 : 200);
  };
  return apiFalsa({
    rotas: {
      [API]: (init) =>
        init?.method === 'POST' ? escrever(API, mensalidade())(init) : pagina(MENSALIDADES),
      [`${API}/${ID_1}`]: escrever(`${API}/${ID_1}`, mensalidade()),
      [`${API}/${ID_1}/status`]: (init) => {
        const corpo = JSON.parse(String(init?.body ?? '{}')) as { status: Mensalidade['status'] };
        return escrever(`${API}/${ID_1}/status`, mensalidade({ status: corpo.status }))(init);
      },
      [`${API}/${ID_2}/status`]: escrever(`${API}/${ID_2}/status`, mensalidade({ id: ID_2 })),
      [`${API}/gerar-titulos`]: escrever(`${API}/gerar-titulos`, {
        competencia: '2026-11',
        geradas: 3,
        jaExistentes: 2,
      }),
      '/api/lookups/pacientes': () => LOOKUP(ID_PACIENTE, 'Cliente Teste'),
      '/api/lookups/formas-pagamento': () => LOOKUP(ID_FORMA, 'PIX'),
      [`/api/lookups/formas-pagamento/${ID_FORMA}`]: () =>
        json({ id: ID_FORMA, label: 'PIX', descricao: null }),
      [`/api/lookups/pacientes/${ID_PACIENTE}`]: () =>
        json({ id: ID_PACIENTE, label: 'Cliente Teste', descricao: null }),
    },
  });
}

function renderTela(fetchMock = apiMensalidades()) {
  return { user: userEvent.setup(), ...renderApp('/mensalidades', fetchMock) };
}

async function abrirMenu(user: ReturnType<typeof userEvent.setup>, cliente: string) {
  const linha = (await screen.findByText(cliente)).closest('tr') as HTMLElement;
  await user.click(within(linha).getByRole('button', { name: /ações|acoes/i }));
}

describe('Mensalidades (/mensalidades)', () => {
  it('mostra título, ações, abas, colunas e os valores formatados', async () => {
    renderTela();

    expect(await screen.findByRole('heading', { name: 'Mensalidades' })).toBeVisible();
    expect(screen.getByText('Controle de cobranças recorrentes mensais.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Gerar Títulos do Mês' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Nova Mensalidade' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Exportar' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Colunas' })).toBeVisible();
    expect(screen.getByPlaceholderText('Buscar mensalidades...')).toBeVisible();
    for (const aba of ['Todos', 'Ativo', 'Pausado', 'Cancelado']) {
      expect(screen.getByRole('button', { name: aba })).toBeVisible();
    }
    const cabecalhos = within(await screen.findByRole('table')).getAllByRole('columnheader');
    expect(cabecalhos.map((c) => c.textContent)).toEqual([
      'Cliente',
      'Descrição',
      'Valor',
      'Dia Venc.',
      'Início',
      'Fim',
      'Status',
      'Ações',
    ]);
    const primeira = (await screen.findByText('Cliente Teste')).closest('tr') as HTMLElement;
    expect(within(primeira).getByText(/1\.160,00/)).toBeVisible();
    expect(within(primeira).getByText('10')).toBeVisible();
    expect(within(primeira).getByText('01/11/2026')).toBeVisible();
    expect(within(primeira).getByText('31/10/2027')).toBeVisible();
    expect(within(primeira).getByText('Ativo')).toBeVisible();
    const segunda = screen.getByText('Outro Cliente').closest('tr') as HTMLElement;
    expect(within(segunda).getByText(/250,50/)).toBeVisible();
    expect(within(segunda).getByText('Pausado')).toBeVisible();
  });

  it('abas, busca, ordenação e paginação chamam a API', async () => {
    const { fetchMock, user } = renderTela();
    await screen.findByText('Cliente Teste');
    expect(parametros(fetchMock)).toMatchObject({ page: '1', pageSize: '10' });

    for (const aba of ['Ativo', 'Pausado', 'Cancelado']) {
      await user.click(screen.getByRole('button', { name: aba }));
      await waitFor(() =>
        expect(parametros(fetchMock)).toMatchObject({ status: aba.toUpperCase() }),
      );
    }
    for (const [coluna, campo] of [
      ['Cliente', 'cliente'],
      ['Descrição', 'descricao'],
      ['Valor', 'valor'],
      ['Dia Venc.', 'diaVencimento'],
      ['Início', 'dataInicio'],
      ['Fim', 'dataFim'],
      ['Status', 'status'],
    ] as const) {
      await user.click(screen.getByRole('button', { name: coluna }));
      await waitFor(() => expect(parametros(fetchMock)).toMatchObject({ sort: `${campo}:asc` }));
    }
    await user.type(screen.getByPlaceholderText('Buscar mensalidades...'), 'ana');
    await waitFor(() => expect(parametros(fetchMock)).toMatchObject({ search: 'ana' }));
  });

  it('Nova Mensalidade: mostra os campos do print', async () => {
    const { user } = renderTela();
    await screen.findByText('Cliente Teste');

    await user.click(screen.getByRole('button', { name: 'Nova Mensalidade' }));
    const modal = await screen.findByRole('dialog', { name: 'Nova Mensalidade' });
    for (const rotulo of [
      'Cliente',
      'Descrição',
      'Valor (R$)',
      'Dia Vencimento',
      'Forma Pagamento',
      'Data Início',
      'Data Fim',
      'Observações',
    ]) {
      expect(within(modal).getByText(rotulo)).toBeVisible();
    }
    expect(within(modal).getByPlaceholderText('Ex: Plano mensal fisioterapia')).toBeVisible();
    expect(within(modal).getByPlaceholderText('1-28')).toBeVisible();
    expect(within(modal).getByRole('button', { name: 'Cancelar' })).toBeVisible();
    expect(within(modal).getByRole('button', { name: 'Cadastrar' })).toBeVisible();
  });

  it('Cadastrar com os campos vazios mostra as mensagens e não envia', async () => {
    const { fetchMock, user } = renderTela();
    await screen.findByText('Cliente Teste');

    await user.click(screen.getByRole('button', { name: 'Nova Mensalidade' }));
    const modal = await screen.findByRole('dialog', { name: 'Nova Mensalidade' });
    await user.click(within(modal).getByRole('button', { name: 'Cadastrar' }));

    for (const mensagem of [
      'Cliente é obrigatório.',
      'Descrição é obrigatória.',
      'Valor é obrigatório.',
      'Dia de vencimento é obrigatório.',
      'Data de início é obrigatória.',
    ]) {
      expect(await within(modal).findByText(mensagem)).toBeVisible();
    }
    expect(escritas(fetchMock, API, 'POST')).toHaveLength(0);
  });

  it('valida dia de 1 a 28 e data de fim antes do início', async () => {
    const { fetchMock, user } = renderTela();
    await screen.findByText('Cliente Teste');
    await user.click(screen.getByRole('button', { name: 'Nova Mensalidade' }));
    const modal = await screen.findByRole('dialog', { name: 'Nova Mensalidade' });

    await user.click(within(modal).getByRole('combobox', { name: 'Cliente' }));
    await user.click(await screen.findByRole('option', { name: /Cliente Teste/ }));
    await user.type(within(modal).getByLabelText('Descrição'), 'Plano');
    await user.type(within(modal).getByLabelText('Valor (R$)'), '10000');
    const dia = within(modal).getByLabelText('Dia Vencimento');
    await user.type(dia, '29');
    await user.type(within(modal).getByLabelText('Data Início'), '2026-11-01');
    await user.type(within(modal).getByLabelText('Data Fim'), '2026-10-01');
    await user.click(within(modal).getByRole('button', { name: 'Cadastrar' }));
    expect(await within(modal).findByText('Informe um dia de 1 a 28')).toBeVisible();

    await user.clear(dia);
    await user.type(dia, '28');
    await user.click(within(modal).getByRole('button', { name: 'Cadastrar' }));
    expect(
      await within(modal).findByText('A data de fim não pode ser anterior à data de início'),
    ).toBeVisible();
    expect(escritas(fetchMock, API, 'POST')).toHaveLength(0);
  });

  it('preenche e envia o cadastro', async () => {
    const corpos: unknown[] = [];
    const { user } = renderTela(
      apiMensalidades((metodo, caminho, corpo) => {
        if (metodo === 'POST' && caminho === API) corpos.push(corpo);
      }),
    );
    await screen.findByText('Cliente Teste');
    await user.click(screen.getByRole('button', { name: 'Nova Mensalidade' }));
    const modal = await screen.findByRole('dialog', { name: 'Nova Mensalidade' });

    await user.click(within(modal).getByRole('combobox', { name: 'Cliente' }));
    await user.click(await screen.findByRole('option', { name: /Cliente Teste/ }));
    await user.type(within(modal).getByLabelText('Descrição'), ' Plano novo ');
    await user.type(within(modal).getByLabelText('Valor (R$)'), '116000');
    await user.type(within(modal).getByLabelText('Dia Vencimento'), '10');
    await user.click(within(modal).getByRole('combobox', { name: 'Forma Pagamento' }));
    await user.click(await screen.findByRole('option', { name: /PIX/ }));
    await user.type(within(modal).getByLabelText('Data Início'), '2026-11-01');
    await user.click(within(modal).getByRole('button', { name: 'Cadastrar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(corpos).toEqual([
      {
        pacienteId: ID_PACIENTE,
        descricao: 'Plano novo',
        valor: 1160,
        diaVencimento: 10,
        formaPagamentoId: ID_FORMA,
        dataInicio: '2026-11-01',
        dataFim: null,
        observacoes: null,
      },
    ]);
    expect(await screen.findByText('Mensalidade cadastrada.')).toBeVisible();
  });

  it('menu de ações muda conforme o status; cancelada não tem ações', async () => {
    const { user } = renderTela();

    await abrirMenu(user, 'Cliente Teste');
    for (const item of ['Editar', 'Pausar', 'Cancelar']) {
      expect(await screen.findByRole('menuitem', { name: item })).toBeVisible();
    }
    expect(screen.queryByRole('menuitem', { name: 'Reativar' })).not.toBeInTheDocument();
    await user.keyboard('{Escape}');

    await abrirMenu(user, 'Outro Cliente');
    expect(await screen.findByRole('menuitem', { name: 'Reativar' })).toBeVisible();
    expect(screen.queryByRole('menuitem', { name: 'Pausar' })).not.toBeInTheDocument();
    await user.keyboard('{Escape}');

    const cancelada = (await screen.findByText('Cliente Cancelado')).closest('tr') as HTMLElement;
    expect(within(cancelada).queryByRole('button', { name: /ações|acoes/i })).toBeNull();
  });

  it('Editar abre o modal preenchido e envia PATCH', async () => {
    const corpos: unknown[] = [];
    const { user } = renderTela(
      apiMensalidades((metodo, _c, corpo) => metodo === 'PATCH' && corpos.push(corpo)),
    );
    await abrirMenu(user, 'Cliente Teste');
    await user.click(await screen.findByRole('menuitem', { name: 'Editar' }));

    const modal = await screen.findByRole('dialog', { name: 'Editar Mensalidade' });
    expect(within(modal).getByLabelText('Descrição')).toHaveValue('Plano mensal fisioterapia');
    expect(within(modal).getByLabelText('Dia Vencimento')).toHaveValue(10);
    await user.clear(within(modal).getByLabelText('Descrição'));
    await user.type(within(modal).getByLabelText('Descrição'), 'Renomeado');
    await user.click(within(modal).getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(corpos).toMatchObject([
      { descricao: 'Renomeado', valor: 1160, diaVencimento: 10, dataFim: '2027-10-31' },
    ]);
  });

  it('Pausar e Cancelar pedem confirmação e só então chamam a API', async () => {
    const corpos: unknown[] = [];
    const { fetchMock, user } = renderTela(
      apiMensalidades((metodo, caminho, corpo) => {
        if (metodo === 'PATCH' && caminho.endsWith('/status')) corpos.push(corpo);
      }),
    );
    const url = `${API}/${ID_1}/status`;

    await abrirMenu(user, 'Cliente Teste');
    await user.click(await screen.findByRole('menuitem', { name: 'Pausar' }));
    const pausar = await screen.findByRole('alertdialog', { name: 'Pausar Mensalidade' });
    expect(pausar).toHaveTextContent('"Plano mensal fisioterapia" de Cliente Teste.');
    expect(escritas(fetchMock, url, 'PATCH')).toHaveLength(0);
    await user.click(within(pausar).getByRole('button', { name: 'Pausar' }));
    await waitFor(() => expect(escritas(fetchMock, url, 'PATCH')).toHaveLength(1));
    expect(await screen.findByText('Mensalidade pausada.')).toBeVisible();

    await abrirMenu(user, 'Cliente Teste');
    await user.click(await screen.findByRole('menuitem', { name: 'Cancelar' }));
    const cancelar = await screen.findByRole('alertdialog', { name: 'Cancelar Mensalidade' });
    expect(cancelar).toHaveTextContent('não pode ser reativada');
    await user.click(within(cancelar).getByRole('button', { name: 'Cancelar mensalidade' }));
    await waitFor(() => expect(escritas(fetchMock, url, 'PATCH')).toHaveLength(2));

    expect(corpos).toEqual([{ status: 'PAUSADO' }, { status: 'CANCELADO' }]);
  });

  it('Reativar envia ATIVO depois de confirmar', async () => {
    const corpos: unknown[] = [];
    const { user } = renderTela(
      apiMensalidades((metodo, caminho, corpo) => {
        if (metodo === 'PATCH' && caminho.endsWith('/status')) corpos.push(corpo);
      }),
    );
    await abrirMenu(user, 'Outro Cliente');
    await user.click(await screen.findByRole('menuitem', { name: 'Reativar' }));
    const reativar = await screen.findByRole('alertdialog', { name: 'Reativar Mensalidade' });
    await user.click(within(reativar).getByRole('button', { name: 'Reativar' }));

    await waitFor(() => expect(corpos).toEqual([{ status: 'ATIVO' }]));
  });

  it('Gerar Títulos do Mês: abre com mês e ano atuais, envia a competência e mostra o resumo', async () => {
    const corpos: unknown[] = [];
    const { user } = renderTela(
      apiMensalidades((metodo, caminho, corpo) => {
        if (caminho.endsWith('/gerar-titulos')) corpos.push(corpo);
      }),
    );
    await screen.findByText('Cliente Teste');

    await user.click(screen.getByRole('button', { name: 'Gerar Títulos do Mês' }));
    const modal = await screen.findByRole('dialog', { name: 'Gerar Títulos do Mês' });
    expect(modal).toHaveTextContent(
      'Selecione o mês e ano para gerar os títulos a receber das mensalidades ativas.',
    );
    const hoje = new Date();
    expect(within(modal).getByRole('combobox', { name: 'Ano' })).toHaveTextContent(
      String(hoje.getFullYear()),
    );
    await user.click(within(modal).getByRole('button', { name: 'Gerar Títulos' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const competencia = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
    expect(corpos).toEqual([{ competencia }]);
    expect(
      await screen.findByText(
        '3 título(s) gerado(s) para 11/2026; 2 mensalidade(s) já tinham título no mês.',
      ),
    ).toBeVisible();
  });

  it('Gerar Títulos do Mês: permite escolher outro mês e Cancelar fecha sem enviar', async () => {
    const { fetchMock, user } = renderTela();
    await screen.findByText('Cliente Teste');

    await user.click(screen.getByRole('button', { name: 'Gerar Títulos do Mês' }));
    let modal = await screen.findByRole('dialog', { name: 'Gerar Títulos do Mês' });
    await user.click(within(modal).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(escritas(fetchMock, `${API}/gerar-titulos`, 'POST')).toHaveLength(0);

    await user.click(screen.getByRole('button', { name: 'Gerar Títulos do Mês' }));
    modal = await screen.findByRole('dialog', { name: 'Gerar Títulos do Mês' });
    await user.click(within(modal).getByRole('combobox', { name: 'Mês' }));
    await user.click(await screen.findByRole('option', { name: 'Dezembro' }));
    await user.click(within(modal).getByRole('button', { name: 'Gerar Títulos' }));
    await waitFor(() =>
      expect(escritas(fetchMock, `${API}/gerar-titulos`, 'POST')).toHaveLength(1),
    );
    const [, init] = escritas(fetchMock, `${API}/gerar-titulos`, 'POST')[0] ?? [];
    expect(JSON.parse(String(init?.body))).toEqual({
      competencia: `${new Date().getFullYear()}-12`,
    });
  });
});
