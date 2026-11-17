import { PERMISSOES, type Lote } from '@torres/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { apiFalsa, chamadasPara, json, renderApp, USUARIO_TESTE } from '@/test/render-app';

// Tela com modal e comboboxes: estoura os 5 s padrão no CI (cobertura).
vi.setConfig({ testTimeout: 20_000 });

const BASE = '/api/compras-estoque/lotes';
const PRODUTO = '00000000-0000-4000-8000-0000000000a1';
const META = { page: 1, pageSize: 10, total: 2, totalPages: 1 };

function lote(parcial: Partial<Lote>): Lote {
  return {
    id: '00000000-0000-4000-8000-0000000000b1',
    produtoId: PRODUTO,
    produtoNome: 'Luva Nitrílica',
    produtoSku: 'LUV-1',
    numero: 'LOT-2026-001',
    dataVencimento: '2026-12-10',
    quantidade: '12.5',
    status: 'VENCENDO',
    createdAt: '2026-11-01T12:00:00.000Z',
    ...parcial,
  };
}

const LOTES = [
  lote({}),
  lote({
    id: '00000000-0000-4000-8000-0000000000b2',
    produtoNome: 'Gaze Estéril',
    numero: 'LOT-2025-090',
    dataVencimento: '2026-10-01',
    quantidade: '3',
    status: 'VENCIDO',
  }),
];

const lookup = (data: { id: string; label: string }[]) =>
  json({ data: data.map((d) => ({ ...d, descricao: null })), meta: META });

type Rota = (init?: RequestInit) => Response;

function api(rotas: Record<string, Rota> = {}, permissoes?: string[]) {
  return apiFalsa({
    usuario: permissoes
      ? { ...USUARIO_TESTE, permissoes: permissoes as typeof USUARIO_TESTE.permissoes }
      : USUARIO_TESTE,
    rotas: {
      [BASE]: () => json({ data: LOTES, meta: META }),
      [`${BASE}/resumo`]: () => json({ vencidos: 1, vencendo: 5, abaixoMinimo: 3 }),
      '/api/lookups/produtos': () => lookup([{ id: PRODUTO, label: 'Luva Nitrílica' }]),
      [`/api/lookups/produtos/${PRODUTO}`]: () =>
        json({ id: PRODUTO, label: 'Luva Nitrílica', descricao: null }),
      ...rotas,
    },
  });
}

function renderTela(fetchMock = api(), caminho = '/lotes') {
  return { ...renderApp(caminho, fetchMock), user: userEvent.setup(), fetchMock };
}

function ultimaQuery(fetchMock: ReturnType<typeof apiFalsa>, caminho = BASE) {
  const gets = chamadasPara(fetchMock, caminho).filter(
    ([, init]) => !init?.method || init.method === 'GET',
  );
  const [url] = gets.at(-1) ?? [''];
  return Object.fromEntries(new URL(url, 'http://x').searchParams);
}

describe('Lotes / Validade (/lotes)', () => {
  it('mostra título, Novo Lote, cards e o grid com as colunas do inventário', async () => {
    renderTela();

    expect(await screen.findByRole('heading', { name: 'Controle de Lotes' })).toBeVisible();
    expect(
      screen.getByText('Gerencie lotes, validades e rastreabilidade de produtos.'),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Novo Lote' })).toBeVisible();

    const cards = screen.getByRole('region', { name: 'Resumo dos lotes' });
    expect(await within(cards).findByLabelText('Lotes Vencidos')).toHaveTextContent('1');
    expect(within(cards).getByLabelText('Vencendo em 60 dias')).toHaveTextContent('5');
    expect(within(cards).getByLabelText('Estoque Abaixo do Minimo')).toHaveTextContent('3');

    const tabela = await screen.findByRole('table');
    expect(
      within(tabela)
        .getAllByRole('columnheader')
        .map((c) => c.textContent),
    ).toEqual(['Produto', 'Lote', 'Quantidade', 'Vencimento', 'Status']);
    const linha = within(tabela).getByRole('row', { name: /LOT-2026-001/ });
    for (const texto of ['Luva Nitrílica', '12,5', '10/12/2026', 'Vencendo']) {
      expect(within(linha).getByText(texto)).toBeVisible();
    }
    expect(within(tabela).getByRole('row', { name: /LOT-2025-090/ })).toHaveTextContent('Vencido');

    expect(screen.getByRole('combobox', { name: 'Produto' })).toHaveTextContent(
      'Todos os produtos',
    );
    expect(screen.getByRole('checkbox', { name: 'Apenas com saldo' })).not.toBeChecked();
    expect(screen.getByPlaceholderText('Buscar lotes...')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Exportar' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Colunas' })).toBeVisible();
  });

  it('estado vazio do inventário', async () => {
    renderTela(
      api({ [BASE]: () => json({ data: [], meta: { ...META, total: 0, totalPages: 0 } }) }),
    );
    expect(await screen.findByText('Nenhum lote encontrado.')).toBeVisible();
  });

  it('filtra por produto, "Apenas com saldo", busca e ordena pela API', async () => {
    const { user, fetchMock } = renderTela();
    await screen.findByText('LOT-2026-001');
    expect(ultimaQuery(fetchMock)).toEqual({ page: '1', pageSize: '10' });

    await user.click(screen.getByRole('combobox', { name: 'Produto' }));
    await user.click(await screen.findByRole('option', { name: /Luva Nitrílica/ }));
    await waitFor(() => expect(ultimaQuery(fetchMock)).toMatchObject({ produtoId: PRODUTO }));

    await user.click(screen.getByRole('checkbox', { name: 'Apenas com saldo' }));
    await waitFor(() => expect(ultimaQuery(fetchMock)).toMatchObject({ comSaldo: 'true' }));

    await user.type(screen.getByPlaceholderText('Buscar lotes...'), 'lot-2026');
    await waitFor(() => expect(ultimaQuery(fetchMock)).toMatchObject({ search: 'lot-2026' }));

    await user.click(screen.getByRole('button', { name: /Vencimento/ }));
    await waitFor(() => expect(ultimaQuery(fetchMock)).toMatchObject({ sort: 'vencimento:asc' }));
  });

  it('Novo Lote: campos do print, mensagens de obrigatório e envio do POST', async () => {
    let corpo: Record<string, unknown> = {};
    const fetchMock = api({
      [BASE]: (init) => {
        if (init?.method === 'POST') {
          corpo = JSON.parse(String(init.body)) as Record<string, unknown>;
          return json(lote({ id: '00000000-0000-4000-8000-0000000000b9' }), 201);
        }
        return json({ data: LOTES, meta: META });
      },
    });
    const { user } = renderTela(fetchMock);
    await screen.findByText('LOT-2026-001');
    await user.click(screen.getByRole('button', { name: 'Novo Lote' }));
    const modal = await screen.findByRole('dialog', { name: 'Novo Lote' });

    expect(within(modal).getByRole('combobox', { name: /Produto/ })).toHaveTextContent(
      'Selecione o produto',
    );
    expect(within(modal).getByLabelText(/Numero do Lote/)).toHaveAttribute(
      'placeholder',
      'Ex: LOT-2026-001',
    );
    expect(within(modal).getByLabelText(/Data de Vencimento/)).toHaveAttribute('type', 'date');
    expect(within(modal).getByLabelText(/^Quantidade/)).toBeVisible();
    expect(within(modal).getByRole('button', { name: 'Cancelar' })).toBeVisible();

    await user.click(within(modal).getByRole('button', { name: 'Cadastrar' }));
    expect(await within(modal).findByText('Produto é obrigatório.')).toBeVisible();
    expect(within(modal).getByText('Número do Lote é obrigatório.')).toBeVisible();
    expect(within(modal).getByText('Data de Vencimento é obrigatória.')).toBeVisible();
    expect(within(modal).getByText('Quantidade é obrigatória.')).toBeVisible();
    expect(
      chamadasPara(fetchMock, BASE).filter(([, init]) => init?.method === 'POST'),
    ).toHaveLength(0);

    await user.click(within(modal).getByRole('combobox', { name: /Produto/ }));
    await user.click(await screen.findByRole('option', { name: /Luva Nitrílica/ }));
    await user.type(within(modal).getByLabelText(/Numero do Lote/), 'LOT-9');
    await user.type(within(modal).getByLabelText(/Data de Vencimento/), '2027-03-31');
    await user.type(within(modal).getByLabelText(/^Quantidade/), '20');
    await user.click(within(modal).getByRole('button', { name: 'Cadastrar' }));

    await waitFor(() =>
      expect(corpo).toEqual({
        produtoId: PRODUTO,
        numero: 'LOT-9',
        dataVencimento: '2027-03-31',
        quantidade: 20,
      }),
    );
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Novo Lote' })).not.toBeInTheDocument(),
    );
    expect(await screen.findByText('Lote cadastrado.')).toBeVisible();
  });

  it('Cancelar fecha o modal sem enviar', async () => {
    const { user, fetchMock } = renderTela();
    await screen.findByText('LOT-2026-001');
    await user.click(screen.getByRole('button', { name: 'Novo Lote' }));
    const modal = await screen.findByRole('dialog', { name: 'Novo Lote' });
    await user.click(within(modal).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(
      chamadasPara(fetchMock, BASE).filter(([, init]) => init?.method === 'POST'),
    ).toHaveLength(0);
  });

  it('sem permissão de criar e exportar: esconde Novo Lote e Exportar', async () => {
    renderTela(
      api(
        {},
        PERMISSOES.filter((p) => p === 'compras-estoque.lotes-validade.ver'),
      ),
    );
    expect(await screen.findByText('LOT-2026-001')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Novo Lote' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Exportar' })).not.toBeInTheDocument();
  });
});
