import {
  PERMISSOES,
  PREFERENCIAS_PADRAO,
  type ContaReceber,
  type ContaReceberBaixa,
} from '@torres/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { aplicarIdioma } from '@/lib/i18n';
import { formatarMoeda } from '@/lib/forms/mascaras';
import { apiFalsa, chamadasPara, json, renderApp, USUARIO_TESTE } from '@/test/render-app';

vi.setConfig({ testTimeout: 20_000 });

const API = '/api/financeiro/contas-receber';
const CONTAS_BANCARIAS_API = '/api/financeiro/contas-bancarias';
const PLANO_CONTAS_API = '/api/financeiro/plano-contas';
const ID_PARCIAL = '00000000-0000-4000-8000-0000000000d1';
const ID_ABERTA = '00000000-0000-4000-8000-0000000000d2';
const ID_PAGA = '00000000-0000-4000-8000-0000000000d3';
const ID_RENEGOCIADA = '00000000-0000-4000-8000-0000000000d4';
const ID_NOVA = '00000000-0000-4000-8000-0000000000d5';
const ID_PROFISSIONAL = '00000000-0000-4000-8000-0000000000e1';
const USUARIO_SOMENTE_VER = {
  ...USUARIO_TESTE,
  permissoes: PERMISSOES.filter((p) => p === 'financeiro.contas-receber.ver'),
};

function conta(parcial: Partial<ContaReceber>): ContaReceber {
  return {
    id: ID_ABERTA,
    numero: 1,
    descricao: 'Aluguel Sala 8',
    pacienteId: null,
    pacienteNome: null,
    profissionalSacadoId: null,
    profissionalSacadoNome: null,
    contratoSalaId: null,
    contratoSalaNumero: null,
    renegociadoDeId: null,
    renegociadoDeNumero: null,
    renegociadoParaNumeros: [],
    competencia: null,
    valor: '1500.00',
    valorRecebido: '0.00',
    saldo: '1500.00',
    dataVencimento: '2099-12-10',
    formaPagamentoId: null,
    formaPagamentoNome: null,
    planoContaId: null,
    planoContaNome: null,
    documento: null,
    totalParcelas: 1,
    status: 'PENDENTE',
    contaBancariaId: null,
    contaBancariaNome: null,
    dataRecebimento: null,
    observacoes: null,
    createdAt: '2026-10-14T12:00:00.000Z',
    updatedAt: '2026-10-14T12:00:00.000Z',
    ...parcial,
  };
}

const PARCIAL = conta({
  id: ID_PARCIAL,
  numero: 7,
  descricao: 'Aluguel Sala 7',
  profissionalSacadoId: ID_PROFISSIONAL,
  profissionalSacadoNome: 'Dr. Locatário',
  contratoSalaId: ID_PROFISSIONAL,
  contratoSalaNumero: 7,
  competencia: '2026-11',
  status: 'PARCIAL',
  valorRecebido: '500.00',
  saldo: '1000.00',
  renegociadoDeNumero: 3,
  renegociadoDeId: ID_RENEGOCIADA,
});
const ABERTA = conta({});
const PAGA = conta({
  id: ID_PAGA,
  numero: 9,
  descricao: 'Aluguel Sala 9',
  status: 'RECEBIDO',
  valorRecebido: '1500.00',
  saldo: '0.00',
});
const RENEGOCIADA = conta({
  id: ID_RENEGOCIADA,
  numero: 3,
  descricao: 'Aluguel Sala 3',
  status: 'RENEGOCIADO',
  renegociadoParaNumeros: [7, 8],
  saldo: '0.00',
});
const CONTAS = [PARCIAL, ABERTA, PAGA, RENEGOCIADA];

const BAIXAS: ContaReceberBaixa[] = [
  {
    id: '00000000-0000-4000-8000-0000000000f1',
    contaReceberId: ID_PARCIAL,
    dataRecebimento: '2026-11-05',
    valorRecebido: '500',
    formaPagamentoId: null,
    formaPagamentoNome: 'PIX',
    contaBancariaId: null,
    contaBancariaNome: 'Banco Teste',
    documento: null,
    observacoes: null,
    createdAt: '2026-11-05T12:00:00.000Z',
  },
];

function pagina(data: ContaReceber[]) {
  return json({ data, meta: { page: 1, pageSize: 10, total: data.length, totalPages: 1 } });
}

type Corpo = Record<string, unknown>;
const corpoDe = (init?: RequestInit): Corpo => JSON.parse(String(init?.body)) as Corpo;

function api(
  rotas: Record<string, (init?: RequestInit) => Response> = {},
  usuario = USUARIO_TESTE,
) {
  return apiFalsa({
    usuario,
    rotas: {
      [API]: () => pagina(CONTAS),
      [`${API}/${ID_PARCIAL}/baixas`]: () => json(BAIXAS),
      [`${API}/${ID_ABERTA}/baixas`]: () => json([]),
      [PLANO_CONTAS_API]: () => json({ data: [], total: 0 }),
      [CONTAS_BANCARIAS_API]: () => json({ data: [], total: 0 }),
      ...rotas,
    },
  });
}

function renderTela(fetchMock = api()) {
  return { user: userEvent.setup(), ...renderApp('/receber', fetchMock) };
}

async function abrirMenu(user: ReturnType<typeof userEvent.setup>, linha: string, botao = 'Ações') {
  const tr = (await screen.findByText(linha)).closest('tr') as HTMLElement;
  await user.click(within(tr).getByRole('button', { name: botao }));
}

afterEach(() => aplicarIdioma('pt-BR'));

describe('Contas a Receber: contrato, profissional, baixa parcial e renegociação (#165)', () => {
  it('mostra o profissional locatário, o contrato e o saldo na grid', async () => {
    renderTela();

    const linha = (await screen.findByText('Aluguel Sala 7')).closest('tr') as HTMLElement;
    expect(within(linha).getByText('Dr. Locatário')).toBeVisible();
    expect(within(linha).getByText('#7')).toBeVisible();
    expect(within(linha).getByText('Parcial')).toBeVisible();
    expect(within(linha).getByText('R$ 1.000,00')).toBeVisible();

    const renegociada = screen.getByText('Aluguel Sala 3').closest('tr') as HTMLElement;
    expect(within(renegociada).getByText('Renegociado')).toBeVisible();
    expect(
      within(screen.getByText('Aluguel Sala 9').closest('tr') as HTMLElement).getByText('Pago'),
    ).toBeVisible();
  });

  it('o chip Parcial filtra na API', async () => {
    const fetchMock = api();
    const { user } = renderTela(fetchMock);
    await screen.findByText('Aluguel Sala 7');

    await user.click(screen.getByRole('button', { name: 'Parcial' }));

    await waitFor(() => {
      const [url] = chamadasPara(fetchMock, API).at(-1) ?? [''];
      expect(new URL(url, 'http://x').searchParams.get('status')).toBe('PARCIAL');
    });
  });

  it('Baixar e Renegociar ficam habilitadas só com saldo em aberto; Cancelar Baixa só com baixa', async () => {
    const { user } = renderTela();

    await abrirMenu(user, 'Aluguel Sala 7');
    expect(screen.getByRole('menuitem', { name: 'Baixar' })).not.toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(screen.getByRole('menuitem', { name: 'Renegociar' })).not.toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(screen.getByRole('menuitem', { name: 'Cancelar Baixa' })).not.toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await user.keyboard('{Escape}');

    await abrirMenu(user, 'Aluguel Sala 9');
    expect(screen.getByRole('menuitem', { name: 'Baixar' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(screen.getByRole('menuitem', { name: 'Renegociar' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(screen.getByRole('menuitem', { name: 'Cancelar Baixa' })).not.toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await user.keyboard('{Escape}');

    await abrirMenu(user, 'Aluguel Sala 3');
    expect(screen.getByRole('menuitem', { name: 'Baixar' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(screen.getByRole('menuitem', { name: 'Cancelar Baixa' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  it('Baixar: sugere o saldo e envia o recebimento parcial', async () => {
    let corpo: Corpo = {};
    const fetchMock = api({
      [`${API}/${ID_PARCIAL}/baixar`]: (init) => {
        corpo = corpoDe(init);
        return json(conta({ ...PARCIAL, valorRecebido: '900.00', saldo: '600.00' }));
      },
    });
    const { user } = renderTela(fetchMock);

    await abrirMenu(user, 'Aluguel Sala 7');
    await user.click(await screen.findByRole('menuitem', { name: 'Baixar' }));
    const modal = await screen.findByRole('dialog', { name: 'Baixar Conta a Receber' });
    expect(within(modal).getByText('Saldo em aberto: R$ 1.000,00')).toBeVisible();
    expect(within(modal).getByLabelText(/Valor Recebido/)).toHaveValue(formatarMoeda(1000));

    const valor = within(modal).getByLabelText(/Valor Recebido/);
    await user.clear(valor);
    await user.type(valor, '40000');
    await user.clear(within(modal).getByLabelText(/Data de Recebimento/));
    await user.type(within(modal).getByLabelText(/Data de Recebimento/), '2026-12-05');
    await user.click(within(modal).getByRole('button', { name: 'Confirmar Baixa' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(corpo).toMatchObject({ valorRecebido: 400, dataRecebimento: '2026-12-05' });
  });

  it('Baixar: valor zerado mostra o erro e não envia', async () => {
    const fetchMock = api();
    const { user } = renderTela(fetchMock);

    await abrirMenu(user, 'Aluguel Sala 8');
    await user.click(await screen.findByRole('menuitem', { name: 'Baixar' }));
    const modal = await screen.findByRole('dialog', { name: 'Baixar Conta a Receber' });
    await user.clear(within(modal).getByLabelText(/Valor Recebido/));
    await user.click(within(modal).getByRole('button', { name: 'Confirmar Baixa' }));

    expect(
      await within(modal).findByText(
        /Valor recebido é obrigatório.|O valor recebido deve ser maior que zero/,
      ),
    ).toBeVisible();
    expect(
      chamadasPara(fetchMock, `${API}/${ID_ABERTA}/baixar`).filter(([, i]) => i?.method === 'POST'),
    ).toHaveLength(0);
  });

  it('Baixar: a API recusando por saldo mostra a mensagem no formulário', async () => {
    const fetchMock = api({
      [`${API}/${ID_ABERTA}/baixar`]: () =>
        json(
          {
            statusCode: 422,
            code: 'CONTA_RECEBER_BAIXA_EXCEDE_SALDO',
            message: 'O valor recebido é maior que o saldo em aberto.',
            requestId: 'r1',
          },
          422,
        ),
    });
    const { user } = renderTela(fetchMock);

    await abrirMenu(user, 'Aluguel Sala 8');
    await user.click(await screen.findByRole('menuitem', { name: 'Baixar' }));
    const modal = await screen.findByRole('dialog', { name: 'Baixar Conta a Receber' });
    await user.click(within(modal).getByRole('button', { name: 'Confirmar Baixa' }));

    expect(
      await screen.findByText('O valor recebido é maior que o saldo em aberto.'),
    ).toBeVisible();
    expect(screen.getByRole('dialog', { name: 'Baixar Conta a Receber' })).toBeVisible();
  });

  it('Cancelar Baixa envia o POST da conta', async () => {
    let chamadas = 0;
    const fetchMock = api({
      [`${API}/${ID_PARCIAL}/cancelar-baixa`]: () => {
        chamadas += 1;
        return json(conta({ ...PARCIAL, status: 'PENDENTE', valorRecebido: '0.00' }));
      },
    });
    const { user } = renderTela(fetchMock);

    await abrirMenu(user, 'Aluguel Sala 7');
    await user.click(await screen.findByRole('menuitem', { name: 'Cancelar Baixa' }));

    await waitFor(() => expect(chamadas).toBe(1));
  });

  it('Renegociar: confere a soma das parcelas com o saldo e envia as parcelas', async () => {
    let corpo: Corpo = {};
    const fetchMock = api({
      [`${API}/${ID_PARCIAL}/renegociar`]: (init) => {
        corpo = corpoDe(init);
        return json(conta({ ...PARCIAL, status: 'RENEGOCIADO', saldo: '0.00' }));
      },
    });
    const { user } = renderTela(fetchMock);

    await abrirMenu(user, 'Aluguel Sala 7');
    await user.click(await screen.findByRole('menuitem', { name: 'Renegociar' }));
    const modal = await screen.findByRole('dialog', { name: 'Renegociar Conta a Receber' });
    expect(within(modal).getByText('Saldo em aberto: R$ 1.000,00')).toBeVisible();
    // Uma parcela com o saldo inteiro: a soma já fecha.
    expect(within(modal).getByText('As parcelas fecham com o saldo em aberto.')).toBeVisible();

    await user.click(within(modal).getByRole('button', { name: 'Adicionar parcela' }));
    const valores = within(modal).getAllByLabelText(/^Valor/);
    expect(valores).toHaveLength(2);
    // Divide 1.000 em 600 + 400.
    await user.clear(valores[0] as HTMLElement);
    await user.type(valores[0] as HTMLElement, '60000');
    await user.type(valores[1] as HTMLElement, '40000');
    const vencimentos = within(modal).getAllByLabelText(/Vencimento/);
    await user.type(vencimentos[0] as HTMLElement, '2027-01-10');
    await user.type(vencimentos[1] as HTMLElement, '2027-02-10');
    expect(
      await within(modal).findByText('As parcelas fecham com o saldo em aberto.'),
    ).toBeVisible();

    await user.click(within(modal).getByRole('button', { name: 'Renegociar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(corpo.parcelas).toEqual([
      { valor: 600, dataVencimento: '2027-01-10' },
      { valor: 400, dataVencimento: '2027-02-10' },
    ]);
  });

  it('Renegociar: mostra quanto falta quando as parcelas não fecham o saldo', async () => {
    const { user } = renderTela();

    await abrirMenu(user, 'Aluguel Sala 7');
    await user.click(await screen.findByRole('menuitem', { name: 'Renegociar' }));
    const modal = await screen.findByRole('dialog', { name: 'Renegociar Conta a Receber' });
    const valor = within(modal).getByLabelText(/^Valor/);
    await user.clear(valor);
    await user.type(valor, '70000');

    expect(await within(modal).findByRole('alert')).toHaveTextContent(
      'Faltam R$ 300,00 para fechar o saldo em aberto.',
    );
  });

  it('Detalhe: mostra profissional, contrato, competência, saldo, renegociação e o histórico de baixas', async () => {
    const { user } = renderTela();
    await user.click(await screen.findByText('Aluguel Sala 7'));

    const modal = await screen.findByRole('dialog', { name: 'Aluguel Sala 7' });
    expect(within(modal).getByText('Dr. Locatário')).toBeVisible();
    expect(within(modal).getByText('#7')).toBeVisible();
    expect(within(modal).getByText('11/2026')).toBeVisible();
    expect(within(modal).getByText('Renegociado do título')).toBeVisible();
    expect(within(modal).getByText('#3')).toBeVisible();
    // Valor recebido e saldo em aberto.
    expect(within(modal).getAllByText('R$ 500,00').length).toBeGreaterThan(0);
    expect(within(modal).getAllByText('R$ 1.000,00').length).toBeGreaterThan(0);
    expect(await within(modal).findByText('PIX')).toBeVisible();
    expect(within(modal).getByText('Banco Teste')).toBeVisible();
    for (const nome of ['Cancelar Baixa', 'Renegociar', 'Baixar']) {
      expect(within(modal).getByRole('button', { name: nome })).toBeVisible();
    }
  });

  it('Detalhe do título renegociado mostra os títulos gerados e não oferece Baixar nem Renegociar', async () => {
    const { user } = renderTela();
    await user.click(await screen.findByText('Aluguel Sala 3'));

    const modal = await screen.findByRole('dialog', { name: 'Aluguel Sala 3' });
    expect(within(modal).getByText('Renegociado nos títulos')).toBeVisible();
    expect(within(modal).getByText('#7, #8')).toBeVisible();
    expect(within(modal).queryByRole('button', { name: 'Baixar' })).not.toBeInTheDocument();
    expect(within(modal).queryByRole('button', { name: 'Renegociar' })).not.toBeInTheDocument();
    expect(within(modal).queryByRole('button', { name: 'Cancelar Baixa' })).not.toBeInTheDocument();
  });

  it('Nova Conta: tem o profissional (locatário) e a competência, com Pago/A vencer/Cancelado', async () => {
    const { user } = renderTela();
    await screen.findByText('Aluguel Sala 7');

    await user.click(screen.getByRole('button', { name: 'Nova Conta' }));
    const modal = await screen.findByRole('dialog', { name: 'Nova Conta a Receber' });
    expect(within(modal).getByLabelText('Competência')).toBeVisible();
    expect(within(modal).getByText('Profissional (locatário)')).toBeVisible();

    await user.click(within(modal).getByRole('combobox', { name: 'Status' }));
    const opcoes = (await screen.findAllByRole('option')).map((o) => o.textContent);
    expect(opcoes).toEqual(['A vencer', 'Pago', 'Cancelado']);
  });

  it('Nova Conta envia a competência informada', async () => {
    let corpo: Corpo = {};
    const fetchMock = api({
      [API]: (init) => {
        if (init?.method !== 'POST') return pagina(CONTAS);
        corpo = corpoDe(init);
        return json(conta({ id: ID_NOVA, descricao: 'Nova' }), 201);
      },
    });
    const { user } = renderTela(fetchMock);
    await screen.findByText('Aluguel Sala 7');

    await user.click(screen.getByRole('button', { name: 'Nova Conta' }));
    const modal = await screen.findByRole('dialog', { name: 'Nova Conta a Receber' });
    await user.type(within(modal).getByLabelText('Descrição'), 'Nova');
    await user.type(within(modal).getByLabelText('Valor'), '20000');
    await user.type(within(modal).getByLabelText('Data de Vencimento'), '2026-12-20');
    await user.type(within(modal).getByLabelText('Competência'), '2026-11');
    await user.click(within(modal).getByRole('button', { name: 'Cadastrar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(corpo).toMatchObject({ descricao: 'Nova', competencia: '2026-11' });
  });

  it('sem permissão de editar, Baixar e Renegociar não aparecem no detalhe', async () => {
    const fetchMock = apiFalsa({
      usuario: { ...USUARIO_SOMENTE_VER },
      rotas: {
        [API]: () => pagina(CONTAS),
        [`${API}/${ID_PARCIAL}/baixas`]: () => json(BAIXAS),
      },
    });
    const { user } = renderTela(fetchMock);
    await user.click(await screen.findByText('Aluguel Sala 7'));

    const modal = await screen.findByRole('dialog', { name: 'Aluguel Sala 7' });
    expect(within(modal).queryByRole('button', { name: 'Baixar' })).not.toBeInTheDocument();
    expect(within(modal).queryByRole('button', { name: 'Renegociar' })).not.toBeInTheDocument();
  });

  it('em inglês traduz as ações e o modal de baixa', async () => {
    const usuario = {
      ...USUARIO_TESTE,
      preferencias: { ...PREFERENCIAS_PADRAO, idioma: 'en' as const },
    };
    const { user } = renderTela(api({}, usuario));

    await abrirMenu(user, 'Aluguel Sala 7', 'Actions');
    expect(screen.getByRole('menuitem', { name: 'Record payment' })).toBeVisible();
    expect(screen.getByRole('menuitem', { name: 'Renegotiate' })).toBeVisible();
    expect(screen.getByRole('menuitem', { name: 'Cancel payment' })).toBeVisible();
    await user.click(screen.getByRole('menuitem', { name: 'Record payment' }));

    const modal = await screen.findByRole('dialog', { name: 'Record Receivable Payment' });
    expect(modal).toHaveTextContent('Open balance: R$1,000.00');
    expect(within(modal).getByRole('button', { name: 'Confirm Payment' })).toBeVisible();
  });
});
