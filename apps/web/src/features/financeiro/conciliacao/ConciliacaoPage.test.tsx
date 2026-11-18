import { PERMISSOES, type ContaBancaria, type LancamentoConciliacao } from '@torres/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { apiFalsa, chamadasPara, json, renderApp, USUARIO_TESTE } from '@/test/render-app';
import { periodoInicial } from './use-conciliacao';

const CONTAS_API = '/api/financeiro/contas-bancarias';
const LANCAMENTOS_API = '/api/financeiro/conciliacao/lancamentos';
const RESUMO_API = '/api/financeiro/conciliacao/resumo';
const CONTA_1 = '00000000-0000-4000-8000-0000000000b1';
const CONTA_2 = '00000000-0000-4000-8000-0000000000b2';

function contaBancaria(parcial: Partial<ContaBancaria>): ContaBancaria {
  return {
    id: CONTA_1,
    nome: 'Banco Teste',
    tipo: 'CORRENTE',
    banco: 'Banco Exemplo',
    agencia: '0001',
    conta: '12345-6',
    saldoInicial: '0',
    dataSaldoInicial: null,
    saldo: '-10146.27',
    ativo: true,
    ...parcial,
  };
}

const CONTAS = [
  contaBancaria({}),
  contaBancaria({
    id: CONTA_2,
    nome: 'Caixa Teste',
    tipo: 'CAIXA',
    banco: null,
    agencia: null,
    conta: null,
    saldo: '6181.00',
  }),
];

function lancamento(parcial: Partial<LancamentoConciliacao>): LancamentoConciliacao {
  return {
    id: '00000000-0000-4000-8000-0000000000a1',
    tipo: 'PAGAR',
    descricao: 'Conta de Água',
    pessoaNome: null,
    valor: '561.00',
    data: '2026-10-05',
    status: 'PAGO',
    ...parcial,
  };
}

const PAGAR = [
  lancamento({}),
  lancamento({
    id: '00000000-0000-4000-8000-0000000000a2',
    descricao: 'Internet',
    valor: '115.35',
    status: 'PENDENTE',
  }),
];
const RECEBER = [
  lancamento({
    id: '00000000-0000-4000-8000-0000000000a3',
    tipo: 'RECEBER',
    descricao: 'Aluguel de Sala',
    pessoaNome: 'Cliente Teste',
    valor: '1160.00',
    status: 'RECEBIDO',
  }),
];

function pagina(
  data: LancamentoConciliacao[],
  meta: Partial<{ page: number; totalPages: number; total: number }> = {},
) {
  return json({
    data,
    meta: { page: 1, pageSize: 20, total: data.length, totalPages: 1, ...meta },
  });
}

function parametros(fetchMock: ReturnType<typeof apiFalsa>, url: string) {
  const [ultima] = chamadasPara(fetchMock, url).at(-1) ?? [''];
  return Object.fromEntries(new URL(ultima, 'http://x').searchParams);
}

function api(rotas: Parameters<typeof apiFalsa>[0] = {}) {
  return apiFalsa({
    ...rotas,
    rotas: {
      [CONTAS_API]: () => json({ data: CONTAS, total: CONTAS.length }),
      [RESUMO_API]: () => json({ recebido: '9070.00', pago: '14679.45', saldo: '-5609.45' }),
      [LANCAMENTOS_API]: (_init, url) =>
        pagina(
          new URL(String(url), 'http://x').searchParams.get('tipo') === 'RECEBER' ? RECEBER : PAGAR,
        ),
      ...rotas.rotas,
    },
  });
}

function renderTela(fetchMock = api()) {
  return { user: userEvent.setup(), ...renderApp('/conciliacao', fetchMock) };
}

describe('Conciliação (/conciliacao)', () => {
  it('mostra título, abas e o Saldo Sistema com recebido, pago e saldo negativo em vermelho', async () => {
    const fetchMock = api();
    renderTela(fetchMock);

    expect(await screen.findByRole('heading', { name: 'Conciliação' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Bancária' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Contas Bancárias' })).toBeVisible();

    const card = screen.getByRole('generic', { name: 'Saldo Sistema' });
    expect(await within(card).findByText('Recebido: R$ 9.070,00')).toBeVisible();
    expect(within(card).getByText('Pago: R$ 14.679,45')).toBeVisible();
    const saldo = within(card).getByTestId('saldo-sistema');
    expect(saldo).toHaveTextContent('-R$ 5.609,45');
    expect(saldo).toHaveClass('text-destructive');

    const { de, ate } = periodoInicial();
    expect(screen.getByLabelText('Data inicial')).toHaveValue(de);
    expect(screen.getByLabelText('Data final')).toHaveValue(ate);
    expect(parametros(fetchMock, RESUMO_API)).toEqual({ de, ate });
  });

  it('Lançamentos do Sistema: A Pagar por padrão; A Receber troca o tipo e mostra o cliente', async () => {
    const fetchMock = api();
    const { user } = renderTela(fetchMock);

    const lista = await screen.findByRole('list', { name: 'Lançamentos do Sistema' });
    expect(within(lista).getByText('Conta de Água')).toBeVisible();
    expect(within(lista).getByText('R$ 561,00')).toHaveClass('text-destructive');
    expect(within(lista).getAllByText('05/10/2026')).toHaveLength(2);
    expect(within(lista).getByText('pago')).toBeVisible();
    expect(within(lista).getByText('pendente')).toBeVisible();
    expect(screen.getByRole('button', { name: 'A Pagar' })).toHaveAttribute('aria-pressed', 'true');
    expect(parametros(fetchMock, LANCAMENTOS_API)).toMatchObject({
      tipo: 'PAGAR',
      page: '1',
      pageSize: '20',
    });

    await user.click(screen.getByRole('button', { name: 'A Receber' }));
    expect(await screen.findByText('Aluguel de Sala')).toBeVisible();
    expect(screen.getByText('Cliente Teste')).toBeVisible();
    expect(screen.getByText('R$ 1.160,00')).toHaveClass('text-emerald-600');
    expect(parametros(fetchMock, LANCAMENTOS_API)).toMatchObject({ tipo: 'RECEBER' });
  });

  it('filtro de conta envia contaBancariaId; "Todas as contas" volta à lista sem filtro', async () => {
    const fetchMock = api();
    const { user } = renderTela(fetchMock);
    await screen.findByText('Conta de Água');

    const filtro = screen.getByRole('combobox', { name: 'Conta bancária' });
    expect(filtro).toHaveTextContent('Todas as contas');
    await user.click(filtro);
    await user.click(await screen.findByRole('option', { name: 'Caixa Teste' }));
    await waitFor(() =>
      expect(parametros(fetchMock, LANCAMENTOS_API)).toMatchObject({ contaBancariaId: CONTA_2 }),
    );

    await user.click(filtro);
    await user.click(await screen.findByRole('option', { name: 'Todas as contas' }));
    // A consulta sem filtro já está em cache (a primeira da tela): volta sem nova chamada.
    await waitFor(() => expect(filtro).toHaveTextContent('Todas as contas'));
    const semFiltro = chamadasPara(fetchMock, LANCAMENTOS_API).filter(
      ([url]) => !url.includes('contaBancariaId'),
    );
    expect(semFiltro.length).toBeGreaterThan(0);
  });

  it('período: alterar as datas refaz as consultas; período invertido avisa e não consulta', async () => {
    const fetchMock = api();
    const { user } = renderTela(fetchMock);
    await screen.findByText('Conta de Água');

    const de = screen.getByLabelText('Data inicial');
    await user.clear(de);
    await user.type(de, '2026-09-30');
    await waitFor(() =>
      expect(parametros(fetchMock, RESUMO_API)).toMatchObject({ de: '2026-09-30' }),
    );
    expect(parametros(fetchMock, LANCAMENTOS_API)).toMatchObject({ de: '2026-09-30' });

    const ate = screen.getByLabelText('Data final');
    await user.clear(ate);
    await user.type(ate, '2026-09-01');
    expect(
      await screen.findByText('A data inicial deve ser anterior ou igual à data final'),
    ).toBeVisible();
    expect(parametros(fetchMock, RESUMO_API)).not.toMatchObject({ ate: '2026-09-01' });
  });

  it('paginação: mostra "pág 1/2" e avança para a próxima página', async () => {
    const fetchMock = api({
      rotas: {
        [LANCAMENTOS_API]: (_init, url) => {
          const page = Number(new URL(String(url), 'http://x').searchParams.get('page'));
          return pagina(page === 2 ? [lancamento({ descricao: 'Segunda Página' })] : PAGAR, {
            page,
            totalPages: 2,
            total: 21,
          });
        },
      },
    });
    const { user } = renderTela(fetchMock);

    expect(await screen.findByText('21 lançamentos (pág 1/2)')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Página anterior' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Próxima página' }));
    expect(await screen.findByText('Segunda Página')).toBeVisible();
    expect(screen.getByText('21 lançamentos (pág 2/2)')).toBeVisible();
    expect(parametros(fetchMock, LANCAMENTOS_API)).toMatchObject({ page: '2' });
  });

  it('sem lançamentos mostra o estado vazio', async () => {
    renderTela(api({ rotas: { [LANCAMENTOS_API]: () => pagina([]) } }));
    expect(await screen.findByText('Nenhum lançamento no período')).toBeVisible();
  });

  describe('aba Contas Bancárias', () => {
    it('cards com nome, banco/agência/conta, tipo e saldo colorido', async () => {
      const { user } = renderTela();
      await user.click(await screen.findByRole('tab', { name: 'Contas Bancárias' }));

      expect(
        screen.getByText(
          'Gerencie suas contas bancárias: caixa, corrente, poupança e investimento.',
        ),
      ).toBeVisible();
      const banco = await screen.findByRole('generic', { name: 'Banco Teste' });
      expect(within(banco).getByText('Banco Exemplo | Ag 0001 | CC 12345-6')).toBeVisible();
      expect(within(banco).getByText('Corrente')).toBeVisible();
      expect(within(banco).getByText('-R$ 10.146,27')).toHaveClass('text-destructive');
      const caixa = screen.getByRole('generic', { name: 'Caixa Teste' });
      expect(within(caixa).getByText('Caixa')).toBeVisible();
      expect(within(caixa).getByText('R$ 6.181,00')).toHaveClass('text-emerald-600');
    });

    it('Nova Conta: vazio mostra a mensagem padrão; preenchida envia POST e fecha', async () => {
      let corpo: Record<string, unknown> = {};
      const fetchMock = api({
        rotas: {
          [CONTAS_API]: (init) => {
            if (init?.method !== 'POST') return json({ data: CONTAS, total: CONTAS.length });
            corpo = JSON.parse(String(init.body)) as Record<string, unknown>;
            return json(contaBancaria({ id: '00000000-0000-4000-8000-0000000000b3' }), 201);
          },
        },
      });
      const { user } = renderTela(fetchMock);
      await user.click(await screen.findByRole('tab', { name: 'Contas Bancárias' }));
      await user.click(await screen.findByRole('button', { name: 'Nova Conta' }));

      const modal = await screen.findByRole('dialog', { name: 'Nova Conta' });
      for (const rotulo of [
        'Nome',
        'Banco',
        'Agência',
        'Conta',
        'Saldo Inicial',
        'Data do Saldo Inicial',
      ]) {
        expect(within(modal).getByLabelText(rotulo)).toBeVisible();
      }
      expect(within(modal).getByRole('combobox', { name: 'Tipo' })).toHaveTextContent('Corrente');

      await user.click(within(modal).getByRole('button', { name: 'Cadastrar' }));
      expect(await within(modal).findByText('Nome é obrigatório.')).toBeVisible();
      expect(
        chamadasPara(fetchMock, CONTAS_API).filter(([, i]) => i?.method === 'POST'),
      ).toHaveLength(0);

      await user.type(within(modal).getByLabelText('Nome'), 'Conta Nova');
      await user.click(within(modal).getByRole('combobox', { name: 'Tipo' }));
      await user.click(await screen.findByRole('option', { name: 'Poupança' }));
      await user.type(within(modal).getByLabelText('Agência'), '0001');
      await user.type(within(modal).getByLabelText('Saldo Inicial'), '150000');
      await user.click(within(modal).getByRole('button', { name: 'Cadastrar' }));

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(corpo).toMatchObject({
        nome: 'Conta Nova',
        tipo: 'POUPANCA',
        agencia: '0001',
        saldoInicial: 1500,
      });
    });

    it('Excluir: confirma antes e envia DELETE; Cancelar não exclui', async () => {
      let excluidos = 0;
      const { user } = renderTela(
        api({
          rotas: {
            [`${CONTAS_API}/${CONTA_2}`]: () => {
              excluidos += 1;
              return json(CONTAS[1]);
            },
          },
        }),
      );
      await user.click(await screen.findByRole('tab', { name: 'Contas Bancárias' }));

      await user.click(await screen.findByRole('button', { name: 'Excluir Caixa Teste' }));
      const dialogo = await screen.findByRole('alertdialog', { name: 'Excluir conta bancária?' });
      expect(dialogo).toHaveTextContent('"Caixa Teste"');
      await user.click(within(dialogo).getByRole('button', { name: 'Cancelar' }));
      await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
      expect(excluidos).toBe(0);

      await user.click(screen.getByRole('button', { name: 'Excluir Caixa Teste' }));
      await user.click(
        within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Excluir' }),
      );
      await waitFor(() => expect(excluidos).toBe(1));
    });

    it('sem permissão de criar e excluir, esconde "Nova Conta" e a lixeira', async () => {
      const somenteVer = PERMISSOES.filter((p) => p === 'financeiro.conciliacao.ver');
      const { user } = renderTela(api({ usuario: { ...USUARIO_TESTE, permissoes: somenteVer } }));
      await user.click(await screen.findByRole('tab', { name: 'Contas Bancárias' }));

      await screen.findByRole('generic', { name: 'Banco Teste' });
      expect(screen.queryByRole('button', { name: 'Nova Conta' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^Excluir/ })).not.toBeInTheDocument();
    });
  });
});
