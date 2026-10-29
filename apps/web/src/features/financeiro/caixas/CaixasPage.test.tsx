import { type Caixa } from '@torres/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { apiFalsa, chamadasPara, json, renderApp } from '@/test/render-app';

vi.setConfig({ testTimeout: 20_000 });

const API = '/api/financeiro/caixas';
const ID_1 = '00000000-0000-4000-8000-0000000000d1';
const ID_2 = '00000000-0000-4000-8000-0000000000d2';
const OPERADOR = '00000000-0000-4000-8000-0000000000e1';

function caixa(parcial: Partial<Caixa>): Caixa {
  return {
    id: ID_1,
    numero: 1,
    nome: 'Caixa Manhã',
    operadorId: OPERADOR,
    operador: 'Operadora Teste',
    dataAbertura: '2026-10-14T12:00:00.000Z',
    dataFechamento: null,
    valorAbertura: '150.50',
    valorFechamento: null,
    quebra: null,
    status: 'ABERTO',
    ...parcial,
  };
}

const CAIXAS = [
  caixa({}),
  caixa({
    id: ID_2,
    numero: 2,
    nome: 'Caixa Tarde',
    status: 'FECHADO',
    dataFechamento: '2026-10-14T20:00:00.000Z',
    valorFechamento: '300',
    quebra: '-5',
  }),
];

function pagina<T>(data: T[]) {
  return json({ data, meta: { page: 1, pageSize: 10, total: data.length, totalPages: 1 } });
}

function parametros(fetchMock: ReturnType<typeof apiFalsa>) {
  const [url] = chamadasPara(fetchMock, API).at(-1) ?? [''];
  return Object.fromEntries(new URL(url, 'http://x').searchParams);
}

function renderTela(fetchMock = apiFalsa({ rotas: { [API]: () => pagina(CAIXAS) } })) {
  return { fetchMock, user: userEvent.setup(), ...renderApp('/caixas', fetchMock) };
}

describe('Caixas (/caixas)', () => {
  it('mostra título, ações, colunas e valores formatados', async () => {
    renderTela();

    expect(await screen.findByRole('heading', { name: 'Caixas' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Abrir Caixa' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Exportar' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Colunas' })).toBeVisible();
    expect(screen.getByPlaceholderText('Buscar caixas...')).toBeVisible();
    const cabecalhos = within(await screen.findByRole('table')).getAllByRole('columnheader');
    expect(cabecalhos.map((c) => c.textContent)).toEqual([
      '#',
      'Nome',
      'Operador',
      'Abertura',
      'Fechamento',
      'Vl. Abertura',
      'Vl. Fechamento',
      'Quebra',
      'Status',
    ]);
    const aberto = (await screen.findByText('Caixa Manhã')).closest('tr') as HTMLElement;
    expect(within(aberto).getByText(/150,50/)).toBeVisible();
    expect(within(aberto).getByText('Aberto')).toBeVisible();
    const fechado = screen.getByText('Caixa Tarde').closest('tr') as HTMLElement;
    expect(within(fechado).getByText('Fechado')).toBeVisible();
    expect(within(fechado).getByText(/300,00/)).toBeVisible();
  });

  it('chips de status e ordenação chamam a API', async () => {
    const { fetchMock, user } = renderTela();
    await screen.findByText('Caixa Manhã');

    await user.click(screen.getByRole('button', { name: 'Aberto' }));
    await waitFor(() => expect(parametros(fetchMock)).toMatchObject({ status: 'aberto' }));
    await user.click(screen.getByRole('button', { name: 'Fechado' }));
    await waitFor(() => expect(parametros(fetchMock)).toMatchObject({ status: 'fechado' }));
    await user.click(screen.getByRole('button', { name: 'Operador' }));
    await waitFor(() => expect(parametros(fetchMock)).toMatchObject({ sort: 'operador:asc' }));
  });

  it('seção Aguardando pagamento: Receber mostra a mensagem de recebido', async () => {
    const { user } = renderTela();
    expect(await screen.findByText('Aguardando pagamento')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Receber' }));

    expect(await screen.findByText('Recebimento realizado com sucesso.')).toBeVisible();
  });

  it('Abrir Caixa: Nome e Valor de abertura são obrigatórios e nada é enviado', async () => {
    const { fetchMock, user } = renderTela();
    await screen.findByText('Caixa Manhã');

    await user.click(screen.getByRole('button', { name: 'Abrir Caixa' }));
    const modal = await screen.findByRole('dialog', { name: 'Abrir Caixa' });
    await user.click(within(modal).getByRole('button', { name: 'Abrir' }));

    expect(await within(modal).findByText('Nome é obrigatório.')).toBeVisible();
    expect(await within(modal).findByText('Valor de abertura é obrigatório.')).toBeVisible();
    expect(chamadasPara(fetchMock, API).filter(([, i]) => i?.method === 'POST')).toHaveLength(0);
  });

  it('Abrir Caixa: envia nome e valor, fecha e recarrega a lista', async () => {
    let corpo: unknown;
    const fetchMock = apiFalsa({
      rotas: {
        [API]: (init) => {
          if (init?.method !== 'POST') return pagina(CAIXAS);
          corpo = JSON.parse(String(init.body));
          return json(caixa({ id: '00000000-0000-4000-8000-0000000000d3', nome: 'Novo' }), 201);
        },
      },
    });
    const { user } = renderTela(fetchMock);
    await screen.findByText('Caixa Manhã');

    await user.click(screen.getByRole('button', { name: 'Abrir Caixa' }));
    const modal = await screen.findByRole('dialog', { name: 'Abrir Caixa' });
    await user.type(within(modal).getByLabelText(/Nome/), 'Novo');
    await user.type(within(modal).getByLabelText(/Valor de abertura/), '10000');
    await user.click(within(modal).getByRole('button', { name: 'Abrir' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(corpo).toEqual({ nome: 'Novo', valorAbertura: 100 });
  });
});
