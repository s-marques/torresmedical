import {
  PERMISSOES,
  type MovimentacaoEstoque,
  type PosicaoEstoque,
  type SugestaoCompra,
} from '@torres/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { apiFalsa, chamadasPara, json, renderApp, USUARIO_TESTE } from '@/test/render-app';

// Tela com abas, modais e comboboxes: estoura os 5 s padrão no CI (cobertura).
vi.setConfig({ testTimeout: 20_000 });

const BASE = '/api/compras-estoque/estoque';
const POSICAO = `${BASE}/posicao`;
const MOVIMENTACOES = `${BASE}/movimentacoes`;
const SUGESTAO = `${BASE}/sugestao`;
const PRODUTO = '00000000-0000-4000-8000-0000000000a1';
const PRODUTO_2 = '00000000-0000-4000-8000-0000000000a2';
const FORNECEDOR = '00000000-0000-4000-8000-0000000000f1';

const META = { page: 1, pageSize: 20, total: 2, totalPages: 1 };

const RESUMO = {
  totalProdutos: 220,
  controlados: 202,
  abaixoMinimo: 3,
  zerados: 36,
  valorEstoque: '100756.90',
  vencendo30d: null,
  vencidos: null,
  movimentacoes24h: 5,
};

function posicao(parcial: Partial<PosicaoEstoque>): PosicaoEstoque {
  return {
    id: PRODUTO,
    nome: 'Luva Nitrílica',
    descricao: null,
    sku: 'LUV-01',
    categoriaNome: 'Descartáveis',
    controlaEstoque: true,
    estoqueAtual: '12.5',
    estoqueMinimo: '5',
    status: 'OK',
    valorEstoque: '37.50',
    ultimaMovimentacao: '2026-11-10T15:00:00.000Z',
    ...parcial,
  };
}

const POSICOES = [
  posicao({}),
  posicao({
    id: PRODUTO_2,
    nome: 'Brinde Caneca',
    sku: null,
    categoriaNome: null,
    controlaEstoque: false,
    status: 'SEM_CONTROLE',
    valorEstoque: null,
    ultimaMovimentacao: null,
  }),
];

function movimentacao(parcial: Partial<MovimentacaoEstoque>): MovimentacaoEstoque {
  return {
    id: '00000000-0000-4000-8000-0000000000d1',
    data: '2026-11-13T17:45:00.000Z',
    tipo: 'SAIDA',
    produtoId: PRODUTO,
    produtoNome: 'Luva Nitrílica',
    produtoSku: 'LUV-01',
    quantidade: '4',
    saldoAnterior: '16.5',
    saldoPosterior: '12.5',
    motivo: 'Uso Interno',
    documento: null,
    custoUnitario: null,
    lote: null,
    validade: null,
    fornecedorId: null,
    fornecedorNome: null,
    compraId: null,
    usuarioId: USUARIO_TESTE.id,
    ...parcial,
  };
}

const MOVS = [
  movimentacao({}),
  movimentacao({
    id: '00000000-0000-4000-8000-0000000000d2',
    tipo: 'AJUSTE',
    produtoNome: 'Gaze Estéril',
    produtoSku: null,
    quantidade: '2',
    saldoAnterior: '5',
    saldoPosterior: '3',
    motivo: 'Contagem',
  }),
];

const SUGESTOES: SugestaoCompra[] = [
  {
    id: PRODUTO,
    nome: 'Luva Nitrílica',
    sku: 'LUV-01',
    categoriaNome: 'Descartáveis',
    prioridade: 'CRITICO',
    estoqueAtual: '0',
    estoqueMinimo: '5',
    qtdSugerida: 35,
    diasParaAcabar: 0,
    custoUnitario: '1.25',
    custoTotal: '43.75',
    fornecedorNome: 'Distribuidora Alfa',
  },
];

const lookup = (data: { id: string; label: string }[]) =>
  json({ data: data.map((d) => ({ ...d, descricao: null })), meta: META });

function api(rotas: Record<string, (init?: RequestInit) => Response> = {}, permissoes?: string[]) {
  return apiFalsa({
    usuario: permissoes
      ? { ...USUARIO_TESTE, permissoes: permissoes as typeof USUARIO_TESTE.permissoes }
      : USUARIO_TESTE,
    rotas: {
      [`${BASE}/resumo`]: () => json(RESUMO),
      [`${BASE}/alertas`]: () => json({ abaixoMinimo: [posicao({ status: 'BAIXO' })] }),
      [POSICAO]: () => json({ data: POSICOES, meta: META }),
      [MOVIMENTACOES]: () => json({ data: MOVS, meta: META }),
      [SUGESTAO]: () => json({ data: SUGESTOES, meta: { ...META, total: 1 } }),
      '/api/lookups/categorias': () => lookup([{ id: 'c1', label: 'Descartáveis' }]),
      '/api/lookups/produtos': () => lookup([{ id: PRODUTO, label: 'Luva Nitrílica' }]),
      '/api/lookups/fornecedores': () => lookup([{ id: FORNECEDOR, label: 'Distribuidora Alfa' }]),
      ...rotas,
    },
  });
}

function renderTela(fetchMock = api()) {
  return { user: userEvent.setup(), ...renderApp('/estoque', fetchMock) };
}

function ultimaQuery(fetchMock: ReturnType<typeof apiFalsa>, caminho: string) {
  const [url] = chamadasPara(fetchMock, caminho).at(-1) ?? [''];
  return Object.fromEntries(new URL(url, 'http://x').searchParams);
}

function posts(fetchMock: ReturnType<typeof apiFalsa>, caminho: string) {
  return chamadasPara(fetchMock, caminho).filter(([, init]) => init?.method === 'POST');
}

const cabecalhos = async () =>
  within(await screen.findByRole('table'))
    .getAllByRole('columnheader')
    .map((c) => c.textContent);

describe('Estoque (/estoque)', () => {
  it('mostra título, botões, cards e a aba Posição com as colunas do inventário', async () => {
    renderTela();

    expect(await screen.findByRole('heading', { name: 'Estoque' })).toBeInTheDocument();
    expect(screen.getByText('Gerenciamento de estoque e inventário.')).toBeVisible();
    for (const nome of ['Entrada', 'Saída', 'Ajuste']) {
      expect(screen.getByRole('button', { name: nome })).toBeVisible();
    }
    const cards = screen.getByRole('region', { name: 'Resumo do estoque' });
    expect(await within(cards).findByText('220')).toBeVisible();
    expect(within(cards).getByText('36')).toHaveClass('text-destructive');
    expect(within(cards).getByText('R$ 100.756,90')).toBeVisible();
    expect(within(cards).getAllByText('—')).toHaveLength(2);

    for (const aba of ['Posição', 'Movimentações', 'Ajustes', 'Alertas', 'Sugestão']) {
      expect(screen.getByRole('tab', { name: aba })).toBeVisible();
    }
    expect(await cabecalhos()).toEqual([
      'Produto',
      'Descrição',
      'SKU',
      'Categoria',
      'Estoque Atual',
      'Mínimo',
      'Status',
      'Valor Estoque',
      'Último Mov.',
    ]);
    for (const chip of ['Todos', 'OK', 'Baixo', 'Zerado']) {
      expect(screen.getByRole('button', { name: chip })).toBeVisible();
    }
    expect(screen.getByPlaceholderText('Buscar produto...')).toBeVisible();
  });

  it('formata a linha e mostra "Sem Controle"', async () => {
    renderTela();
    const linha = (await screen.findByText('Luva Nitrílica')).closest('tr') as HTMLElement;
    expect(within(linha).getByText('12,5')).toBeVisible();
    expect(within(linha).getByText('R$ 37,50')).toBeVisible();
    expect(within(linha).getByText('10/11/2026')).toBeVisible();
    const brinde = screen.getByText('Brinde Caneca').closest('tr') as HTMLElement;
    expect(within(brinde).getByText('Sem Controle')).toBeVisible();
  });

  it('chip de status e busca filtram na API', async () => {
    const fetchMock = api();
    const { user } = renderTela(fetchMock);
    await screen.findByText('Luva Nitrílica');
    await user.click(screen.getByRole('button', { name: 'Baixo' }));
    await waitFor(() => expect(ultimaQuery(fetchMock, POSICAO)).toMatchObject({ status: 'BAIXO' }));
    await user.type(screen.getByPlaceholderText('Buscar produto...'), 'luv');
    await waitFor(() => expect(ultimaQuery(fetchMock, POSICAO)).toMatchObject({ search: 'luv' }));
  });

  it('Entrada Manual: campos do inventário, obrigatórios e envio do POST', async () => {
    let corpo: Record<string, unknown> = {};
    const fetchMock = api({
      [`${BASE}/entradas`]: (init) => {
        corpo = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return json(movimentacao({ tipo: 'ENTRADA' }), 201);
      },
    });
    const { user } = renderTela(fetchMock);
    await screen.findByText('Luva Nitrílica');
    await user.click(screen.getByRole('button', { name: 'Entrada' }));
    const modal = await screen.findByRole('dialog', { name: 'Entrada Manual' });

    for (const rotulo of ['Quantidade', 'Custo Unitário (R$)', 'Lote', 'Validade', 'Documento']) {
      expect(within(modal).getByLabelText(new RegExp(rotulo.replace(/[()$]/g, '.')))).toBeVisible();
    }
    expect(within(modal).getByRole('combobox', { name: /Produto/ })).toBeVisible();
    expect(within(modal).getByRole('combobox', { name: /Fornecedor/ })).toBeVisible();
    expect(within(modal).getByRole('combobox', { name: /Motivo/ })).toHaveTextContent('Compra');

    await user.click(within(modal).getByRole('button', { name: 'Registrar Entrada' }));
    expect(await within(modal).findByText('Produto é obrigatório.')).toBeVisible();
    expect(within(modal).getByText('Quantidade é obrigatória.')).toBeVisible();
    expect(posts(fetchMock, `${BASE}/entradas`)).toHaveLength(0);

    await user.click(within(modal).getByRole('combobox', { name: /Produto/ }));
    await user.click(await screen.findByRole('option', { name: /Luva Nitrílica/ }));
    await user.type(within(modal).getByLabelText(/^Quantidade/), '5');
    await user.type(within(modal).getByLabelText('Lote'), 'L-01');
    await user.click(within(modal).getByRole('button', { name: 'Registrar Entrada' }));

    await waitFor(() =>
      expect(corpo).toMatchObject({
        produtoId: PRODUTO,
        quantidade: 5,
        motivo: 'COMPRA',
        lote: 'L-01',
      }),
    );
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Entrada Manual' })).not.toBeInTheDocument(),
    );
  });

  it('Saída Manual: o erro de saldo insuficiente aparece no campo Quantidade', async () => {
    const mensagem = 'Estoque insuficiente. Saldo atual: 2.';
    const fetchMock = api({
      [`${BASE}/saidas`]: () =>
        json(
          {
            statusCode: 400,
            code: 'ESTOQUE_INSUFICIENTE',
            message: mensagem,
            details: [{ field: 'quantidade', message: mensagem }],
          },
          400,
        ),
    });
    const { user } = renderTela(fetchMock);
    await screen.findByText('Luva Nitrílica');
    await user.click(screen.getByRole('button', { name: 'Saída' }));
    const modal = await screen.findByRole('dialog', { name: 'Saída Manual' });
    expect(within(modal).getByRole('combobox', { name: /Motivo/ })).toHaveTextContent(
      'Uso Interno',
    );

    await user.click(within(modal).getByRole('combobox', { name: /Produto/ }));
    await user.click(await screen.findByRole('option', { name: /Luva Nitrílica/ }));
    await user.type(within(modal).getByLabelText(/^Quantidade/), '3');
    await user.click(within(modal).getByRole('button', { name: 'Registrar Saída' }));

    expect(await within(modal).findByText(mensagem)).toBeVisible();
    expect(screen.getByRole('dialog', { name: 'Saída Manual' })).toBeVisible();
  });

  it('botão Ajuste abre a aba Ajustes; o ajuste valida e envia o POST', async () => {
    let corpo: Record<string, unknown> = {};
    const fetchMock = api({
      [`${BASE}/ajustes`]: (init) => {
        corpo = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return json(movimentacao({ tipo: 'AJUSTE' }), 201);
      },
    });
    const { user } = renderTela(fetchMock);
    await screen.findByText('Luva Nitrílica');
    await user.click(screen.getByRole('button', { name: 'Ajuste' }));
    expect(screen.getByRole('tab', { name: 'Ajustes' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Ajuste Individual')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Ajustar' }));
    expect(await screen.findByText('Produto é obrigatório.')).toBeVisible();
    expect(screen.getByText('Quantidade real é obrigatória.')).toBeVisible();
    expect(screen.getByText('Motivo é obrigatório.')).toBeVisible();

    await user.click(screen.getByRole('combobox', { name: /Produto/ }));
    await user.click(await screen.findByRole('option', { name: /Luva Nitrílica/ }));
    await user.type(screen.getByLabelText(/^Quantidade Real/), '7');
    await user.type(screen.getByLabelText(/^Motivo/), 'Inventário mensal');
    await user.click(screen.getByRole('button', { name: 'Ajustar' }));
    await waitFor(() =>
      expect(corpo).toEqual({
        produtoId: PRODUTO,
        quantidadeReal: 7,
        motivo: 'Inventário mensal',
      }),
    );
  });

  it('aba Movimentações: colunas, nome e SKU do produto, sinal do ajuste e filtro por tipo', async () => {
    const fetchMock = api();
    const { user } = renderTela(fetchMock);
    await screen.findByText('Luva Nitrílica');
    await user.click(screen.getByRole('tab', { name: 'Movimentações' }));

    expect(await screen.findByText('Gaze Estéril')).toBeVisible();
    expect(await cabecalhos()).toEqual([
      'Data',
      'Produto',
      'Tipo',
      'Quantidade',
      'Motivo',
      'Documento',
    ]);
    expect(screen.getByText('SKU LUV-01')).toBeVisible();
    const ajuste = screen.getByText('Gaze Estéril').closest('tr') as HTMLElement;
    expect(within(ajuste).getByText('-2')).toBeVisible();
    expect(screen.getByPlaceholderText('Buscar produto por nome ou SKU...')).toBeVisible();

    // O chip fica no painel da aba; o botão "Saída" do cabeçalho abre o modal.
    await user.click(within(screen.getByRole('tabpanel')).getByRole('button', { name: 'Saída' }));
    await waitFor(() =>
      expect(ultimaQuery(fetchMock, MOVIMENTACOES)).toMatchObject({ tipo: 'SAIDA' }),
    );
  });

  it('aba Alertas: produtos abaixo do mínimo e o aviso de lotes', async () => {
    const { user } = renderTela();
    await screen.findByText('Luva Nitrílica');
    await user.click(screen.getByRole('tab', { name: 'Alertas' }));
    expect(await screen.findByText('Produtos Abaixo do Mínimo')).toBeVisible();
    expect(await screen.findByText('Baixo')).toBeVisible();
    expect(screen.getByText('Lotes Vencendo')).toBeVisible();
    expect(screen.getByText('Controle de lotes ainda não disponível.')).toBeVisible();
  });

  it('aba Alertas vazia mostra a mensagem do inventário', async () => {
    const { user } = renderTela(api({ [`${BASE}/alertas`]: () => json({ abaixoMinimo: [] }) }));
    await screen.findByText('Luva Nitrílica');
    await user.click(screen.getByRole('tab', { name: 'Alertas' }));
    expect(await screen.findByText('Nenhum produto abaixo do mínimo.')).toBeVisible();
  });

  it('aba Sugestão: colunas com o produto, exportação e filtro por prioridade', async () => {
    const fetchMock = api();
    const { user } = renderTela(fetchMock);
    await screen.findByText('Luva Nitrílica');
    await user.click(screen.getByRole('tab', { name: 'Sugestão' }));

    expect(await screen.findByText('Distribuidora Alfa')).toBeVisible();
    expect(await cabecalhos()).toEqual([
      'Prioridade',
      'Produto',
      'SKU',
      'Categoria',
      'Atual',
      'Mínimo',
      'Qtd Sugerida',
      'Dias p/ Acabar',
      'Custo Unit.',
      'Custo Total',
      'Fornecedor',
    ]);
    const linha = screen.getByText('Distribuidora Alfa').closest('tr') as HTMLElement;
    expect(within(linha).getByText('Luva Nitrílica')).toBeVisible();
    expect(within(linha).getByText('R$ 43,75')).toBeVisible();
    expect(within(linha).getByText('0d')).toBeVisible();
    expect(screen.getByRole('button', { name: /Exportar/ })).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Urgente' }));
    await waitFor(() =>
      expect(ultimaQuery(fetchMock, SUGESTAO)).toMatchObject({ prioridade: 'URGENTE' }),
    );
  });

  it('sem permissão de criar e editar: esconde Entrada, Saída, Ajuste e a aba Ajustes', async () => {
    renderTela(
      api(
        {},
        PERMISSOES.filter((p) => p === 'compras-estoque.estoque.ver'),
      ),
    );
    expect(await screen.findByText('Luva Nitrílica')).toBeVisible();
    for (const nome of ['Entrada', 'Saída', 'Ajuste']) {
      expect(screen.queryByRole('button', { name: nome })).not.toBeInTheDocument();
    }
    expect(screen.queryByRole('tab', { name: 'Ajustes' })).not.toBeInTheDocument();
  });
});
