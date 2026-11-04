import type { ConsultaRealizada, Venda } from '@torres/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { apiFalsa, chamadasPara, json, renderApp } from '@/test/render-app';

vi.setConfig({ testTimeout: 20_000 });

const API = '/api/comercial-atendimento/vendas';
const CONSULTAS = `${API}/consultas`;
const ID_1 = '00000000-0000-4000-8000-0000000000d1';
const ID_2 = '00000000-0000-4000-8000-0000000000d2';
const PRODUTO = '00000000-0000-4000-8000-0000000000a1';
const PROTOCOLO = '00000000-0000-4000-8000-0000000000a2';

function consulta(parcial: Partial<ConsultaRealizada>): ConsultaRealizada {
  return {
    id: ID_1,
    data: '2026-10-10T11:00:00.000Z',
    pacienteId: ID_1,
    paciente: 'Paciente Teste',
    pacienteTelefone: '11900000000',
    profissional: 'Profissional Teste',
    tipo: 'Procedimento',
    valor: '295',
    pago: false,
    formaPagamento: null,
    ...parcial,
  };
}

function venda(parcial: Partial<Venda>): Venda {
  return {
    id: ID_1,
    numero: 7,
    data: '2026-10-14T12:00:00.000Z',
    pacienteId: null,
    cliente: 'Cliente Teste',
    formaPagamentoId: null,
    formaPagamento: 'Pix',
    parcelas: 1,
    desconto: '0',
    subtotal: '500',
    total: '500',
    status: 'FINALIZADA',
    itens: [],
    ...parcial,
  };
}

const CONSULTAS_API = [
  consulta({}),
  consulta({
    id: ID_2,
    paciente: 'Outra Paciente',
    tipo: 'Consulta',
    valor: '0',
    pago: true,
    formaPagamento: 'Voucher',
  }),
];

const CATALOGOS: Record<string, unknown[]> = {
  produto: [{ id: PRODUTO, nome: 'Soro Teste', detalhe: 'Infusão', valor: 250 }],
  protocolo: [{ id: PROTOCOLO, nome: 'Protocolo Verão', detalhe: 'Geral', valor: 900 }],
};

function pagina<T>(data: T[]) {
  return json({ data, meta: { page: 1, pageSize: 10, total: data.length, totalPages: 1 } });
}

function parametros(fetchMock: ReturnType<typeof apiFalsa>, caminho: string) {
  const [url] = chamadasPara(fetchMock, caminho).at(-1) ?? [''];
  return Object.fromEntries(new URL(url, 'http://x').searchParams);
}

let fetchMockAtual: ReturnType<typeof apiFalsa> | undefined;

function apiVendas(aoCriar?: (corpo: unknown) => void, consultas = CONSULTAS_API) {
  return apiFalsa({
    rotas: {
      [CONSULTAS]: () => pagina(consultas),
      [`${CONSULTAS}/totais`]: () =>
        json({ totalConsultas: 44, valorTotal: '10325', recebido: '1000' }),
      [API]: (init) => {
        if (init?.method !== 'POST') return pagina([venda({})]);
        aoCriar?.(JSON.parse(String(init.body)));
        return json(venda({ id: ID_2, numero: 8 }), 201);
      },
      [`${API}/catalogo`]: () => {
        const url = chamadasPara(fetchMockAtual!, `${API}/catalogo`).at(-1)?.[0] ?? '';
        const tipo = new URL(url, 'http://x').searchParams.get('tipo') ?? 'produto';
        return pagina(CATALOGOS[tipo] ?? []);
      },
      '/api/lookups/pacientes': () => pagina([]),
      '/api/lookups/formas-pagamento': () => pagina([]),
    },
  });
}

function renderTela(caminho = '/vendas', fetchMock = apiVendas()) {
  fetchMockAtual = fetchMock;
  return { user: userEvent.setup(), ...renderApp(caminho, fetchMock) };
}

describe('Vendas/PDV (/vendas)', () => {
  describe('aba Consultas Realizadas', () => {
    it('mostra título, abas, cards, filtros e as colunas do inventário', async () => {
      renderTela();

      expect(await screen.findByRole('heading', { name: 'Vendas / Consultas' })).toBeVisible();
      expect(screen.getByRole('tab', { name: 'Consultas Realizadas' })).toHaveAttribute(
        'aria-selected',
        'true',
      );
      expect(screen.getByRole('tab', { name: 'Vendas (PDV)' })).toBeVisible();
      for (const chip of ['Todos', 'Pago', 'Pendente']) {
        expect(screen.getByRole('button', { name: chip })).toBeVisible();
      }
      expect(screen.getByRole('group', { name: 'Período' })).toBeVisible();
      expect(screen.queryByRole('button', { name: 'Nova Venda (PDV)' })).not.toBeInTheDocument();

      const totais = await screen.findByLabelText('Totais do período');
      await waitFor(() => expect(within(totais).getByText('44')).toBeVisible());
      expect(within(totais).getByText('Total Consultas')).toBeVisible();
      expect(within(totais).getByText(/10\.325,00/)).toBeVisible();
      expect(within(totais).getByText(/1\.000,00/)).toBeVisible();

      const cabecalhos = within(await screen.findByRole('table')).getAllByRole('columnheader');
      expect(cabecalhos.map((c) => c.textContent)).toEqual([
        'Data',
        'Paciente',
        'Profissional',
        'Tipo',
        'Valor',
        'Pagamento',
        'NFSe',
        'Ações',
      ]);
    });

    it('linha sem cobrança tem Receber; linha paga mostra a forma e tem NFSe, ambos aguardando a QA', async () => {
      renderTela();

      const pendente = (await screen.findByText('Paciente Teste')).closest('tr') as HTMLElement;
      expect(within(pendente).getByText('(11) 90000-0000')).toBeVisible();
      expect(within(pendente).getByText('Sem cobrança')).toBeVisible();
      expect(within(pendente).getByText(/295,00/)).toBeVisible();
      const receber = within(pendente).getByRole('button', { name: 'Receber' });
      expect(receber).toBeDisabled();
      expect(receber).toHaveAttribute('title', expect.stringContaining('QA'));

      const paga = screen.getByText('Outra Paciente').closest('tr') as HTMLElement;
      expect(within(paga).getByText('Pago (Voucher)')).toBeVisible();
      expect(within(paga).getByRole('button', { name: 'NFSe' })).toBeDisabled();
      expect(within(paga).queryByRole('button', { name: 'Receber' })).not.toBeInTheDocument();
    });

    it('abre no mês atual e envia o período à listagem e aos cards', async () => {
      const { fetchMock } = renderTela();
      await screen.findByText('Paciente Teste');

      await waitFor(() => expect(parametros(fetchMock, CONSULTAS)).toHaveProperty('de'));
      const { de, ate } = parametros(fetchMock, CONSULTAS);
      expect(de).toMatch(/^\d{4}-\d{2}-01$/);
      expect(ate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      await waitFor(() =>
        expect(parametros(fetchMock, `${CONSULTAS}/totais`)).toMatchObject({ de, ate }),
      );
    });

    it('chips Pago/Pendente filtram a listagem e os cards; ordenação chama a API', async () => {
      const { fetchMock, user } = renderTela();
      await screen.findByText('Paciente Teste');

      await user.click(screen.getByRole('button', { name: 'Pago' }));
      await waitFor(() =>
        expect(parametros(fetchMock, CONSULTAS)).toMatchObject({ pagamento: 'pago' }),
      );
      await waitFor(() =>
        expect(parametros(fetchMock, `${CONSULTAS}/totais`)).toMatchObject({ pagamento: 'pago' }),
      );
      await user.click(screen.getByRole('button', { name: 'Pendente' }));
      await waitFor(() =>
        expect(parametros(fetchMock, CONSULTAS)).toMatchObject({ pagamento: 'pendente' }),
      );
      await user.click(screen.getByRole('button', { name: 'Valor' }));
      await waitFor(() =>
        expect(parametros(fetchMock, CONSULTAS)).toMatchObject({ sort: 'valor:asc' }),
      );
    });

    it('estado vazio', async () => {
      renderTela('/vendas', apiVendas(undefined, []));
      expect(await screen.findByText('Nenhuma consulta encontrada.')).toBeVisible();
    });
  });

  describe('aba Vendas (PDV)', () => {
    it('mostra os chips, a busca, o botão Nova Venda (PDV) e as colunas', async () => {
      const { user } = renderTela();
      await user.click(await screen.findByRole('tab', { name: 'Vendas (PDV)' }));

      expect(await screen.findByRole('button', { name: 'Nova Venda (PDV)' })).toBeVisible();
      for (const chip of ['Todas', 'Orç. Aprovados', 'Finalizada', 'Cancelada']) {
        expect(screen.getByRole('button', { name: chip })).toBeVisible();
      }
      expect(screen.getByPlaceholderText('Buscar vendas...')).toBeVisible();
      expect(screen.getByRole('button', { name: 'Colunas' })).toBeVisible();
      const cabecalhos = within(await screen.findByRole('table')).getAllByRole('columnheader');
      expect(cabecalhos.map((c) => c.textContent)).toEqual([
        '#',
        'Data',
        'Cliente',
        'Pagamento',
        'Total',
        'Status',
      ]);
      const linha = (await screen.findByText('Cliente Teste')).closest('tr') as HTMLElement;
      expect(within(linha).getByText('Finalizada')).toBeVisible();
      expect(within(linha).getByText(/500,00/)).toBeVisible();
    });

    it('chips, busca e ordenação chamam a API', async () => {
      const { fetchMock, user } = renderTela('/vendas?aba=vendas');
      await screen.findByText('Cliente Teste');

      await user.click(screen.getByRole('button', { name: 'Cancelada' }));
      await waitFor(() =>
        expect(parametros(fetchMock, API)).toMatchObject({ status: 'cancelada' }),
      );
      await user.click(screen.getByRole('button', { name: 'Orç. Aprovados' }));
      await waitFor(() =>
        expect(parametros(fetchMock, API)).toMatchObject({ status: 'orcamento-aprovado' }),
      );
      await user.click(screen.getByRole('button', { name: 'Total' }));
      await waitFor(() => expect(parametros(fetchMock, API)).toMatchObject({ sort: 'total:asc' }));
      await user.type(screen.getByPlaceholderText('Buscar vendas...'), 'ana');
      await waitFor(() => expect(parametros(fetchMock, API)).toMatchObject({ search: 'ana' }));
    });

    it('voltar para Consultas Realizadas descarta o estado do outro grid', async () => {
      const { fetchMock, user } = renderTela('/vendas?aba=vendas&status=cancelada');
      await screen.findByText('Cliente Teste');

      await user.click(screen.getByRole('tab', { name: 'Consultas Realizadas' }));
      await screen.findByText('Paciente Teste');
      expect(parametros(fetchMock, CONSULTAS)).not.toHaveProperty('status');
    });
  });

  describe('Nova Venda (PDV)', () => {
    async function abrirPdv() {
      const tela = renderTela('/vendas?aba=vendas', undefined);
      await screen.findByText('Cliente Teste');
      await tela.user.click(screen.getByRole('button', { name: 'Nova Venda (PDV)' }));
      const modal = await screen.findByRole('dialog', { name: 'Ponto de Venda (PDV)' });
      return { ...tela, modal };
    }

    it('mostra os campos do print e deixa Finalizar Venda desabilitado sem itens', async () => {
      const { modal } = await abrirPdv();

      expect(within(modal).getByPlaceholderText('Buscar produto ou serviço…')).toBeVisible();
      expect(within(modal).getByRole('button', { name: 'Protocolo' })).toBeVisible();
      expect(within(modal).getByText('Cliente (opcional)')).toBeVisible();
      expect(within(modal).getByText('Forma de pagamento')).toBeVisible();
      expect(within(modal).getByLabelText('Parcelas')).toHaveValue(1);
      expect(within(modal).getByLabelText('Desconto (R$)')).toHaveValue(0);
      expect(within(modal).getByText('Total:').nextSibling).toHaveTextContent(/0,00/);
      expect(within(modal).getByRole('button', { name: 'Cancelar' })).toBeEnabled();
      expect(within(modal).getByRole('button', { name: 'Finalizar Venda' })).toBeDisabled();
    });

    it('Cancelar fecha o modal sem enviar', async () => {
      const { modal, user, fetchMock } = await abrirPdv();
      await user.click(within(modal).getByRole('button', { name: 'Cancelar' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(chamadasPara(fetchMock, API).filter(([, i]) => i?.method === 'POST')).toHaveLength(0);
    });

    it('busca produto, soma a quantidade do repetido, aplica o desconto e finaliza', async () => {
      let corpo: unknown;
      const tela = renderTela(
        '/vendas?aba=vendas',
        apiVendas((c) => (corpo = c)),
      );
      await screen.findByText('Cliente Teste');
      await tela.user.click(screen.getByRole('button', { name: 'Nova Venda (PDV)' }));
      const modal = await screen.findByRole('dialog', { name: 'Ponto de Venda (PDV)' });
      const { user } = tela;

      await user.type(within(modal).getByPlaceholderText('Buscar produto ou serviço…'), 'soro');
      await user.click(await within(modal).findByRole('button', { name: /Soro Teste/ }));
      await user.click(within(modal).getByRole('button', { name: /Soro Teste/ }));

      expect(within(modal).getByLabelText('Quantidade do item 1')).toHaveValue(2);
      expect(within(modal).getByText('Subtotal:').nextSibling).toHaveTextContent(/500,00/);
      await user.clear(within(modal).getByLabelText('Desconto (R$)'));
      await user.type(within(modal).getByLabelText('Desconto (R$)'), '50');
      expect(within(modal).getByText('Total:').nextSibling).toHaveTextContent(/450,00/);

      await user.click(within(modal).getByRole('button', { name: 'Finalizar Venda' }));

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(corpo).toEqual({
        pacienteId: null,
        formaPagamentoId: null,
        parcelas: 1,
        desconto: 50,
        itens: [
          {
            origem: 'produto',
            origemId: PRODUTO,
            descricao: 'Soro Teste',
            quantidade: 2,
            valorUnitario: 250,
          },
        ],
      });
    });

    it('o botão Protocolo lista os protocolos e adiciona o escolhido', async () => {
      const { modal, user } = await abrirPdv();

      await user.click(within(modal).getByRole('button', { name: 'Protocolo' }));
      expect(within(modal).getByPlaceholderText('Buscar protocolo…')).toBeVisible();
      await user.click(await within(modal).findByRole('button', { name: /Protocolo Verão/ }));

      expect(within(modal).getByLabelText('Quantidade do item 1')).toHaveValue(1);
      expect(within(modal).getByText('Total:').nextSibling).toHaveTextContent(/900,00/);
      expect(within(modal).getByRole('button', { name: 'Finalizar Venda' })).toBeEnabled();
    });

    it('remove um item pela lixeira e volta a desabilitar Finalizar Venda', async () => {
      const { modal, user } = await abrirPdv();

      await user.click(within(modal).getByRole('button', { name: 'Protocolo' }));
      await user.click(await within(modal).findByRole('button', { name: /Protocolo Verão/ }));
      await user.click(within(modal).getByRole('button', { name: 'Remover item 1' }));

      expect(within(modal).queryByLabelText('Quantidade do item 1')).not.toBeInTheDocument();
      expect(within(modal).getByRole('button', { name: 'Finalizar Venda' })).toBeDisabled();
    });
  });
});
