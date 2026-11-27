import { PERMISSOES, type ContaReceber } from '@torres/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { MOTIVO_ID, MOTIVO_OUTRO_ID, rotaMotivosCancelamento } from '@/test/motivos-cancelamento';
import { apiFalsa, chamadasPara, json, renderApp, USUARIO_TESTE } from '@/test/render-app';

const API = '/api/financeiro/contas-receber';
const PLANO_CONTAS_API = '/api/financeiro/plano-contas';
const ID_1 = '00000000-0000-4000-8000-0000000000c1';
const ID_2 = '00000000-0000-4000-8000-0000000000c2';
const CONTAS_BANCARIAS_API = '/api/financeiro/contas-bancarias';
const CONTA_BANCARIA_ID = '00000000-0000-4000-8000-0000000000b1';
const CONTA_BANCARIA_2_ID = '00000000-0000-4000-8000-0000000000b2';

function conta(parcial: Partial<ContaReceber>): ContaReceber {
  return {
    id: ID_1,
    numero: 1,
    descricao: 'Mensalidade Outubro',
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
    valorRecebido: '0.00',
    saldo: '150.50',
    valor: '150.50',
    dataVencimento: '2026-12-10',
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

const CONTAS = [
  conta({}),
  conta({
    id: ID_2,
    numero: 2,
    descricao: 'Procedimento Estético',
    pacienteNome: 'Maria Teste',
    status: 'RECEBIDO',
    contaBancariaId: CONTA_BANCARIA_ID,
    contaBancariaNome: 'Banco Teste',
    dataRecebimento: '2026-12-08',
    valorRecebido: '150.50',
    saldo: '0.00',
  }),
];

const CONTAS_BANCARIAS = {
  data: [
    {
      id: CONTA_BANCARIA_ID,
      nome: 'Banco Teste',
      tipo: 'CORRENTE',
      banco: null,
      agencia: null,
      conta: null,
      saldoInicial: '0',
      dataSaldoInicial: null,
      saldo: '0',
      ativo: true,
    },
    {
      id: CONTA_BANCARIA_2_ID,
      nome: 'Caixa Teste',
      tipo: 'CAIXA',
      banco: null,
      agencia: null,
      conta: null,
      saldoInicial: '0',
      dataSaldoInicial: null,
      saldo: '0',
      ativo: true,
    },
  ],
  total: 2,
};

function pagina(data: ContaReceber[]) {
  return json({ data, meta: { page: 1, pageSize: 10, total: data.length, totalPages: 1 } });
}

function planoContasVazio() {
  return json({ data: [], total: 0 });
}

type Corpo = Record<string, unknown>;

function corpoDe(init?: RequestInit): Corpo {
  return JSON.parse(String(init?.body)) as Corpo;
}

function parametros(fetchMock: ReturnType<typeof apiFalsa>) {
  const [url] = chamadasPara(fetchMock, API).at(-1) ?? [''];
  return Object.fromEntries(new URL(url, 'http://x').searchParams);
}

function api(rotas: Parameters<typeof apiFalsa>[0] = {}) {
  return apiFalsa({
    ...rotas,
    rotas: {
      [API]: () => pagina(CONTAS),
      [PLANO_CONTAS_API]: () => planoContasVazio(),
      [CONTAS_BANCARIAS_API]: () => json(CONTAS_BANCARIAS),
      ...rotas.rotas,
    },
  });
}

function renderTela(fetchMock = api()) {
  return { user: userEvent.setup(), ...renderApp('/receber', fetchMock) };
}

async function abrirMenu(user: ReturnType<typeof userEvent.setup>, linha: string, item: string) {
  const tr = (await screen.findByText(linha)).closest('tr') as HTMLElement;
  await user.click(within(tr).getByRole('button', { name: 'Ações' }));
  await user.click(await screen.findByRole('menuitem', { name: item }));
}

describe('Contas a Receber (/receber)', () => {
  it('mostra título, chips, ações e a grid com as colunas do inventário', async () => {
    const fetchMock = api();
    renderTela(fetchMock);

    expect(await screen.findByRole('heading', { name: 'Contas a Receber' })).toBeInTheDocument();
    expect(screen.getByText('Gerencie suas contas a receber e receitas.')).toBeVisible();
    const cabecalhos = within(await screen.findByRole('table')).getAllByRole('columnheader');
    expect(cabecalhos.map((c) => c.textContent)).toEqual([
      '#',
      'Descricao',
      'Cliente',
      'Valor',
      'Vencimento',
      'Status',
      'Contrato',
      'Saldo',
      'Ações',
    ]);
    for (const nome of [
      'Todos',
      'A vencer',
      'Vencido',
      'Pago',
      'Parcial',
      'Renegociado',
      'Cancelado',
    ]) {
      expect(screen.getByRole('button', { name: nome })).toBeVisible();
    }
    expect(screen.getByPlaceholderText('Buscar contas a receber...')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Nova Conta' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Exportar' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Colunas' })).toBeVisible();
    expect(parametros(fetchMock)).toMatchObject({ page: '1', pageSize: '10' });
  });

  it('formata valor, vencimento e status; cliente vazio vira "-"', async () => {
    renderTela();

    const l1 = (await screen.findByText('Mensalidade Outubro')).closest('tr') as HTMLElement;
    // Valor e Saldo (conta sem baixa: o saldo é o valor inteiro).
    expect(within(l1).getAllByText('R$ 150,50')).toHaveLength(2);
    expect(within(l1).getByText('10/12/2026')).toBeVisible();
    expect(within(l1).getByText('A vencer')).toBeVisible();
    // Cliente e Contrato vazios.
    expect(within(l1).getAllByText('-')).toHaveLength(2);

    const l2 = screen.getByText('Procedimento Estético').closest('tr') as HTMLElement;
    expect(within(l2).getByText('Maria Teste')).toBeVisible();
    expect(within(l2).getByText('Pago')).toBeVisible();
  });

  it('chips de status filtram na API; Todos volta à lista completa', async () => {
    const fetchMock = api();
    const { user } = renderTela(fetchMock);
    await screen.findByText('Mensalidade Outubro');

    await user.click(screen.getByRole('button', { name: 'Vencido' }));
    await waitFor(() => expect(parametros(fetchMock)).toMatchObject({ status: 'VENCIDO' }));

    await user.click(screen.getByRole('button', { name: 'Todos' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Todos' })).toHaveAttribute('aria-pressed', 'true'),
    );
  });

  it('filtro de período de vencimento envia vencimentoDe/vencimentoAte na API', async () => {
    const fetchMock = api();
    const { user } = renderTela(fetchMock);
    await screen.findByText('Mensalidade Outubro');

    await user.type(screen.getByLabelText('Vencimento de:'), '2026-12-01');
    await user.type(screen.getByLabelText('até:'), '2026-12-31');

    await waitFor(() =>
      expect(parametros(fetchMock)).toMatchObject({
        vencimentoDe: '2026-12-01',
        vencimentoAte: '2026-12-31',
      }),
    );
  });

  it('busca envia o texto na API', async () => {
    const fetchMock = api();
    const { user } = renderTela(fetchMock);
    await screen.findByText('Mensalidade Outubro');

    await user.type(screen.getByPlaceholderText('Buscar contas a receber...'), 'mensalidade');

    await waitFor(() => expect(parametros(fetchMock)).toMatchObject({ search: 'mensalidade' }));
  });

  it('Nova Conta: mostra os campos do inventário, Status Pendente e os botões', async () => {
    const { user } = renderTela();
    await screen.findByText('Mensalidade Outubro');

    await user.click(screen.getByRole('button', { name: 'Nova Conta' }));
    const modal = await screen.findByRole('dialog', { name: 'Nova Conta a Receber' });

    expect(within(modal).getByLabelText('Descrição')).toBeVisible();
    expect(within(modal).getByLabelText('Valor')).toBeVisible();
    expect(within(modal).getByLabelText('Data de Vencimento')).toBeVisible();
    expect(within(modal).getByLabelText('Documento')).toBeVisible();
    expect(within(modal).getByLabelText('Total Parcelas')).toBeVisible();
    expect(within(modal).getByLabelText('Observações')).toBeVisible();
    expect(within(modal).getByRole('combobox', { name: 'Status' })).toHaveTextContent('A vencer');
    expect(within(modal).getByRole('button', { name: 'Cancelar' })).toBeVisible();
    expect(within(modal).getByRole('button', { name: 'Cadastrar' })).toBeVisible();
  });

  it('Nova Conta: vazio mostra as mensagens obrigatórias e não envia', async () => {
    const fetchMock = api();
    const { user } = renderTela(fetchMock);
    await screen.findByText('Mensalidade Outubro');

    await user.click(screen.getByRole('button', { name: 'Nova Conta' }));
    const modal = await screen.findByRole('dialog', { name: 'Nova Conta a Receber' });
    await user.click(within(modal).getByRole('button', { name: 'Cadastrar' }));

    expect(await within(modal).findByText('Descrição é obrigatório.')).toBeVisible();
    expect(within(modal).getByText('O valor deve ser maior que zero')).toBeVisible();
    expect(within(modal).getByText('Data de vencimento é obrigatória.')).toBeVisible();
    expect(chamadasPara(fetchMock, API).filter(([, init]) => init?.method === 'POST')).toHaveLength(
      0,
    );
  });

  it('Nova Conta: preenche e envia POST, fecha o modal e recarrega a lista', async () => {
    let corpo: Corpo = {};
    const fetchMock = api({
      rotas: {
        [API]: (init) => {
          if (init?.method !== 'POST') return pagina(CONTAS);
          corpo = corpoDe(init);
          return json(
            conta({ id: '00000000-0000-4000-8000-0000000000c3', descricao: 'Nova' }),
            201,
          );
        },
      },
    });
    const { user } = renderTela(fetchMock);
    await screen.findByText('Mensalidade Outubro');

    await user.click(screen.getByRole('button', { name: 'Nova Conta' }));
    const modal = await screen.findByRole('dialog', { name: 'Nova Conta a Receber' });
    await user.type(within(modal).getByLabelText('Descrição'), 'Nova');
    await user.type(within(modal).getByLabelText('Valor'), '20000');
    await user.type(within(modal).getByLabelText('Data de Vencimento'), '2026-12-20');
    await user.click(within(modal).getByRole('button', { name: 'Cadastrar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(corpo).toMatchObject({ descricao: 'Nova', valor: 200, dataVencimento: '2026-12-20' });
    expect(
      chamadasPara(fetchMock, API).filter(([, i]) => !i?.method || i.method === 'GET'),
    ).toHaveLength(2);
  });

  it('Esc fecha o modal sem salvar', async () => {
    const { user } = renderTela();
    await screen.findByText('Mensalidade Outubro');

    await user.click(screen.getByRole('button', { name: 'Nova Conta' }));
    await screen.findByRole('dialog', { name: 'Nova Conta a Receber' });
    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('clicar na linha ou "Detalhar" abre o detalhe com os dados da conta', async () => {
    const { user } = renderTela();
    await abrirMenu(user, 'Procedimento Estético', 'Detalhar');

    const modal = await screen.findByRole('dialog', { name: 'Procedimento Estético' });
    expect(within(modal).getByText('Maria Teste')).toBeVisible();
    expect(within(modal).getByText('Pago')).toBeVisible();
    const fechar = within(modal).getAllByRole('button', { name: 'Fechar' });
    await user.click(fechar[0] as HTMLElement);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('menu ⋯ tem Detalhar, Editar e Excluir; Editar abre com os dados e envia PATCH', async () => {
    let corpo: Corpo = {};
    const { user } = renderTela(
      api({
        rotas: {
          [`${API}/${ID_1}`]: (init) => {
            corpo = corpoDe(init);
            return json(conta({ descricao: 'Mensalidade Novembro' }));
          },
        },
      }),
    );

    await abrirMenu(user, 'Mensalidade Outubro', 'Editar');
    const modal = await screen.findByRole('dialog', { name: 'Editar Conta a Receber' });
    const descricao = within(modal).getByLabelText('Descrição');
    expect(descricao).toHaveValue('Mensalidade Outubro');
    await user.clear(descricao);
    await user.type(descricao, 'Mensalidade Novembro');
    await user.click(within(modal).getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(corpo).toMatchObject({ descricao: 'Mensalidade Novembro', valor: 150.5 });
  });

  it('Conta Bancária e Data de Recebimento só aparecem com status Recebido (#46)', async () => {
    const { user } = renderTela();
    await screen.findByText('Mensalidade Outubro');

    await user.click(screen.getByRole('button', { name: 'Nova Conta' }));
    const modal = await screen.findByRole('dialog', { name: 'Nova Conta a Receber' });
    expect(within(modal).queryByLabelText('Data de Recebimento')).not.toBeInTheDocument();

    await user.click(within(modal).getByRole('combobox', { name: 'Status' }));
    await user.click(await screen.findByRole('option', { name: 'Pago' }));
    expect(await within(modal).findByLabelText('Data de Recebimento')).toBeVisible();
    expect(within(modal).getByRole('combobox', { name: 'Conta Bancária' })).toBeVisible();
  });

  it('Editar conta recebida: traz conta e data, troca a conta e envia no PATCH', async () => {
    let corpo: Corpo = {};
    const { user } = renderTela(
      api({
        rotas: {
          [`${API}/${ID_2}`]: (init) => {
            corpo = corpoDe(init);
            return json(CONTAS[1]);
          },
        },
      }),
    );

    await abrirMenu(user, 'Procedimento Estético', 'Editar');
    const modal = await screen.findByRole('dialog', { name: 'Editar Conta a Receber' });
    expect(within(modal).getByLabelText('Data de Recebimento')).toHaveValue('2026-12-08');
    const conta = within(modal).getByRole('combobox', { name: 'Conta Bancária' });
    await waitFor(() => expect(conta).toHaveTextContent('Banco Teste'));
    await user.click(conta);
    await user.click(await screen.findByRole('option', { name: 'Caixa Teste' }));
    await user.click(within(modal).getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(corpo).toMatchObject({
      status: 'RECEBIDO',
      contaBancariaId: CONTA_BANCARIA_2_ID,
      dataRecebimento: '2026-12-08',
    });
  });

  it('detalhe de conta recebida mostra a conta bancária e a data do recebimento', async () => {
    const { user } = renderTela();
    await abrirMenu(user, 'Procedimento Estético', 'Detalhar');

    const modal = await screen.findByRole('dialog', { name: 'Procedimento Estético' });
    expect(within(modal).getByText('Banco Teste')).toBeVisible();
    expect(within(modal).getByText('08/12/2026')).toBeVisible();
  });

  it('Excluir: confirma antes e envia DELETE; Cancelar não exclui', async () => {
    let excluidos = 0;
    const { user } = renderTela(
      api({
        rotas: {
          [`${API}/${ID_1}`]: () => {
            excluidos += 1;
            return json(conta({}));
          },
        },
      }),
    );

    await abrirMenu(user, 'Mensalidade Outubro', 'Excluir');
    const dialogo = await screen.findByRole('alertdialog', { name: 'Excluir Conta a Receber' });
    expect(dialogo).toHaveTextContent(
      'Tem certeza que deseja excluir a conta "Mensalidade Outubro"? Esta ação não pode ser desfeita.',
    );
    await user.click(within(dialogo).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(excluidos).toBe(0);

    await abrirMenu(user, 'Mensalidade Outubro', 'Excluir');
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Excluir' }),
    );
    await waitFor(() => expect(excluidos).toBe(1));
  });

  it('sem permissão de criar, editar, excluir e exportar, esconde os botões e as ações de Editar/Excluir', async () => {
    const somenteVer = PERMISSOES.filter((p) => p === 'financeiro.contas-receber.ver');
    const { user } = renderTela(api({ usuario: { ...USUARIO_TESTE, permissoes: somenteVer } }));

    await screen.findByText('Mensalidade Outubro');

    expect(screen.queryByRole('button', { name: 'Nova Conta' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Exportar' })).not.toBeInTheDocument();

    const tr = screen.getByText('Mensalidade Outubro').closest('tr') as HTMLElement;
    await user.click(within(tr).getByRole('button', { name: 'Ações' }));
    expect(screen.getByRole('menuitem', { name: 'Detalhar' })).toBeVisible();
    expect(screen.queryByRole('menuitem', { name: 'Editar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Excluir' })).not.toBeInTheDocument();
  });

  describe('Cancelar (issue #162)', { timeout: 20_000 }, () => {
    const ROTA_CANCELAR = `${API}/${ID_1}/cancelar`;
    const comMotivos = (rotas: NonNullable<Parameters<typeof apiFalsa>[0]>['rotas'] = {}) =>
      api({ rotas: { ...rotaMotivosCancelamento, ...rotas } });

    it('a conta pendente tem "Cancelar" no menu; a já fechada vem desabilitada', async () => {
      const { user } = renderTela(comMotivos());

      const pendente = (await screen.findByText('Mensalidade Outubro')).closest(
        'tr',
      ) as HTMLElement;
      await user.click(within(pendente).getByRole('button', { name: 'Ações' }));
      expect(await screen.findByRole('menuitem', { name: 'Cancelar' })).not.toHaveAttribute(
        'aria-disabled',
        'true',
      );
      await user.keyboard('{Escape}');

      const fechada = (await screen.findByText('Procedimento Estético')).closest(
        'tr',
      ) as HTMLElement;
      await user.click(within(fechada).getByRole('button', { name: 'Ações' }));
      expect(await screen.findByRole('menuitem', { name: 'Cancelar' })).toHaveAttribute(
        'aria-disabled',
        'true',
      );
    });

    it('pede o motivo da lista, envia motivo e observação e não exclui a conta', async () => {
      let corpo: Record<string, unknown> | null = null;
      const fetchMock = comMotivos({
        [ROTA_CANCELAR]: (init) => {
          corpo = corpoDe(init);
          return json({ ...CONTAS[0], status: 'CANCELADO' });
        },
      });
      const { user } = renderTela(fetchMock);

      await abrirMenu(user, 'Mensalidade Outubro', 'Cancelar');
      const modal = await screen.findByRole('dialog', { name: 'Cancelar conta a receber' });
      expect(within(modal).getByText(/Mensalidade Outubro/)).toBeVisible();

      await user.click(within(modal).getByRole('button', { name: 'Cancelar conta' }));
      expect(await within(modal).findByText('Motivo é obrigatório.')).toBeVisible();
      expect(corpo).toBeNull();

      await user.click(within(modal).getByRole('combobox', { name: /Motivo/ }));
      await user.click(await screen.findByRole('option', { name: 'Paciente desistiu' }));
      await user.type(within(modal).getByLabelText('Observação'), 'Lançamento duplicado');
      await user.click(within(modal).getByRole('button', { name: 'Cancelar conta' }));

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(corpo).toEqual({ motivoId: MOTIVO_ID, observacao: 'Lançamento duplicado' });
      expect(
        chamadasPara(fetchMock, `${API}/${ID_1}`).some(([, init]) => init?.method === 'DELETE'),
      ).toBe(false);
    });

    it('o motivo "Outro" exige a observação antes de enviar', async () => {
      let enviou = false;
      const { user } = renderTela(
        comMotivos({
          [ROTA_CANCELAR]: () => {
            enviou = true;
            return json({ ...CONTAS[0], status: 'CANCELADO' });
          },
        }),
      );

      await abrirMenu(user, 'Mensalidade Outubro', 'Cancelar');
      const modal = await screen.findByRole('dialog', { name: 'Cancelar conta a receber' });
      await user.click(within(modal).getByRole('combobox', { name: /Motivo/ }));
      await user.click(await screen.findByRole('option', { name: 'Outro' }));
      await user.click(within(modal).getByRole('button', { name: 'Cancelar conta' }));

      expect(await within(modal).findByText('Observação é obrigatória.')).toBeVisible();
      expect(enviou).toBe(false);
      expect(MOTIVO_OUTRO_ID).toBeTruthy();
    });

    it('o erro do servidor (409) aparece no modal e não fecha', async () => {
      const { user } = renderTela(
        comMotivos({
          [ROTA_CANCELAR]: () =>
            json(
              {
                statusCode: 409,
                code: 'CONTA_NAO_PENDENTE',
                message: 'Só é possível cancelar uma conta pendente.',
              },
              409,
            ),
        }),
      );

      await abrirMenu(user, 'Mensalidade Outubro', 'Cancelar');
      const modal = await screen.findByRole('dialog', { name: 'Cancelar conta a receber' });
      await user.click(within(modal).getByRole('combobox', { name: /Motivo/ }));
      await user.click(await screen.findByRole('option', { name: 'Paciente desistiu' }));
      await user.click(within(modal).getByRole('button', { name: 'Cancelar conta' }));

      expect(
        await within(modal).findByText('Só é possível cancelar uma conta pendente.'),
      ).toBeVisible();
      expect(screen.getByRole('dialog', { name: 'Cancelar conta a receber' })).toBeVisible();
    });

    it('sem a permissão editar, o menu não tem "Cancelar"', async () => {
      const semEditar = PERMISSOES.filter((p) => p !== 'financeiro.contas-receber.editar');
      const { user } = renderTela(
        api({
          usuario: { ...USUARIO_TESTE, permissoes: semEditar },
          rotas: rotaMotivosCancelamento,
        }),
      );

      const tr = (await screen.findByText('Mensalidade Outubro')).closest('tr') as HTMLElement;
      await user.click(within(tr).getByRole('button', { name: 'Ações' }));
      await screen.findByRole('menuitem', { name: 'Detalhar' });
      expect(screen.queryByRole('menuitem', { name: 'Cancelar' })).toBeNull();
    });
  });
});
