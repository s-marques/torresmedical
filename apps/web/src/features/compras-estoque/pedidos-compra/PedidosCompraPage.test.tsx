import type { PedidoCompra } from '@torres/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { apiFalsa, chamadasPara, json, renderApp } from '@/test/render-app';

// Tela com modais e comboboxes: estoura os 5 s padrão no CI (cobertura).
vi.setConfig({ testTimeout: 20_000 });

const API = '/api/compras-estoque/pedidos-compra';
const ID_1 = '00000000-0000-4000-8000-0000000000d1';
const ID_2 = '00000000-0000-4000-8000-0000000000d2';
const FORNECEDOR = '00000000-0000-4000-8000-0000000000f1';
const PRODUTO = '00000000-0000-4000-8000-0000000000a1';

function pedido(parcial: Partial<PedidoCompra>): PedidoCompra {
  return {
    id: ID_1,
    fornecedorId: FORNECEDOR,
    fornecedorNome: 'Distribuidora Alfa',
    numeroNf: '4321',
    dataPedido: '2026-11-18',
    dataPrevisao: '2026-11-30',
    valorTotal: '37.5',
    valorTotalInformado: false,
    qtdItens: 1,
    status: 'EM_TRANSITO',
    observacoes: 'Entrega no térreo',
    itens: [
      {
        id: '00000000-0000-4000-8000-0000000000b1',
        produtoId: PRODUTO,
        produtoNome: 'Luva',
        quantidade: '3',
        valorUnitario: '12.5',
        valorTotal: '37.5',
      },
    ],
    createdAt: '2026-11-18T12:00:00.000Z',
    updatedAt: '2026-11-18T12:00:00.000Z',
    ...parcial,
  };
}

const PEDIDOS = [
  pedido({}),
  pedido({
    id: ID_2,
    fornecedorNome: 'Beta Ltda',
    numeroNf: null,
    dataPrevisao: null,
    status: 'RECEBIDO',
    qtdItens: 0,
    itens: [],
  }),
];

const META = { page: 1, pageSize: 10, total: 2, totalPages: 1 };

const lookup = (data: { id: string; label: string }[]) =>
  json({ data: data.map((d) => ({ ...d, descricao: null })), meta: META });

function api(rotas: Parameters<typeof apiFalsa>[0] = {}) {
  return apiFalsa({
    ...rotas,
    rotas: {
      [API]: () => json({ data: PEDIDOS, meta: META }),
      '/api/lookups/fornecedores': () => lookup([{ id: FORNECEDOR, label: 'Distribuidora Alfa' }]),
      '/api/lookups/produtos': () => lookup([{ id: PRODUTO, label: 'Luva' }]),
      ...rotas.rotas,
    },
  });
}

function renderTela(fetchMock = api()) {
  return { user: userEvent.setup(), ...renderApp('/pedidos-compra', fetchMock) };
}

function parametros(fetchMock: ReturnType<typeof apiFalsa>) {
  const [url] = chamadasPara(fetchMock, API)
    .filter(([, init]) => !init?.method || init.method === 'GET')
    .at(-1) ?? [''];
  return Object.fromEntries(new URL(url, 'http://x').searchParams);
}

const enviados = (fetchMock: ReturnType<typeof apiFalsa>, metodo: string) =>
  chamadasPara(fetchMock, API).filter(([, init]) => init?.method === metodo);

/** Abre o detalhe do primeiro pedido (linha "Distribuidora Alfa"). */
async function abrirDetalhe(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByText('Distribuidora Alfa'));
  return screen.findByRole('dialog', { name: 'Pedido de Compra NF 4321' });
}

describe('Pedidos em Trânsito (/pedidos-compra)', () => {
  it('mostra título, botões, chips e as colunas do inventário', async () => {
    renderTela();

    expect(await screen.findByRole('heading', { name: 'Pedidos de Compra' })).toBeInTheDocument();
    expect(
      screen.getByText('Gerencie pedidos de compra em transito, recebidos e cancelados.'),
    ).toBeVisible();
    const cabecalhos = within(await screen.findByRole('table')).getAllByRole('columnheader');
    expect(cabecalhos.map((c) => c.textContent)).toEqual([
      'NF',
      'Fornecedor',
      'Data Pedido',
      'Previsao',
      'Valor',
      'Itens',
      'Status',
      'Ações',
    ]);
    for (const nome of ['Todos', 'Em Transito', 'Recebido', 'Cancelado']) {
      expect(screen.getByRole('button', { name: nome })).toBeVisible();
    }
    expect(screen.getByPlaceholderText('Buscar pedidos...')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Novo Pedido' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Exportar' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Colunas' })).toBeVisible();
  });

  it('formata datas, valor, itens e status', async () => {
    renderTela();
    const linha = (await screen.findByText('Distribuidora Alfa')).closest('tr') as HTMLElement;
    expect(within(linha).getByText('4321')).toBeVisible();
    expect(within(linha).getByText('18/11/2026')).toBeVisible();
    expect(within(linha).getByText('30/11/2026')).toBeVisible();
    expect(within(linha).getByText('R$ 37,50')).toBeVisible();
    expect(within(linha).getByText('Em Transito')).toBeVisible();
    const outra = screen.getByText('Beta Ltda').closest('tr') as HTMLElement;
    expect(within(outra).getByText('Recebido')).toBeVisible();
    expect(within(outra).getByText('0')).toBeVisible();
  });

  it('chip de status, busca e ordenação chamam a API', async () => {
    const fetchMock = api();
    const { user } = renderTela(fetchMock);
    await screen.findByText('Distribuidora Alfa');
    expect(parametros(fetchMock)).toMatchObject({ page: '1', pageSize: '10' });

    await user.click(screen.getByRole('button', { name: 'Em Transito' }));
    await waitFor(() => expect(parametros(fetchMock)).toMatchObject({ status: 'EM_TRANSITO' }));

    await user.type(screen.getByPlaceholderText('Buscar pedidos...'), 'alfa');
    await waitFor(() => expect(parametros(fetchMock)).toMatchObject({ search: 'alfa' }));

    await user.click(screen.getByRole('button', { name: /Itens/ }));
    await waitFor(() => expect(parametros(fetchMock).sort).toMatch(/^qtdItens:/));
  });

  it('Novo Pedido: campos e botões do inventário, sem itens', async () => {
    const { user } = renderTela();
    await screen.findByText('Distribuidora Alfa');
    await user.click(screen.getByRole('button', { name: 'Novo Pedido' }));
    const modal = await screen.findByRole('dialog', { name: 'Novo Pedido de Compra' });

    expect(within(modal).getByRole('combobox', { name: /Fornecedor/ })).toBeVisible();
    expect(within(modal).getByText('Selecione o fornecedor')).toBeVisible();
    for (const rotulo of [
      'Numero NF',
      'Data Pedido',
      'Previsao Entrega',
      'Valor Total (R$)',
      'Observacoes',
    ]) {
      expect(within(modal).getByLabelText(rotulo)).toBeVisible();
    }
    expect(within(modal).getByLabelText('Data Pedido')).not.toHaveValue('');
    expect(within(modal).getByLabelText('Valor Total (R$)')).toHaveAttribute('placeholder', 'Auto');
    expect(within(modal).getByText('Itens do Pedido')).toBeVisible();
    expect(
      within(modal).getByText('Nenhum item adicionado. Clique em "Adicionar Item" acima.'),
    ).toBeVisible();
    expect(within(modal).getByRole('button', { name: 'Adicionar Item' })).toBeVisible();
    expect(within(modal).getByRole('button', { name: 'Cancelar' })).toBeVisible();
    expect(within(modal).getByRole('button', { name: 'Criar Pedido' })).toBeEnabled();
  });

  it('Novo Pedido: fornecedor é obrigatório (mensagem padrão); não envia', async () => {
    const fetchMock = api();
    const { user } = renderTela(fetchMock);
    await screen.findByText('Distribuidora Alfa');
    await user.click(screen.getByRole('button', { name: 'Novo Pedido' }));
    const modal = await screen.findByRole('dialog', { name: 'Novo Pedido de Compra' });
    await user.click(within(modal).getByRole('button', { name: 'Criar Pedido' }));

    expect(await within(modal).findByText('Fornecedor é obrigatório.')).toBeVisible();
    expect(enviados(fetchMock, 'POST')).toHaveLength(0);
  });

  it('Novo Pedido: item sem produto mostra o erro da linha', async () => {
    const { user } = renderTela();
    await screen.findByText('Distribuidora Alfa');
    await user.click(screen.getByRole('button', { name: 'Novo Pedido' }));
    const modal = await screen.findByRole('dialog', { name: 'Novo Pedido de Compra' });
    await user.click(within(modal).getByRole('button', { name: 'Adicionar Item' }));
    await user.click(within(modal).getByRole('button', { name: 'Criar Pedido' }));
    expect(await within(modal).findByText('Produto é obrigatório.')).toBeVisible();
  });

  it('Novo Pedido: adiciona item, calcula total da linha, subtotal e total, e envia o POST', async () => {
    let corpo: Record<string, unknown> = {};
    const fetchMock = api({
      rotas: {
        [API]: (init) => {
          if (init?.method !== 'POST') return json({ data: PEDIDOS, meta: META });
          corpo = JSON.parse(String(init.body)) as Record<string, unknown>;
          return json(pedido({ id: '00000000-0000-4000-8000-0000000000d3' }), 201);
        },
      },
    });
    const { user } = renderTela(fetchMock);
    await screen.findByText('Distribuidora Alfa');
    await user.click(screen.getByRole('button', { name: 'Novo Pedido' }));
    const modal = await screen.findByRole('dialog', { name: 'Novo Pedido de Compra' });

    await user.click(within(modal).getByRole('combobox', { name: /Fornecedor/ }));
    await user.click(await screen.findByRole('option', { name: /Distribuidora Alfa/ }));
    await user.click(within(modal).getByRole('button', { name: 'Adicionar Item' }));

    expect(within(modal).getByLabelText('Quantidade do item 1')).toHaveValue(1);
    expect(within(modal).getByLabelText('Valor unitário do item 1')).toHaveValue(0);
    expect(within(modal).getByText('Subtotal (1 item)')).toBeVisible();

    await user.click(within(modal).getByRole('combobox', { name: 'Produto do item 1' }));
    await user.click(await screen.findByRole('option', { name: /Luva/ }));
    const quantidade = within(modal).getByLabelText('Quantidade do item 1');
    await user.clear(quantidade);
    await user.type(quantidade, '3');
    const unitario = within(modal).getByLabelText('Valor unitário do item 1');
    await user.clear(unitario);
    await user.type(unitario, '12.5');
    expect(within(modal).getAllByText('R$ 37,50')).toHaveLength(3);

    await user.type(within(modal).getByLabelText('Numero NF'), '4321');
    await user.click(within(modal).getByRole('button', { name: 'Criar Pedido' }));
    await waitFor(() => expect(corpo.fornecedorId).toBe(FORNECEDOR));
    expect(corpo).toMatchObject({
      numeroNf: '4321',
      dataPedido: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      valorTotal: null,
      itens: [{ produtoId: PRODUTO, quantidade: 3, valorUnitario: 12.5 }],
    });
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Novo Pedido de Compra' })).toBeNull(),
    );
  });

  it('Novo Pedido: Valor Total digitado substitui a soma e o item pode ser removido', async () => {
    let corpo: Record<string, unknown> = {};
    const fetchMock = api({
      rotas: {
        [API]: (init) => {
          if (init?.method !== 'POST') return json({ data: PEDIDOS, meta: META });
          corpo = JSON.parse(String(init.body)) as Record<string, unknown>;
          return json(pedido({}), 201);
        },
      },
    });
    const { user } = renderTela(fetchMock);
    await screen.findByText('Distribuidora Alfa');
    await user.click(screen.getByRole('button', { name: 'Novo Pedido' }));
    const modal = await screen.findByRole('dialog', { name: 'Novo Pedido de Compra' });
    await user.click(within(modal).getByRole('combobox', { name: /Fornecedor/ }));
    await user.click(await screen.findByRole('option', { name: /Distribuidora Alfa/ }));

    await user.click(within(modal).getByRole('button', { name: 'Adicionar Item' }));
    await user.click(within(modal).getByRole('button', { name: 'Remover item 1' }));
    expect(
      within(modal).getByText('Nenhum item adicionado. Clique em "Adicionar Item" acima.'),
    ).toBeVisible();

    await user.type(within(modal).getByLabelText('Valor Total (R$)'), '98040');
    await user.click(within(modal).getByRole('button', { name: 'Criar Pedido' }));
    await waitFor(() => expect(corpo).toMatchObject({ valorTotal: 980.4, itens: [] }));
  });

  it('detalhe do pedido em trânsito: editar abre o modal preenchido e envia o PATCH', async () => {
    let corpo: Record<string, unknown> = {};
    const fetchMock = api({
      rotas: {
        [`${API}/${ID_1}`]: (init) => {
          corpo = JSON.parse(String(init?.body)) as Record<string, unknown>;
          return json(pedido({ numeroNf: '5555' }));
        },
      },
    });
    const { user } = renderTela(fetchMock);
    const detalhe = await abrirDetalhe(user);
    expect(within(detalhe).getByText('Entrega no térreo')).toBeVisible();
    expect(within(detalhe).getByText('Luva')).toBeVisible();

    await user.click(within(detalhe).getByRole('button', { name: 'Editar' }));
    const modal = await screen.findByRole('dialog', { name: 'Editar Pedido de Compra' });
    expect(within(modal).getByLabelText('Numero NF')).toHaveValue('4321');
    expect(within(modal).getByLabelText('Valor Total (R$)')).toHaveValue('');
    expect(within(modal).getByLabelText('Quantidade do item 1')).toHaveValue(3);

    const nf = within(modal).getByLabelText('Numero NF');
    await user.clear(nf);
    await user.type(nf, '5555');
    await user.click(within(modal).getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(corpo).toMatchObject({ numeroNf: '5555' }));
  });

  it('marcar como recebido e cancelar passam por confirmação', async () => {
    const chamados: string[] = [];
    const responder = (status: PedidoCompra['status']) => (init?: RequestInit) => {
      chamados.push(`${init?.method} ${status}`);
      return json(pedido({ status }));
    };
    const fetchMock = api({
      rotas: {
        [`${API}/${ID_1}/receber`]: responder('RECEBIDO'),
        [`${API}/${ID_1}/cancelar`]: responder('CANCELADO'),
      },
    });
    const { user } = renderTela(fetchMock);

    let detalhe = await abrirDetalhe(user);
    await user.click(within(detalhe).getByRole('button', { name: 'Marcar como recebido' }));
    let confirmar = await screen.findByRole('alertdialog', { name: 'Marcar como recebido' });
    expect(within(confirmar).getByText(/O estoque não é alterado/)).toBeVisible();
    await user.click(within(confirmar).getByRole('button', { name: 'Marcar como recebido' }));
    await waitFor(() => expect(chamados).toEqual(['POST RECEBIDO']));

    detalhe = await abrirDetalhe(user);
    await user.click(within(detalhe).getByRole('button', { name: 'Cancelar pedido' }));
    confirmar = await screen.findByRole('alertdialog', { name: 'Cancelar Pedido' });
    await user.click(within(confirmar).getByRole('button', { name: 'Cancelar pedido' }));
    await waitFor(() => expect(chamados).toEqual(['POST RECEBIDO', 'POST CANCELADO']));
  });

  it('excluir passa por confirmação e envia o DELETE', async () => {
    const metodos: string[] = [];
    const fetchMock = api({
      rotas: {
        [`${API}/${ID_1}`]: (init) => {
          metodos.push(String(init?.method));
          return json(pedido({}));
        },
      },
    });
    const { user } = renderTela(fetchMock);
    const detalhe = await abrirDetalhe(user);
    await user.click(within(detalhe).getByRole('button', { name: 'Excluir' }));
    const confirmar = await screen.findByRole('alertdialog', { name: 'Excluir Pedido' });
    expect(within(confirmar).getByText(/o pedido da NF 4321/)).toBeVisible();
    await user.click(within(confirmar).getByRole('button', { name: 'Excluir' }));
    await waitFor(() => expect(metodos).toEqual(['DELETE']));
  });

  it('pedido recebido: detalhe sem Editar, Receber e Cancelar', async () => {
    const { user } = renderTela();
    await user.click(await screen.findByText('Beta Ltda'));
    const detalhe = await screen.findByRole('dialog', { name: 'Pedido de Compra' });
    expect(within(detalhe).getByText('Nenhum item.')).toBeVisible();
    expect(within(detalhe).queryByRole('button', { name: 'Editar' })).toBeNull();
    expect(within(detalhe).queryByRole('button', { name: 'Marcar como recebido' })).toBeNull();
    expect(within(detalhe).queryByRole('button', { name: 'Cancelar pedido' })).toBeNull();
    expect(within(detalhe).getByRole('button', { name: 'Excluir' })).toBeVisible();
  });
});
