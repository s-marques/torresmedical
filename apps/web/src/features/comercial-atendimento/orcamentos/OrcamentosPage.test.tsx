import { type Orcamento } from '@torres/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { apiFalsa, chamadasPara, json, renderApp } from '@/test/render-app';

vi.setConfig({ testTimeout: 20_000 });

const API = '/api/comercial-atendimento/orcamentos';
const ID_1 = '00000000-0000-4000-8000-0000000000d1';
const ID_2 = '00000000-0000-4000-8000-0000000000d2';
const SERVICO = '00000000-0000-4000-8000-0000000000a1';
const PROTOCOLO = '00000000-0000-4000-8000-0000000000a2';

function orcamento(parcial: Partial<Orcamento>): Orcamento {
  return {
    id: ID_1,
    numero: 1,
    data: '2026-10-14T12:00:00.000Z',
    pacienteId: null,
    cliente: 'Cliente Teste',
    formaPagamentoId: null,
    formaPagamento: null,
    observacoes: null,
    descontoTipo: 'valor',
    descontoValor: '0',
    subtotal: '450',
    total: '450',
    status: 'PENDENTE',
    itens: [],
    ...parcial,
  };
}

const ORCAMENTOS = [
  orcamento({}),
  orcamento({ id: ID_2, numero: 2, cliente: null, total: '1200.5', status: 'APROVADO' }),
];

const CATALOGOS: Record<string, unknown[]> = {
  servico: [{ id: SERVICO, nome: 'Acupuntura', detalhe: 'Prof. Teste', valor: 250 }],
  protocolo: [{ id: PROTOCOLO, nome: 'Protocolo Verão', detalhe: 'Geral', valor: 900 }],
  'protocolo-mae': [],
};

function pagina<T>(data: T[]) {
  return json({ data, meta: { page: 1, pageSize: 10, total: data.length, totalPages: 1 } });
}

function parametros(fetchMock: ReturnType<typeof apiFalsa>, caminho = API) {
  const [url] = chamadasPara(fetchMock, caminho).at(-1) ?? [''];
  return Object.fromEntries(new URL(url, 'http://x').searchParams);
}

function apiOrcamentos(aoCriar?: (corpo: unknown) => void) {
  return apiFalsa({
    rotas: {
      [API]: (init) => {
        if (init?.method !== 'POST') return pagina(ORCAMENTOS);
        aoCriar?.(JSON.parse(String(init.body)));
        return json(orcamento({ id: '00000000-0000-4000-8000-0000000000d3', numero: 3 }), 201);
      },
      [`${API}/catalogo`]: () => {
        const tipo = new URLSearchParams(new URL(fetchMockUrl(), 'http://x').search).get('tipo');
        return pagina(CATALOGOS[tipo ?? 'servico'] ?? []);
      },
      '/api/lookups/pacientes': () => pagina([]),
      '/api/lookups/formas-pagamento': () => pagina([]),
    },
  });
}

// O catálogo responde pelo `tipo` da última chamada feita a ele.
let fetchMockAtual: ReturnType<typeof apiFalsa> | undefined;
function fetchMockUrl(): string {
  return chamadasPara(fetchMockAtual!, `${API}/catalogo`).at(-1)?.[0] ?? '';
}

function renderTela(fetchMock = apiOrcamentos()) {
  fetchMockAtual = fetchMock;
  return { user: userEvent.setup(), ...renderApp('/orcamentos', fetchMock) };
}

describe('Orçamentos (/orcamentos)', () => {
  it('mostra título, ações, colunas, status e valores formatados', async () => {
    renderTela();

    expect(await screen.findByRole('heading', { name: 'Orçamentos' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Novo Orçamento' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Colunas' })).toBeVisible();
    expect(screen.getByPlaceholderText('Buscar por cliente...')).toBeVisible();
    for (const chip of ['Todos', 'Pendente', 'Aprovado', 'Concluído', 'Cancelado']) {
      expect(screen.getByRole('button', { name: chip })).toBeVisible();
    }
    const cabecalhos = within(await screen.findByRole('table')).getAllByRole('columnheader');
    expect(cabecalhos.map((c) => c.textContent)).toEqual([
      '#',
      'Data',
      'Cliente',
      'Total',
      'Status',
    ]);
    const primeira = (await screen.findByText('Cliente Teste')).closest('tr') as HTMLElement;
    expect(within(primeira).getByText(/450,00/)).toBeVisible();
    expect(within(primeira).getByText('Pendente')).toBeVisible();
    const segunda = screen.getByText('Aprovado', { selector: 'td *' }).closest('tr') as HTMLElement;
    expect(within(segunda).getByText(/1\.200,50/)).toBeVisible();
  });

  it('chips de status, busca e ordenação chamam a API', async () => {
    const { fetchMock, user } = renderTela();
    await screen.findByText('Cliente Teste');

    await user.click(screen.getByRole('button', { name: 'Concluído' }));
    await waitFor(() => expect(parametros(fetchMock)).toMatchObject({ status: 'concluido' }));
    await user.click(screen.getByRole('button', { name: 'Cancelado' }));
    await waitFor(() => expect(parametros(fetchMock)).toMatchObject({ status: 'cancelado' }));
    await user.click(screen.getByRole('button', { name: 'Cliente' }));
    await waitFor(() => expect(parametros(fetchMock)).toMatchObject({ sort: 'cliente:asc' }));
    await user.type(screen.getByPlaceholderText('Buscar por cliente...'), 'ana');
    await waitFor(() => expect(parametros(fetchMock)).toMatchObject({ search: 'ana' }));
  });

  it('Novo Orçamento: campos e abas do modal', async () => {
    const { user } = renderTela();
    await screen.findByText('Cliente Teste');

    await user.click(screen.getByRole('button', { name: 'Novo Orçamento' }));
    const modal = await screen.findByRole('dialog', { name: 'Novo Orçamento' });

    expect(within(modal).getByText('Cliente')).toBeVisible();
    expect(within(modal).getByText('Forma de Pagamento')).toBeVisible();
    expect(within(modal).getByLabelText('Observações')).toBeVisible();
    for (const aba of ['Serviços', 'Protocolos', 'Protocolos Mãe']) {
      expect(within(modal).getByRole('tab', { name: aba })).toBeVisible();
    }
    expect(await within(modal).findByText('Acupuntura')).toBeVisible();
    expect(within(modal).getByText('(Prof. Teste)')).toBeVisible();
    await user.click(within(modal).getByRole('tab', { name: 'Protocolos' }));
    expect(await within(modal).findByText('Protocolo Verão')).toBeVisible();
    await user.click(within(modal).getByRole('tab', { name: 'Protocolos Mãe' }));
    expect(await within(modal).findByText('Nenhum protocolos mãe encontrado')).toBeVisible();
  });

  it('Criar Orçamento sem itens mostra "Adicione ao menos um item." e não envia', async () => {
    const { fetchMock, user } = renderTela();
    await screen.findByText('Cliente Teste');

    await user.click(screen.getByRole('button', { name: 'Novo Orçamento' }));
    const modal = await screen.findByRole('dialog', { name: 'Novo Orçamento' });
    await user.click(within(modal).getByRole('button', { name: 'Criar Orçamento' }));

    expect(await within(modal).findByRole('alert')).toHaveTextContent('Adicione ao menos um item.');
    expect(await screen.findAllByText('Adicione ao menos um item.')).not.toHaveLength(0);
    expect(chamadasPara(fetchMock, API).filter(([, i]) => i?.method === 'POST')).toHaveLength(0);
  });

  it('adiciona itens, soma a quantidade do repetido e calcula subtotal, desconto e total', async () => {
    let corpo: unknown;
    const { user } = renderTela(apiOrcamentos((c) => (corpo = c)));
    await screen.findByText('Cliente Teste');

    await user.click(screen.getByRole('button', { name: 'Novo Orçamento' }));
    const modal = await screen.findByRole('dialog', { name: 'Novo Orçamento' });
    await user.click(await within(modal).findByRole('button', { name: /Acupuntura/ }));
    await user.click(within(modal).getByRole('button', { name: /Acupuntura/ }));

    expect(within(modal).getByLabelText('Quantidade do item 1')).toHaveValue(2);
    expect(within(modal).getByLabelText('Descrição do item 1')).toHaveValue('Acupuntura');
    expect(within(modal).getByLabelText('Valor unitário do item 1')).toHaveValue(250);
    expect(within(modal).getByText('Subtotal:').nextSibling).toHaveTextContent(/500,00/);

    await user.clear(within(modal).getByLabelText('Desconto geral'));
    await user.type(within(modal).getByLabelText('Desconto geral'), '50');
    expect(within(modal).getByText('TOTAL:').nextSibling).toHaveTextContent(/450,00/);

    await user.click(within(modal).getByRole('button', { name: 'Criar Orçamento' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(corpo).toEqual({
      pacienteId: null,
      formaPagamentoId: null,
      observacoes: null,
      descontoTipo: 'valor',
      descontoValor: 50,
      itens: [
        {
          origem: 'servico',
          origemId: SERVICO,
          descricao: 'Acupuntura',
          quantidade: 2,
          valorUnitario: 250,
          desconto: 0,
        },
      ],
    });
  });

  it('remove um item pela lixeira e esconde a tabela de totais', async () => {
    const { user } = renderTela();
    await screen.findByText('Cliente Teste');

    await user.click(screen.getByRole('button', { name: 'Novo Orçamento' }));
    const modal = await screen.findByRole('dialog', { name: 'Novo Orçamento' });
    await user.click(await within(modal).findByRole('button', { name: /Acupuntura/ }));
    await user.click(within(modal).getByRole('button', { name: 'Remover item 1' }));

    expect(within(modal).queryByText('TOTAL:')).not.toBeInTheDocument();
  });
});
