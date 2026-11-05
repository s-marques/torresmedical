import type { Compra } from '@torres/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { apiFalsa, chamadasPara, json, renderApp } from '@/test/render-app';

// Tela com vários modais e comboboxes: estoura os 5 s padrão no CI (cobertura).
vi.setConfig({ testTimeout: 20_000 });

const API = '/api/compras-estoque/compras';
const ID_1 = '00000000-0000-4000-8000-0000000000c1';
const ID_2 = '00000000-0000-4000-8000-0000000000c2';
const FORNECEDOR = '00000000-0000-4000-8000-0000000000f1';
const PRODUTO = '00000000-0000-4000-8000-0000000000a1';

function compra(parcial: Partial<Compra>): Compra {
  return {
    id: ID_1,
    numero: 1,
    fornecedorId: FORNECEDOR,
    fornecedorNome: 'Distribuidora Alfa',
    numeroNf: '55252',
    serieNf: '1',
    dataEmissao: '2026-11-04',
    dataEntrada: '2026-11-05',
    frete: '0',
    desconto: '0',
    valorTotal: '892.51',
    status: 'RECEBIDA',
    observacoes: null,
    arquivoNfId: null,
    itens: [
      {
        id: '00000000-0000-4000-8000-0000000000b1',
        produtoId: PRODUTO,
        produtoNome: 'Cadeira',
        descricao: 'CADEIRA GOAH POP FLANGE',
        quantidade: '1',
        valorUnitario: '892.51',
        valorTotal: '892.51',
        planoContaId: null,
        planoContaNome: null,
      },
    ],
    createdAt: '2026-11-05T12:00:00.000Z',
    updatedAt: '2026-11-05T12:00:00.000Z',
    ...parcial,
  };
}

const COMPRAS = [
  compra({}),
  compra({ id: ID_2, numero: 2, fornecedorNome: 'Beta Ltda', numeroNf: '777', status: 'PENDENTE' }),
];

const META = { page: 1, pageSize: 10, total: 2, totalPages: 1 };

const lookup = (data: { id: string; label: string }[]) =>
  json({ data: data.map((d) => ({ ...d, descricao: null })), meta: META });

function api(rotas: Parameters<typeof apiFalsa>[0] = {}) {
  return apiFalsa({
    ...rotas,
    rotas: {
      [API]: () => json({ data: COMPRAS, meta: META }),
      '/api/financeiro/plano-contas': () => json({ data: [], total: 0 }),
      '/api/lookups/fornecedores': () => lookup([{ id: FORNECEDOR, label: 'Distribuidora Alfa' }]),
      '/api/lookups/produtos': () => lookup([{ id: PRODUTO, label: 'Cadeira' }]),
      ...rotas.rotas,
    },
  });
}

function renderTela(fetchMock = api()) {
  return { user: userEvent.setup(), ...renderApp('/compras', fetchMock) };
}

function parametros(fetchMock: ReturnType<typeof apiFalsa>) {
  const [url] = chamadasPara(fetchMock, API).at(-1) ?? [''];
  return Object.fromEntries(new URL(url, 'http://x').searchParams);
}

describe('Entrada de Compras (/compras)', () => {
  it('mostra título, botões, chips e as colunas do inventário', async () => {
    renderTela();

    expect(await screen.findByRole('heading', { name: 'Compras' })).toBeInTheDocument();
    expect(
      screen.getByText('Registre compras de fornecedores e controle o estoque de entrada.'),
    ).toBeVisible();
    const cabecalhos = within(await screen.findByRole('table')).getAllByRole('columnheader');
    expect(cabecalhos.map((c) => c.textContent)).toEqual([
      '#',
      'Data',
      'Fornecedor',
      'NF',
      'Valor Total',
      'Status',
      'Ações',
    ]);
    for (const nome of ['Todas', 'Pendente', 'Recebida', 'Cancelada']) {
      expect(screen.getByRole('button', { name: nome })).toBeVisible();
    }
    expect(screen.getByPlaceholderText('Buscar compras...')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Importar XML' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Nova Compra' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Colunas' })).toBeVisible();
  });

  it('formata data, valor e status', async () => {
    renderTela();
    const linha = (await screen.findByText('Distribuidora Alfa')).closest('tr') as HTMLElement;
    expect(within(linha).getByText('05/11/2026')).toBeVisible();
    expect(within(linha).getByText('R$ 892,51')).toBeVisible();
    expect(within(linha).getByText('Recebida')).toBeVisible();
  });

  it('chip de status filtra na API', async () => {
    const fetchMock = api();
    const { user } = renderTela(fetchMock);
    await screen.findByText('Distribuidora Alfa');
    await user.click(screen.getByRole('button', { name: 'Cancelada' }));
    await waitFor(() => expect(parametros(fetchMock)).toMatchObject({ status: 'CANCELADA' }));
  });

  it('Nova Compra: mostra os campos do inventário', async () => {
    const { user } = renderTela();
    await screen.findByText('Distribuidora Alfa');
    await user.click(screen.getByRole('button', { name: 'Nova Compra' }));
    const modal = await screen.findByRole('dialog', { name: 'Nova Compra (Entrada)' });

    expect(within(modal).getByText('Fornecedor')).toBeVisible();
    expect(within(modal).getByRole('combobox', { name: /Fornecedor/ })).toBeVisible();
    for (const rotulo of ['Numero NF', 'Serie NF', 'Data Emissao', 'Data Entrada']) {
      expect(within(modal).getByLabelText(rotulo)).toBeVisible();
    }
    expect(within(modal).getByText('Buscar produto para adicionar...')).toBeVisible();
    expect(
      within(modal).getByRole('button', { name: 'Novo Produto (cadastrar na entrada)' }),
    ).toBeVisible();
    expect(within(modal).getByLabelText('Frete (R$)')).toBeVisible();
    expect(within(modal).getByLabelText('Desconto (R$)')).toBeVisible();
    expect(within(modal).getByLabelText('Observacoes')).toBeVisible();
    expect(within(modal).getByLabelText('Arquivo da NF (PDF ou imagem)')).toBeVisible();
    expect(within(modal).getByRole('button', { name: 'Cancelar' })).toBeVisible();
    expect(within(modal).getByRole('button', { name: 'Registrar Compra' })).toBeVisible();
  });

  it('Nova Compra: fornecedor e produto são obrigatórios; não envia', async () => {
    const fetchMock = api();
    const { user } = renderTela(fetchMock);
    await screen.findByText('Distribuidora Alfa');
    await user.click(screen.getByRole('button', { name: 'Nova Compra' }));
    const modal = await screen.findByRole('dialog', { name: 'Nova Compra (Entrada)' });
    await user.click(within(modal).getByRole('button', { name: 'Registrar Compra' }));

    expect(await within(modal).findByText('Fornecedor é obrigatório.')).toBeVisible();
    expect(within(modal).getByText('Adicione pelo menos um produto.')).toBeVisible();
    expect(chamadasPara(fetchMock, API).filter(([, init]) => init?.method === 'POST')).toHaveLength(
      0,
    );
  });

  it('Nova Compra: escolhe fornecedor, adiciona produto, vê o total e envia o POST', async () => {
    let corpo: Record<string, unknown> = {};
    const fetchMock = api({
      rotas: {
        [API]: (init) => {
          if (init?.method !== 'POST') return json({ data: COMPRAS, meta: META });
          corpo = JSON.parse(String(init.body)) as Record<string, unknown>;
          return json(compra({ id: '00000000-0000-4000-8000-0000000000c3' }), 201);
        },
      },
    });
    const { user } = renderTela(fetchMock);
    await screen.findByText('Distribuidora Alfa');
    await user.click(screen.getByRole('button', { name: 'Nova Compra' }));
    const modal = await screen.findByRole('dialog', { name: 'Nova Compra (Entrada)' });

    await user.click(within(modal).getByRole('combobox', { name: /Fornecedor/ }));
    await user.click(await screen.findByRole('option', { name: /Distribuidora Alfa/ }));
    await user.click(
      within(modal).getByRole('combobox', { name: 'Buscar produto para adicionar' }),
    );
    await user.click(await screen.findByRole('option', { name: /Cadeira/ }));

    const valor = within(modal).getByLabelText('Valor unitário do item 1');
    await user.clear(valor);
    await user.type(valor, '100');
    await user.clear(within(modal).getByLabelText('Quantidade do item 1'));
    await user.type(within(modal).getByLabelText('Quantidade do item 1'), '3');
    expect(within(modal).getAllByText('R$ 300,00').length).toBeGreaterThan(0);

    await user.click(within(modal).getByRole('button', { name: 'Registrar Compra' }));
    await waitFor(() => expect(corpo.fornecedorId).toBe(FORNECEDOR));
    expect(corpo).toMatchObject({
      dataEntrada: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      itens: [{ produtoId: PRODUTO, descricao: 'Cadeira', quantidade: 3, valorUnitario: 100 }],
    });
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Nova Compra (Entrada)' }),
      ).not.toBeInTheDocument(),
    );
  });

  it('Importar XML: botão desabilitado sem arquivo; "Visualizar Nota" abre a compra preenchida', async () => {
    const previa = {
      numeroNf: '55252',
      serieNf: '1',
      dataEmissao: '2026-11-04',
      fornecedorNome: 'Fornecedor do XML',
      fornecedorDocumento: '12345678000190',
      fornecedorId: null,
      frete: 0,
      desconto: 0,
      itens: [
        {
          codigo: 'CAD-01',
          descricao: 'CADEIRA GOAH POP FLANGE',
          quantidade: 1,
          valorUnitario: 892.51,
          produtoId: null,
        },
      ],
    };
    let enviado = '';
    const fetchMock = api({
      rotas: {
        [`${API}/importar-xml`]: (init) => {
          enviado = (JSON.parse(String(init?.body)) as { xml: string }).xml;
          return json(previa);
        },
      },
    });
    const { user } = renderTela(fetchMock);
    await screen.findByText('Distribuidora Alfa');
    await user.click(screen.getByRole('button', { name: 'Importar XML' }));
    const modal = await screen.findByRole('dialog', { name: 'Importar XML de NF-e' });

    expect(within(modal).getByText('Arquivo XML da Nota Fiscal')).toBeVisible();
    const visualizar = within(modal).getByRole('button', { name: 'Visualizar Nota' });
    expect(visualizar).toBeDisabled();

    const arquivo = new File(['<infNFe></infNFe>'], 'nota.xml', { type: 'text/xml' });
    await user.upload(within(modal).getByLabelText('Arquivo XML da Nota Fiscal'), arquivo);
    await user.click(visualizar);

    const nova = await screen.findByRole('dialog', { name: 'Nova Compra (Entrada)' });
    expect(enviado).toBe('<infNFe></infNFe>');
    expect(within(nova).getByLabelText('Numero NF')).toHaveValue('55252');
    expect(within(nova).getByLabelText('Descrição do item 1')).toHaveValue(
      'CAD-01 - CADEIRA GOAH POP FLANGE',
    );
    expect(within(nova).getByText(/Fornecedor do XML/)).toBeVisible();

    // Produto do item ainda não vinculado: a compra não é enviada.
    await user.click(within(nova).getByRole('button', { name: 'Registrar Compra' }));
    expect(await within(nova).findByText('Produto é obrigatório.')).toBeVisible();
    expect(within(nova).getByText('Fornecedor é obrigatório.')).toBeVisible();
  });

  it('Importar XML: recusa arquivo que não é .xml e mantém o botão desabilitado', async () => {
    const user = userEvent.setup({ applyAccept: false });
    renderApp('/compras', api());
    await screen.findByText('Distribuidora Alfa');
    await user.click(screen.getByRole('button', { name: 'Importar XML' }));
    const modal = await screen.findByRole('dialog', { name: 'Importar XML de NF-e' });
    await user.upload(
      within(modal).getByLabelText('Arquivo XML da Nota Fiscal'),
      new File(['x'], 'nota.pdf', { type: 'application/pdf' }),
    );
    expect(within(modal).getByRole('button', { name: 'Visualizar Nota' })).toBeDisabled();
  });

  it('clicar na linha abre o detalhe com os itens', async () => {
    const { user } = renderTela();
    await user.click(await screen.findByText('Distribuidora Alfa'));
    const detalhe = await screen.findByRole('dialog', { name: 'Compra #1' });
    expect(within(detalhe).getByText('CADEIRA GOAH POP FLANGE')).toBeVisible();
    expect(within(detalhe).getByRole('button', { name: 'Editar' })).toBeVisible();
    expect(within(detalhe).getByRole('button', { name: 'Excluir' })).toBeVisible();
    expect(within(detalhe).getAllByRole('button', { name: 'Fechar' }).length).toBeGreaterThan(0);
  });

  it('menu de ações tem "Ver detalhes"', async () => {
    const { user } = renderTela();
    const linha = (await screen.findByText('Distribuidora Alfa')).closest('tr') as HTMLElement;
    await user.click(within(linha).getByRole('button', { name: 'Ações' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Ver detalhes' }));
    expect(await screen.findByRole('dialog', { name: 'Compra #1' })).toBeVisible();
  });

  it('cancelar compra pede confirmação e chama POST /:id/cancelar', async () => {
    const fetchMock = api({
      rotas: {
        [`${API}/${ID_1}/cancelar`]: () => json(compra({ status: 'CANCELADA' })),
      },
    });
    const { user } = renderTela(fetchMock);
    await user.click(await screen.findByText('Distribuidora Alfa'));
    const detalhe = await screen.findByRole('dialog', { name: 'Compra #1' });
    await user.click(within(detalhe).getByRole('button', { name: 'Cancelar compra' }));
    const confirmacao = await screen.findByRole('alertdialog');
    await user.click(within(confirmacao).getByRole('button', { name: 'Cancelar compra' }));
    await waitFor(() => expect(chamadasPara(fetchMock, `${API}/${ID_1}/cancelar`)).toHaveLength(1));
  });

  it('excluir pede confirmação e chama DELETE', async () => {
    const fetchMock = api({
      rotas: {
        [`${API}/${ID_1}`]: () => json(compra({})),
      },
    });
    const { user } = renderTela(fetchMock);
    await user.click(await screen.findByText('Distribuidora Alfa'));
    const detalhe = await screen.findByRole('dialog', { name: 'Compra #1' });
    await user.click(within(detalhe).getByRole('button', { name: 'Excluir' }));
    const confirmacao = await screen.findByRole('alertdialog');
    await user.click(within(confirmacao).getByRole('button', { name: 'Excluir' }));
    await waitFor(() =>
      expect(
        chamadasPara(fetchMock, `${API}/${ID_1}`).filter(([, i]) => i?.method === 'DELETE'),
      ).toHaveLength(1),
    );
  });

  it('editar abre o modal com os dados da compra', async () => {
    const { user } = renderTela();
    await user.click(await screen.findByText('Distribuidora Alfa'));
    const detalhe = await screen.findByRole('dialog', { name: 'Compra #1' });
    await user.click(within(detalhe).getByRole('button', { name: 'Editar' }));
    const modal = await screen.findByRole('dialog', { name: 'Editar Compra' });
    expect(within(modal).getByLabelText('Numero NF')).toHaveValue('55252');
    expect(within(modal).getByLabelText('Descrição do item 1')).toHaveValue(
      'CADEIRA GOAH POP FLANGE',
    );
  });
});
