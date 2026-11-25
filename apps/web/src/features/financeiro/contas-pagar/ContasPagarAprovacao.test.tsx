import { PERMISSOES, PREFERENCIAS_PADRAO, type ContaPagar } from '@torres/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { aplicarIdioma } from '@/lib/i18n';
import { apiFalsa, chamadasPara, json, renderApp, USUARIO_TESTE } from '@/test/render-app';

vi.setConfig({ testTimeout: 20_000 });

const API = '/api/financeiro/contas-pagar';
const ID_AGUARDANDO = '00000000-0000-4000-8000-0000000000c1';
const ID_APROVADA = '00000000-0000-4000-8000-0000000000c2';
const ID_RECUSADA = '00000000-0000-4000-8000-0000000000c3';

function conta(parcial: Partial<ContaPagar>): ContaPagar {
  return {
    id: ID_AGUARDANDO,
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
    aprovacao: 'LANCADA',
    aprovadoPorNome: null,
    aprovadoEm: null,
    recusadoPorNome: null,
    recusadoEm: null,
    motivoRecusa: null,
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
    id: ID_APROVADA,
    numero: 2,
    descricao: 'Aluguel',
    aprovacao: 'APROVADA',
    aprovadoPorNome: 'Gerente Teste',
    aprovadoEm: '2026-10-15T13:30:00.000Z',
  }),
  conta({
    id: ID_RECUSADA,
    numero: 3,
    descricao: 'Internet',
    aprovacao: 'RECUSADA',
    recusadoPorNome: 'Gerente Teste',
    recusadoEm: '2026-10-15T13:30:00.000Z',
    motivoRecusa: 'Boleto em duplicidade',
  }),
];

function api(rotas: Parameters<typeof apiFalsa>[0] = {}) {
  return apiFalsa({
    ...rotas,
    rotas: {
      [API]: () =>
        json({
          data: CONTAS,
          meta: { page: 1, pageSize: 10, total: CONTAS.length, totalPages: 1 },
        }),
      ...rotas.rotas,
    },
  });
}

function renderTela(fetchMock = api(), url = '/pagar') {
  return { user: userEvent.setup(), ...renderApp(url, fetchMock) };
}

async function abrirMenu(user: ReturnType<typeof userEvent.setup>, linha: string, botao = 'Ações') {
  const tr = (await screen.findByText(linha)).closest('tr') as HTMLElement;
  await user.click(within(tr).getByRole('button', { name: botao }));
}

afterEach(() => aplicarIdioma('pt-BR'));

describe('Contas a Pagar: aprovação antes da baixa (#164)', () => {
  it('mostra a coluna Aprovação com a situação de cada conta', async () => {
    renderTela();

    const tabela = await screen.findByRole('table');
    expect(
      within(tabela)
        .getAllByRole('columnheader')
        .map((c) => c.textContent),
    ).toContain('Aprovação');
    const aguardando = (await screen.findByText('Água Cuiaba')).closest('tr') as HTMLElement;
    expect(within(aguardando).getByText('Aguardando aprovação')).toBeVisible();
    const aprovada = screen.getByText('Aluguel').closest('tr') as HTMLElement;
    expect(within(aprovada).getByText('Aprovada')).toBeVisible();
    const recusada = screen.getByText('Internet').closest('tr') as HTMLElement;
    expect(within(recusada).getByText('Recusada')).toBeVisible();
  });

  it('Editar Baixa só vale para conta aprovada', async () => {
    const { user } = renderTela();

    await abrirMenu(user, 'Água Cuiaba');
    expect(await screen.findByRole('menuitem', { name: 'Editar Baixa' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await user.keyboard('{Escape}');

    await abrirMenu(user, 'Aluguel');
    expect(await screen.findByRole('menuitem', { name: 'Editar Baixa' })).not.toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  it('Aprovar pede confirmação e envia POST /:id/aprovar', async () => {
    let aprovadas = 0;
    const fetchMock = api({
      rotas: {
        [`${API}/${ID_AGUARDANDO}/aprovar`]: () => {
          aprovadas += 1;
          return json(conta({ aprovacao: 'APROVADA', aprovadoPorNome: 'Gerente Teste' }));
        },
      },
    });
    const { user } = renderTela(fetchMock);

    await abrirMenu(user, 'Água Cuiaba');
    await user.click(await screen.findByRole('menuitem', { name: 'Aprovar' }));
    const dialogo = await screen.findByRole('alertdialog', { name: 'Aprovar Conta a Pagar' });
    await user.click(within(dialogo).getByRole('button', { name: 'Cancelar' }));
    expect(aprovadas).toBe(0);

    await abrirMenu(user, 'Água Cuiaba');
    await user.click(await screen.findByRole('menuitem', { name: 'Aprovar' }));
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Aprovar' }),
    );
    await waitFor(() => expect(aprovadas).toBe(1));
  });

  it('Aprovar e Recusar ficam desabilitados para conta que não aguarda aprovação', async () => {
    const { user } = renderTela();

    await abrirMenu(user, 'Aluguel');
    for (const nome of ['Aprovar', 'Recusar']) {
      expect(await screen.findByRole('menuitem', { name: nome })).toHaveAttribute(
        'aria-disabled',
        'true',
      );
    }
  });

  it('Recusar exige o motivo e envia POST /:id/recusar', async () => {
    let corpo: unknown = null;
    const fetchMock = api({
      rotas: {
        [`${API}/${ID_AGUARDANDO}/recusar`]: (init) => {
          corpo = JSON.parse(String(init?.body));
          return json(conta({ aprovacao: 'RECUSADA', motivoRecusa: 'Valor errado' }));
        },
      },
    });
    const { user } = renderTela(fetchMock);

    await abrirMenu(user, 'Água Cuiaba');
    await user.click(await screen.findByRole('menuitem', { name: 'Recusar' }));
    const modal = await screen.findByRole('dialog', { name: 'Recusar Conta a Pagar' });

    await user.click(within(modal).getByRole('button', { name: 'Recusar' }));
    expect(await within(modal).findByText('Motivo é obrigatório.')).toBeVisible();
    expect(corpo).toBeNull();

    await user.type(within(modal).getByLabelText(/Motivo da recusa/), 'Valor errado');
    await user.click(within(modal).getByRole('button', { name: 'Recusar' }));
    await waitFor(() => expect(corpo).toEqual({ motivo: 'Valor errado' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('sem a permissão aprovar, esconde Aprovar e Recusar', async () => {
    const permissoes = PERMISSOES.filter((p) => p !== 'financeiro.contas-pagar.aprovar');
    const { user } = renderTela(api({ usuario: { ...USUARIO_TESTE, permissoes } }));

    await abrirMenu(user, 'Água Cuiaba');
    expect(await screen.findByRole('menuitem', { name: 'Detalhar' })).toBeVisible();
    expect(screen.queryByRole('menuitem', { name: 'Aprovar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Recusar' })).not.toBeInTheDocument();
  });

  it('o detalhe mostra quem aprovou, quem recusou e o motivo; só a aprovada tem Baixar', async () => {
    const { user } = renderTela();

    await user.click(await screen.findByText('Aluguel'));
    let modal = await screen.findByRole('dialog');
    expect(within(modal).getByText(/Gerente Teste em/)).toBeVisible();
    expect(within(modal).getByRole('button', { name: 'Baixar' })).toBeVisible();
    await user.keyboard('{Escape}');

    await user.click(await screen.findByText('Internet'));
    modal = await screen.findByRole('dialog');
    expect(within(modal).getByText('Boleto em duplicidade')).toBeVisible();
    expect(within(modal).queryByRole('button', { name: 'Baixar' })).not.toBeInTheDocument();
    await user.keyboard('{Escape}');

    await user.click(await screen.findByText('Água Cuiaba'));
    modal = await screen.findByRole('dialog');
    expect(within(modal).queryByRole('button', { name: 'Baixar' })).not.toBeInTheDocument();
    expect(within(modal).getByRole('button', { name: 'Aprovar' })).toBeVisible();
    expect(within(modal).getByRole('button', { name: 'Recusar' })).toBeVisible();
  });

  it('abre a lista filtrada pelo alerta: ?status=PENDENTE&aprovacao=LANCADA vai para a API', async () => {
    const fetchMock = api();
    renderTela(fetchMock, '/pagar?status=PENDENTE&aprovacao=LANCADA');

    await screen.findByText('Água Cuiaba');
    const [url] = chamadasPara(fetchMock, API).at(-1) ?? [''];
    expect(Object.fromEntries(new URL(url, 'http://x').searchParams)).toMatchObject({
      status: 'PENDENTE',
      aprovacao: 'LANCADA',
    });
  });

  it('em inglês, traduz a situação e as ações', async () => {
    const usuario = {
      ...USUARIO_TESTE,
      preferencias: { ...PREFERENCIAS_PADRAO, idioma: 'en' as const },
    };
    const { user } = renderTela(api({ usuario }));

    const aguardando = (await screen.findByText('Água Cuiaba')).closest('tr') as HTMLElement;
    expect(within(aguardando).getByText('Awaiting approval')).toBeVisible();
    await abrirMenu(user, 'Água Cuiaba', 'Actions');
    expect(await screen.findByRole('menuitem', { name: 'Approve' })).toBeVisible();
    expect(screen.getByRole('menuitem', { name: 'Reject' })).toBeVisible();
  });
});
