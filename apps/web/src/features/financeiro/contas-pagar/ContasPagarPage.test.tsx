import { PERMISSOES, type ContaPagar } from '@torres/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { apiFalsa, chamadasPara, json, renderApp, USUARIO_TESTE } from '@/test/render-app';

const API = '/api/financeiro/contas-pagar';
const PLANO_CONTAS_API = '/api/financeiro/plano-contas';
const CONTAS_BANCARIAS_API = '/api/financeiro/contas-bancarias';
const ID_1 = '00000000-0000-4000-8000-0000000000c1';
const ID_2 = '00000000-0000-4000-8000-0000000000c2';

function conta(parcial: Partial<ContaPagar>): ContaPagar {
  return {
    id: ID_1,
    numero: 1,
    descricao: 'Água Cuiaba',
    beneficiarioTipo: 'FORNECEDOR',
    beneficiarioId: null,
    beneficiarioNome: null,
    valor: '150.50',
    dataVencimento: '2026-12-10',
    formaPagamentoId: null,
    formaPagamentoNome: null,
    planoContaId: null,
    planoContaNome: null,
    documento: null,
    totalParcelas: 1,
    status: 'PENDENTE',
    observacoes: null,
    valorPago: '0',
    competencia: null,
    centroCustoId: null,
    centroCustoNome: null,
    documentoArquivoId: null,
    createdAt: '2026-10-14T12:00:00.000Z',
    updatedAt: '2026-10-14T12:00:00.000Z',
    ...parcial,
  };
}

const CONTAS = [
  conta({}),
  conta({
    id: ID_2,
    numero: 2,
    descricao: 'Aluguel',
    beneficiarioNome: 'Fulano de Tal',
    status: 'PAGO',
    valorPago: '150.50',
  }),
];

function pagina(data: ContaPagar[]) {
  return json({ data, meta: { page: 1, pageSize: 10, total: data.length, totalPages: 1 } });
}

function listaVazia() {
  return json({ data: [], total: 0 });
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
  return apiFalsa({
    ...rotas,
    rotas: {
      [API]: () => pagina(CONTAS),
      [PLANO_CONTAS_API]: () => listaVazia(),
      [`${API}/duplicidade`]: () => json({ candidatos: [] }),
      [CONTAS_BANCARIAS_API]: () => listaVazia(),
      ...rotas.rotas,
    },
  });
}

function renderTela(fetchMock = api()) {
  return { user: userEvent.setup(), ...renderApp('/pagar', fetchMock) };
}

async function abrirMenu(user: ReturnType<typeof userEvent.setup>, linha: string, item: string) {
  const tr = (await screen.findByText(linha)).closest('tr') as HTMLElement;
  await user.click(within(tr).getByRole('button', { name: 'Ações' }));
  await user.click(await screen.findByRole('menuitem', { name: item }));
}

describe('Contas a Pagar (/pagar)', () => {
  it('mostra título, chips, ações e a grid com as colunas do inventário', async () => {
    const fetchMock = api();
    renderTela(fetchMock);

    expect(await screen.findByRole('heading', { name: 'Contas a Pagar' })).toBeInTheDocument();
    expect(screen.getByText('Gerencie suas contas a pagar e fornecedores.')).toBeVisible();
    const cabecalhos = within(await screen.findByRole('table')).getAllByRole('columnheader');
    expect(cabecalhos.map((c) => c.textContent)).toEqual([
      '#',
      'Descricao',
      'Fornecedor / Funcionário',
      'Valor',
      'Vencimento',
      'Status',
      'Ações',
    ]);
    for (const nome of ['Todos', 'Pendente', 'Pago', 'Vencido']) {
      expect(screen.getByRole('button', { name: nome })).toBeVisible();
    }
    expect(screen.getByPlaceholderText('Buscar contas a pagar...')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Nova Conta' })).toBeVisible();
    expect(parametros(fetchMock)).toMatchObject({ page: '1', pageSize: '10' });
  });

  it('formata valor, vencimento e status; beneficiário vazio vira "-"', async () => {
    renderTela();

    const l1 = (await screen.findByText('Água Cuiaba')).closest('tr') as HTMLElement;
    expect(within(l1).getByText('R$ 150,50')).toBeVisible();
    expect(within(l1).getByText('10/12/2026')).toBeVisible();
    expect(within(l1).getByText('Pendente')).toBeVisible();
    expect(within(l1).getByText('-')).toBeVisible();

    const l2 = screen.getByText('Aluguel').closest('tr') as HTMLElement;
    expect(within(l2).getByText('Fulano de Tal')).toBeVisible();
    expect(within(l2).getByText('Pago')).toBeVisible();
  });

  it('chips de status filtram na API; Todos volta à lista completa', async () => {
    const fetchMock = api();
    const { user } = renderTela(fetchMock);
    await screen.findByText('Água Cuiaba');

    await user.click(screen.getByRole('button', { name: 'Vencido' }));
    await waitFor(() => expect(parametros(fetchMock)).toMatchObject({ status: 'VENCIDO' }));

    await user.click(screen.getByRole('button', { name: 'Todos' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Todos' })).toHaveAttribute('aria-pressed', 'true'),
    );
  });

  it('Nova Conta: mostra os campos do inventário, Status Pendente e o checkbox Funcionário', async () => {
    const { user } = renderTela();
    await screen.findByText('Água Cuiaba');

    await user.click(screen.getByRole('button', { name: 'Nova Conta' }));
    const modal = await screen.findByRole('dialog', { name: 'Nova Conta a Pagar' });

    expect(within(modal).getByLabelText('Descrição')).toBeVisible();
    expect(within(modal).getByLabelText('Valor')).toBeVisible();
    expect(within(modal).getByLabelText('Data de Vencimento')).toBeVisible();
    expect(within(modal).getByLabelText('Documento')).toBeVisible();
    expect(within(modal).getByLabelText('Total Parcelas')).toBeVisible();
    expect(within(modal).getByRole('checkbox', { name: 'Funcionário' })).not.toBeChecked();
    expect(within(modal).getByRole('combobox', { name: 'Status' })).toHaveTextContent('Pendente');
    expect(within(modal).getByRole('button', { name: 'Cancelar' })).toBeVisible();
    expect(within(modal).getByRole('button', { name: 'Cadastrar' })).toBeVisible();
  });

  it('Nova Conta: vazio mostra as mensagens obrigatórias e não envia', async () => {
    const fetchMock = api();
    const { user } = renderTela(fetchMock);
    await screen.findByText('Água Cuiaba');

    await user.click(screen.getByRole('button', { name: 'Nova Conta' }));
    const modal = await screen.findByRole('dialog', { name: 'Nova Conta a Pagar' });
    await user.click(within(modal).getByRole('button', { name: 'Cadastrar' }));

    expect(await within(modal).findByText('Descrição é obrigatório.')).toBeVisible();
    expect(within(modal).getByText('O valor deve ser maior que zero')).toBeVisible();
    expect(within(modal).getByText('Data de vencimento é obrigatória.')).toBeVisible();
    expect(chamadasPara(fetchMock, API).filter(([, init]) => init?.method === 'POST')).toHaveLength(
      0,
    );
  });

  it('Nova Conta: preenche e envia POST com beneficiarioTipo FORNECEDOR por padrão', async () => {
    let corpo: Corpo = {};
    const fetchMock = api({
      rotas: {
        [API]: (init) => {
          if (init?.method !== 'POST') return pagina(CONTAS);
          corpo = corpoDe(init);
          return json(
            conta({ id: '00000000-0000-4000-8000-0000000000c3', descricao: 'Nova' }),
            201,
          );
        },
      },
    });
    const { user } = renderTela(fetchMock);
    await screen.findByText('Água Cuiaba');

    await user.click(screen.getByRole('button', { name: 'Nova Conta' }));
    const modal = await screen.findByRole('dialog', { name: 'Nova Conta a Pagar' });
    await user.type(within(modal).getByLabelText('Descrição'), 'Nova');
    await user.type(within(modal).getByLabelText('Valor'), '20000');
    await user.type(within(modal).getByLabelText('Data de Vencimento'), '2026-12-20');
    await user.click(within(modal).getByRole('button', { name: 'Cadastrar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(corpo).toMatchObject({
      descricao: 'Nova',
      valor: 200,
      dataVencimento: '2026-12-20',
      beneficiarioTipo: 'FORNECEDOR',
      beneficiarioId: null,
    });
  });

  it('clicar na linha abre o detalhe com os dados da conta', async () => {
    const { user } = renderTela();
    await abrirMenu(user, 'Aluguel', 'Detalhar');

    const modal = await screen.findByRole('dialog', { name: 'Aluguel' });
    expect(within(modal).getByText('Fulano de Tal')).toBeVisible();
    expect(within(modal).getByText('Pago')).toBeVisible();
  });

  it('menu ⋯ tem Editar Baixa, Cancelar Baixa, Editar e Excluir; Editar abre com os dados', async () => {
    const { user } = renderTela();

    await abrirMenu(user, 'Água Cuiaba', 'Editar');
    const modal = await screen.findByRole('dialog', { name: 'Editar Conta a Pagar' });
    expect(within(modal).getByLabelText('Descrição')).toHaveValue('Água Cuiaba');
  });

  it('Editar Baixa abre o modal de baixa com o valor do saldo pendente', async () => {
    const { user } = renderTela();
    await abrirMenu(user, 'Água Cuiaba', 'Editar Baixa');

    const modal = await screen.findByRole('dialog', { name: 'Baixar Conta a Pagar' });
    expect(within(modal).getByText('Água Cuiaba', { exact: false })).toBeVisible();
    expect(within(modal).getByLabelText('Valor Pago *')).toHaveValue('R$ 150,50');
  });

  it('Baixar: envia POST /:id/baixar e fecha o modal', async () => {
    let corpo: Corpo = {};
    const { user } = renderTela(
      api({
        rotas: {
          [`${API}/${ID_1}/baixar`]: (init) => {
            corpo = corpoDe(init);
            return json(conta({ status: 'PAGO', valorPago: '150.5' }));
          },
        },
      }),
    );

    await abrirMenu(user, 'Água Cuiaba', 'Editar Baixa');
    const modal = await screen.findByRole('dialog', { name: 'Baixar Conta a Pagar' });
    await user.click(within(modal).getByRole('button', { name: 'Confirmar Baixa' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(corpo).toMatchObject({ valorPago: 150.5 });
    expect(corpo.dataPagamento).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('Cancelar Baixa envia POST /:id/cancelar-baixa', async () => {
    let chamadas = 0;
    const { user } = renderTela(
      api({
        rotas: {
          [`${API}/${ID_2}/cancelar-baixa`]: () => {
            chamadas += 1;
            return json(conta({ id: ID_2, status: 'PENDENTE', valorPago: '0' }));
          },
        },
      }),
    );

    await abrirMenu(user, 'Aluguel', 'Cancelar Baixa');
    await waitFor(() => expect(chamadas).toBe(1));
  });

  it('Excluir: confirma antes e envia DELETE; Cancelar não exclui', async () => {
    let excluidos = 0;
    const { user } = renderTela(
      api({
        rotas: {
          [`${API}/${ID_1}`]: () => {
            excluidos += 1;
            return json(conta({}));
          },
        },
      }),
    );

    await abrirMenu(user, 'Água Cuiaba', 'Excluir');
    const dialogo = await screen.findByRole('alertdialog', { name: 'Excluir Conta a Pagar' });
    await user.click(within(dialogo).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(excluidos).toBe(0);

    await abrirMenu(user, 'Água Cuiaba', 'Excluir');
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Excluir' }),
    );
    await waitFor(() => expect(excluidos).toBe(1));
  });

  it('sem permissão de criar, editar e excluir, esconde os botões e as ações', async () => {
    const somenteVer = PERMISSOES.filter((p) => p === 'financeiro.contas-pagar.ver');
    const { user } = renderTela(api({ usuario: { ...USUARIO_TESTE, permissoes: somenteVer } }));

    await screen.findByText('Água Cuiaba');

    expect(screen.queryByRole('button', { name: 'Nova Conta' })).not.toBeInTheDocument();

    const tr = screen.getByText('Água Cuiaba').closest('tr') as HTMLElement;
    await user.click(within(tr).getByRole('button', { name: 'Ações' }));
    expect(screen.getByRole('menuitem', { name: 'Detalhar' })).toBeVisible();
    expect(screen.queryByRole('menuitem', { name: 'Editar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Editar Baixa' })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Excluir' })).not.toBeInTheDocument();
  });
});
