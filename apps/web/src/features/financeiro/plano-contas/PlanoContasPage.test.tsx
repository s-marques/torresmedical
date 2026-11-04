import { PERMISSOES, type PlanoConta } from '@torres/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { apiFalsa, chamadasPara, json, renderApp, USUARIO_TESTE } from '@/test/render-app';

vi.setConfig({ testTimeout: 20_000 });

const API = '/api/financeiro/plano-contas';
const ID_6 = '00000000-0000-4000-8000-000000000006';
const ID_61 = '00000000-0000-4000-8000-000000000061';
const ID_1 = '00000000-0000-4000-8000-000000000001';

function conta(parcial: Partial<PlanoConta> & Pick<PlanoConta, 'id' | 'codigo'>): PlanoConta {
  return {
    nome: `CONTA ${parcial.codigo}`,
    tipo: 'DESPESA',
    nivel: parcial.codigo.split('.').length,
    contaPaiId: null,
    ativo: true,
    createdAt: '2026-10-14T12:00:00.000Z',
    updatedAt: '2026-10-14T12:00:00.000Z',
    ...parcial,
  };
}

const CONTAS = [
  conta({ id: ID_6, codigo: '6', nome: 'DESPESAS' }),
  conta({ id: ID_61, codigo: '6.1', nome: 'DESPESAS OPERACIONAIS', contaPaiId: ID_6 }),
  conta({ id: ID_1, codigo: '1', nome: 'ATIVO', tipo: 'ATIVO' }),
];

function lista(contas: PlanoConta[] = CONTAS) {
  return json({ data: contas, total: contas.length });
}

function parametros(fetchMock: ReturnType<typeof apiFalsa>) {
  const [url] = chamadasPara(fetchMock, API).at(-1) ?? [''];
  return Object.fromEntries(new URL(url, 'http://x').searchParams);
}

function renderTela(fetchMock = apiFalsa({ rotas: { [API]: () => lista() } })) {
  return { user: userEvent.setup(), ...renderApp('/plano-contas', fetchMock) };
}

function linha(codigo: string) {
  return screen.getByTestId(`conta-${codigo}`);
}

describe('Plano de Contas (/plano-contas)', () => {
  it('mostra título, ações, colunas e só as contas raiz recolhidas', async () => {
    renderTela();

    expect(await screen.findByRole('heading', { name: 'Plano de Contas' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Nova Conta' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Imprimir' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Expandir Tudo' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Recolher' })).toBeVisible();
    const cabecalhos = within(await screen.findByRole('table')).getAllByRole('columnheader');
    expect(cabecalhos.map((c) => c.textContent)).toEqual([
      'Código',
      'Nome',
      'Tipo',
      'Nível',
      'Ativo',
      'Ações',
    ]);
    expect(await screen.findByText('DESPESAS')).toBeVisible();
    expect(screen.queryByText('DESPESAS OPERACIONAIS')).not.toBeInTheDocument();
    expect(screen.getByText('3 contas')).toBeVisible();
  });

  it('expandir uma conta, Expandir Tudo e Recolher mostram e escondem as subcontas', async () => {
    const { user } = renderTela();
    await screen.findByText('DESPESAS');

    await user.click(screen.getByRole('button', { name: 'Expandir 6' }));
    expect(await screen.findByText('DESPESAS OPERACIONAIS')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Recolher 6' }));
    expect(screen.queryByText('DESPESAS OPERACIONAIS')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Expandir Tudo' }));
    expect(await screen.findByText('DESPESAS OPERACIONAIS')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Recolher' }));
    await waitFor(() =>
      expect(screen.queryByText('DESPESAS OPERACIONAIS')).not.toBeInTheDocument(),
    );
  });

  it('busca e filtro de Tipo chamam a API e deixam a lista plana', async () => {
    const { fetchMock, user } = renderTela();
    await screen.findByText('DESPESAS');

    await user.type(screen.getByLabelText('Buscar'), 'oper');
    await waitFor(() => expect(parametros(fetchMock)).toMatchObject({ search: 'oper' }));
    expect(await screen.findByText('DESPESAS OPERACIONAIS')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Expandir Tudo' })).toBeDisabled();

    await user.clear(screen.getByLabelText('Buscar'));
    await user.click(screen.getByRole('combobox', { name: 'Tipo' }));
    for (const rotulo of ['Todos', 'Receita', 'Despesa', 'Ativo', 'Passivo']) {
      expect(await screen.findByRole('option', { name: rotulo })).toBeVisible();
    }
    await user.click(screen.getByRole('option', { name: 'Receita' }));
    await waitFor(() => expect(parametros(fetchMock)).toMatchObject({ tipo: 'receita' }));
  });

  it('interruptor desativa e, ao clicar de novo, ativa, sem confirmação', async () => {
    const corpos: unknown[] = [];
    const fetchMock = apiFalsa({
      rotas: {
        [API]: () => lista(),
        [`${API}/${ID_6}`]: (init) => {
          const corpo = JSON.parse(String(init?.body));
          corpos.push(corpo);
          return json({ ...CONTAS[0], ...corpo });
        },
      },
    });
    const { user } = renderTela(fetchMock);
    await screen.findByText('DESPESAS');

    await user.click(within(linha('6')).getByRole('switch', { name: 'Desativar 6' }));
    await waitFor(() => expect(corpos).toEqual([{ ativo: false }]));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(await screen.findByText('Conta 6 desativada!')).toBeVisible();
  });

  it('Nova Conta: Código, Tipo e Nome são obrigatórios e nada é enviado', async () => {
    const { fetchMock, user } = renderTela();
    await screen.findByText('DESPESAS');

    await user.click(screen.getByRole('button', { name: 'Nova Conta' }));
    const modal = await screen.findByRole('dialog', { name: 'Nova Conta' });
    await user.click(within(modal).getByRole('button', { name: 'Salvar' }));

    expect(await within(modal).findByText('Código é obrigatório.')).toBeVisible();
    expect(await within(modal).findByText('Nome é obrigatório.')).toBeVisible();
    expect(chamadasPara(fetchMock, API).filter(([, i]) => i?.method === 'POST')).toHaveLength(0);
  });

  it('Nova Conta: envia os dados, com "Nenhuma (raiz)" como pai, e fecha o modal', async () => {
    let corpo: unknown;
    const fetchMock = apiFalsa({
      rotas: {
        [API]: (init) => {
          if (init?.method !== 'POST') return lista();
          corpo = JSON.parse(String(init.body));
          return json(conta({ id: '00000000-0000-4000-8000-0000000000aa', codigo: '7' }), 201);
        },
      },
    });
    const { user } = renderTela(fetchMock);
    await screen.findByText('DESPESAS');

    await user.click(screen.getByRole('button', { name: 'Nova Conta' }));
    const modal = await screen.findByRole('dialog', { name: 'Nova Conta' });
    expect(within(modal).getByRole('combobox', { name: /Tipo/ })).toHaveTextContent('Despesa');
    expect(within(modal).getByRole('combobox', { name: /Conta Pai/ })).toHaveTextContent(
      'Nenhuma (raiz)',
    );
    await user.type(within(modal).getByLabelText(/Código/), '7');
    await user.type(within(modal).getByLabelText(/Nome/), 'teste');
    await user.click(within(modal).getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(corpo).toEqual({ codigo: '7', tipo: 'despesa', nome: 'teste', contaPaiId: null });
  });

  it('Editar Conta: abre com os dados e o combo de pai lista "código - nome", sem a própria conta', async () => {
    const { user } = renderTela();
    await screen.findByText('DESPESAS');

    await user.click(within(linha('6')).getByRole('button', { name: 'Editar 6' }));
    const modal = await screen.findByRole('dialog', { name: 'Editar Conta' });
    expect(within(modal).getByLabelText(/Código/)).toHaveValue('6');
    expect(within(modal).getByLabelText(/Nome/)).toHaveValue('DESPESAS');

    await user.click(within(modal).getByRole('combobox', { name: /Conta Pai/ }));
    expect(await screen.findByRole('option', { name: '1 - ATIVO' })).toBeVisible();
    expect(screen.queryByRole('option', { name: '6 - DESPESAS' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('option', { name: '6.1 - DESPESAS OPERACIONAIS' }),
    ).not.toBeInTheDocument();
  });

  it('Excluir: pergunta antes e só depois envia DELETE; Cancelar não exclui', async () => {
    let excluidas = 0;
    const fetchMock = apiFalsa({
      rotas: {
        [API]: () => lista(),
        [`${API}/${ID_1}`]: () => {
          excluidas += 1;
          return json(CONTAS[2]);
        },
      },
    });
    const { user } = renderTela(fetchMock);
    await screen.findByText('DESPESAS');

    await user.click(within(linha('1')).getByRole('button', { name: 'Excluir 1' }));
    const dialogo = await screen.findByRole('alertdialog', { name: 'Excluir Conta' });
    expect(dialogo).toHaveTextContent('Deseja excluir a conta 1 - ATIVO?');
    await user.click(within(dialogo).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(excluidas).toBe(0);

    await user.click(within(linha('1')).getByRole('button', { name: 'Excluir 1' }));
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Excluir' }),
    );
    await waitFor(() => expect(excluidas).toBe(1));
  });

  it('estado vazio e permissões: sem criar, editar, excluir e exportar, esconde os botões', async () => {
    const somenteVer = PERMISSOES.filter((p) => p === 'financeiro.plano-contas.ver');
    renderTela(
      apiFalsa({
        usuario: { ...USUARIO_TESTE, permissoes: somenteVer },
        rotas: { [API]: () => lista() },
      }),
    );
    await screen.findByText('DESPESAS');

    expect(screen.queryByRole('button', { name: 'Nova Conta' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Imprimir' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Editar / })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Excluir / })).not.toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Desativar 6' })).toBeDisabled();
  });

  it('mostra o estado vazio quando não há contas', async () => {
    renderTela(apiFalsa({ rotas: { [API]: () => lista([]) } }));
    expect(await screen.findByText('Nenhuma conta encontrada.')).toBeVisible();
  });
});
