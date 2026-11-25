import {
  PERMISSOES,
  PREFERENCIAS_PADRAO,
  type CentroCusto,
  type ContaPagar,
  type ContaPagarDivergencia,
  type ContaPagarPossivelDuplicada,
} from '@torres/shared';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { apiFalsa, chamadasPara, json, renderApp, USUARIO_TESTE } from '@/test/render-app';
import { divergenciaEmCentavos, formatarCompetencia } from './regras-conta-pagar';

vi.setConfig({ testTimeout: 20_000 });

const API = '/api/financeiro/contas-pagar';
const CENTROS = '/api/financeiro/centros-custo';
const LOOKUP_CENTROS = '/api/lookups/centros-custo';
const ID_1 = '00000000-0000-4000-8000-0000000000c1';
const ID_2 = '00000000-0000-4000-8000-0000000000c2';
const CENTRO_1 = '00000000-0000-4000-8000-0000000000d1';
const CENTRO_2 = '00000000-0000-4000-8000-0000000000d2';

type Corpo = Record<string, unknown>;

function conta(parcial: Partial<ContaPagar> = {}): ContaPagar {
  return {
    id: ID_1,
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

function centro(parcial: Partial<CentroCusto> = {}): CentroCusto {
  return {
    id: CENTRO_1,
    nome: 'Administrativo',
    ativo: true,
    createdAt: '2026-11-01T12:00:00.000Z',
    updatedAt: '2026-11-01T12:00:00.000Z',
    ...parcial,
  };
}

const DIVERGENCIA: ContaPagarDivergencia = {
  baixaId: '00000000-0000-4000-8000-0000000000e1',
  contaPagarId: ID_1,
  numero: 7,
  descricao: 'Energia Novembro',
  beneficiarioNome: 'Distribuidora Alfa',
  valor: '300',
  valorPago: '320',
  divergencia: '20',
  justificativa: 'Multa por atraso',
  dataPagamento: '2026-11-04',
};

const DUPLICADA: ContaPagarPossivelDuplicada = {
  id: ID_2,
  numero: 4,
  descricao: 'Água Cuiaba anterior',
  beneficiarioNome: 'Distribuidora Alfa',
  valor: '150.5',
  dataVencimento: '2026-12-10',
  documento: 'NF-1',
  status: 'PENDENTE',
  motivos: ['MESMO_TITULO', 'MESMO_DOCUMENTO'],
};

function pagina<T>(data: T[]) {
  return json({ data, meta: { page: 1, pageSize: 10, total: data.length, totalPages: 1 } });
}

const corpoDe = (init?: RequestInit): Corpo => JSON.parse(String(init?.body)) as Corpo;

function api(rotas: NonNullable<Parameters<typeof apiFalsa>[0]>['rotas'] = {}, idioma?: 'en') {
  const usuario = idioma
    ? { ...USUARIO_TESTE, preferencias: { ...PREFERENCIAS_PADRAO, idioma } }
    : USUARIO_TESTE;
  return apiFalsa({
    usuario,
    rotas: {
      [API]: () => pagina([conta()]),
      [`${API}/duplicidade`]: () => json({ candidatos: [] }),
      [`${API}/divergencias`]: () => pagina([DIVERGENCIA]),
      [CENTROS]: () => pagina([centro(), centro({ id: CENTRO_2, nome: 'Clínico', ativo: false })]),
      [LOOKUP_CENTROS]: () => pagina([]),
      '/api/financeiro/plano-contas': () => json({ data: [], total: 0 }),
      '/api/financeiro/contas-bancarias': () => json({ data: [], total: 0 }),
      ...rotas,
    },
  });
}

function renderTela(fetchMock = api()) {
  return { user: userEvent.setup(), ...renderApp('/pagar', fetchMock) };
}

async function abrirNovaConta(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByText('Água Cuiaba');
  await user.click(screen.getByRole('button', { name: 'Nova Conta' }));
  return screen.findByRole('dialog', { name: 'Nova Conta a Pagar' });
}

async function preencherConta(
  user: ReturnType<typeof userEvent.setup>,
  modal: HTMLElement,
  descricao = 'Nova',
) {
  await user.type(within(modal).getByLabelText('Descrição'), descricao);
  await user.type(within(modal).getByLabelText('Valor'), '15050');
  await user.type(within(modal).getByLabelText('Data de Vencimento'), '2026-12-10');
}

async function abrirMenu(user: ReturnType<typeof userEvent.setup>, linha: string, item: string) {
  const tr = (await screen.findByText(linha)).closest('tr') as HTMLElement;
  await user.click(within(tr).getByRole('button', { name: 'Ações' }));
  await user.click(await screen.findByRole('menuitem', { name: item }));
}

describe('Contas a Pagar: competência, centro de custo e anexo (#163)', () => {
  it('o modal tem Competência, Centro de Custo e o anexo do documento', async () => {
    const { user } = renderTela();
    const modal = await abrirNovaConta(user);

    expect(within(modal).getByLabelText('Competência')).toBeVisible();
    expect(within(modal).getByText('Centro de Custo')).toBeVisible();
    expect(within(modal).getByLabelText('Documento anexo (boleto, fatura ou NF)')).toBeVisible();
  });

  it('envia a competência escolhida no POST', async () => {
    let corpo: Corpo = {};
    const { user } = renderTela(
      api({
        [API]: (init) => {
          if (init?.method !== 'POST') return pagina([conta()]);
          corpo = corpoDe(init);
          return json(conta({ competencia: '2026-11' }), 201);
        },
      }),
    );
    const modal = await abrirNovaConta(user);
    await preencherConta(user, modal);
    fireEvent.change(within(modal).getByLabelText('Competência'), { target: { value: '2026-11' } });
    await user.click(within(modal).getByRole('button', { name: 'Cadastrar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(corpo).toMatchObject({ competencia: '2026-11', centroCustoId: null });
    expect(corpo).not.toHaveProperty('duplicidadeConfirmada', true);
  });

  it('editar abre com a competência da conta', async () => {
    const { user } = renderTela(
      api({ [API]: () => pagina([conta({ competencia: '2026-10', centroCustoNome: 'Clínico' })]) }),
    );
    await abrirMenu(user, 'Água Cuiaba', 'Editar');
    const modal = await screen.findByRole('dialog', { name: 'Editar Conta a Pagar' });
    expect(within(modal).getByLabelText('Competência')).toHaveValue('2026-10');
  });

  it('o detalhe mostra competência, centro de custo e o link do documento', async () => {
    const link = `/api/arquivos/${ID_2}/link`;
    const { user } = renderTela(
      api({
        [API]: () =>
          pagina([
            conta({
              competencia: '2026-10',
              centroCustoId: CENTRO_1,
              centroCustoNome: 'Administrativo',
              documentoArquivoId: ID_2,
            }),
          ]),
        [`${API}/${ID_1}/baixas`]: () =>
          json([
            {
              id: '00000000-0000-4000-8000-0000000000f1',
              contaPagarId: ID_1,
              dataPagamento: '2026-11-04',
              valorPago: '170.5',
              juros: '0',
              desconto: '0',
              formaPagamentoId: null,
              formaPagamentoNome: null,
              contaBancariaId: null,
              contaBancariaNome: null,
              documento: null,
              observacoes: null,
              comprovanteArquivoId: null,
              divergencia: '20',
              justificativaDivergencia: 'Multa por atraso',
              createdAt: '2026-11-04T12:00:00.000Z',
            },
          ]),
        [link]: () =>
          json({
            url: 'https://arquivos.example.com/boleto.pdf',
            expiraEm: '2026-11-05T00:00:00.000Z',
          }),
      }),
    );
    await abrirMenu(user, 'Água Cuiaba', 'Detalhar');
    const modal = await screen.findByRole('dialog', { name: 'Água Cuiaba' });

    expect(within(modal).getByText('10/2026')).toBeVisible();
    expect(within(modal).getByText('Administrativo')).toBeVisible();
    expect(await within(modal).findByRole('link', { name: 'Abrir' })).toHaveAttribute(
      'href',
      'https://arquivos.example.com/boleto.pdf',
    );
    expect(await within(modal).findByText('Multa por atraso')).toBeVisible();
    expect(within(modal).getByText('R$ 20,00')).toBeVisible();
  });
});

describe('Contas a Pagar: alerta de duplicidade (#163)', () => {
  function apiComDuplicada(corpos: Corpo[]) {
    return api({
      [`${API}/duplicidade`]: () => json({ candidatos: [DUPLICADA] }),
      [API]: (init) => {
        if (init?.method !== 'POST') return pagina([conta()]);
        corpos.push(corpoDe(init));
        return json(conta({ id: ID_2, descricao: 'Nova' }), 201);
      },
    });
  }

  it('lançar uma conta parecida mostra o alerta antes de gravar', async () => {
    const corpos: Corpo[] = [];
    const { user } = renderTela(apiComDuplicada(corpos));
    const modal = await abrirNovaConta(user);
    await preencherConta(user, modal);
    await user.click(within(modal).getByRole('button', { name: 'Cadastrar' }));

    const alerta = await screen.findByRole('dialog', { name: 'Possível conta duplicada' });
    expect(within(alerta).getByText('#4 · Água Cuiaba anterior')).toBeVisible();
    expect(within(alerta).getByText(/Distribuidora Alfa · R\$ 150,50/)).toBeVisible();
    expect(
      within(alerta).getByText('Mesmo fornecedor, valor e vencimento · Mesmo número de documento'),
    ).toBeVisible();
    expect(corpos).toHaveLength(0);
  });

  it('Voltar mantém o formulário aberto e não grava', async () => {
    const corpos: Corpo[] = [];
    const { user } = renderTela(apiComDuplicada(corpos));
    const modal = await abrirNovaConta(user);
    await preencherConta(user, modal);
    await user.click(within(modal).getByRole('button', { name: 'Cadastrar' }));

    const alerta = await screen.findByRole('dialog', { name: 'Possível conta duplicada' });
    await user.click(within(alerta).getByRole('button', { name: 'Voltar' }));

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Possível conta duplicada' })).toBeNull(),
    );
    expect(screen.getByRole('dialog', { name: 'Nova Conta a Pagar' })).toBeVisible();
    expect(corpos).toHaveLength(0);
  });

  it('Lançar mesmo assim grava com duplicidadeConfirmada e fecha', async () => {
    const corpos: Corpo[] = [];
    const { user } = renderTela(apiComDuplicada(corpos));
    const modal = await abrirNovaConta(user);
    await preencherConta(user, modal);
    await user.click(within(modal).getByRole('button', { name: 'Cadastrar' }));

    const alerta = await screen.findByRole('dialog', { name: 'Possível conta duplicada' });
    await user.click(within(alerta).getByRole('button', { name: 'Lançar mesmo assim' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(corpos).toHaveLength(1);
    expect(corpos[0]).toMatchObject({ descricao: 'Nova', duplicidadeConfirmada: true });
  });

  it('se a API acusar a duplicidade no envio (409), mostra o alerta', async () => {
    let consultas = 0;
    const fetchMock = api({
      [`${API}/duplicidade`]: () => {
        consultas += 1;
        // A primeira consulta (antes de enviar) não vê nada; a segunda, depois do 409, vê.
        return json({ candidatos: consultas === 1 ? [] : [DUPLICADA] });
      },
      [API]: (init) => {
        if (init?.method !== 'POST') return pagina([conta()]);
        return json(
          { statusCode: 409, code: 'CONTA_PAGAR_POSSIVEL_DUPLICADA', message: 'dup' },
          409,
        );
      },
    });
    const { user } = renderTela(fetchMock);
    const modal = await abrirNovaConta(user);
    await preencherConta(user, modal);
    await user.click(within(modal).getByRole('button', { name: 'Cadastrar' }));

    expect(await screen.findByRole('dialog', { name: 'Possível conta duplicada' })).toBeVisible();
  });

  it('falha na consulta de duplicidade não trava o cadastro', async () => {
    const corpos: Corpo[] = [];
    const { user } = renderTela(
      api({
        [`${API}/duplicidade`]: () => json({ statusCode: 500, code: 'INTERNAL_ERROR' }, 500),
        [API]: (init) => {
          if (init?.method !== 'POST') return pagina([conta()]);
          corpos.push(corpoDe(init));
          return json(conta({ id: ID_2 }), 201);
        },
      }),
    );
    const modal = await abrirNovaConta(user);
    await preencherConta(user, modal);
    await user.click(within(modal).getByRole('button', { name: 'Cadastrar' }));

    await waitFor(() => expect(corpos).toHaveLength(1));
  });

  it('consulta a duplicidade só com os campos que identificam o título', async () => {
    const fetchMock = apiComDuplicada([]);
    const { user } = renderTela(fetchMock);
    const modal = await abrirNovaConta(user);
    await preencherConta(user, modal);
    await user.type(within(modal).getByLabelText('Documento'), 'NF-1');
    await user.click(within(modal).getByRole('button', { name: 'Cadastrar' }));
    await screen.findByRole('dialog', { name: 'Possível conta duplicada' });

    const [, init] = chamadasPara(fetchMock, `${API}/duplicidade`).at(-1) ?? [];
    expect(corpoDe(init)).toEqual({
      beneficiarioTipo: 'FORNECEDOR',
      beneficiarioId: null,
      valor: 150.5,
      dataVencimento: '2026-12-10',
      documento: 'NF-1',
    });
  });
});

describe('Contas a Pagar: divergência na baixa (#163)', () => {
  it('formatarCompetencia mostra MM/AAAA e trata o vazio', () => {
    expect(formatarCompetencia('2026-11')).toBe('11/2026');
    expect(formatarCompetencia(null)).toBeNull();
    expect(formatarCompetencia('')).toBeNull();
  });

  it('divergenciaEmCentavos compara o valor pago com o saldo do título', () => {
    expect(divergenciaEmCentavos(150.5, 150.5, false)).toBe(0);
    expect(divergenciaEmCentavos(150.5, 170.5, false)).toBe(2000);
    expect(divergenciaEmCentavos(150.5, 100, false)).toBe(-5050);
    // 0,1 + 0,2 não vira diferença de ponto flutuante.
    expect(divergenciaEmCentavos(0.3, 0.1 + 0.2, false)).toBe(0);
    expect(divergenciaEmCentavos(150.5, null, false)).toBe(-15050);
  });

  it('pagamento parcial abaixo do saldo não é divergência; acima do saldo é', () => {
    expect(divergenciaEmCentavos(150.5, 100, true)).toBe(0);
    expect(divergenciaEmCentavos(150.5, 170.5, true)).toBe(2000);
  });

  async function abrirBaixa(user: ReturnType<typeof userEvent.setup>) {
    await abrirMenu(user, 'Água Cuiaba', 'Editar Baixa');
    return screen.findByRole('dialog', { name: 'Baixar Conta a Pagar' });
  }

  async function informarValorPago(
    user: ReturnType<typeof userEvent.setup>,
    modal: HTMLElement,
    digitos: string,
  ) {
    await user.click(within(modal).getByRole('checkbox', { name: 'Pagamento parcial' }));
    const campo = within(modal).getByLabelText(/^Valor Pago/);
    await user.clear(campo);
    await user.type(campo, digitos);
  }

  it('valor pago igual ao saldo não pede justificativa', async () => {
    const { user } = renderTela();
    const modal = await abrirBaixa(user);
    expect(within(modal).queryByLabelText(/Justificativa da divergência/)).toBeNull();
  });

  it('valor pago acima do saldo exige justificativa e não envia sem ela', async () => {
    const fetchMock = api();
    const { user } = renderTela(fetchMock);
    const modal = await abrirBaixa(user);
    await informarValorPago(user, modal, '17050');

    expect(await within(modal).findByLabelText(/Justificativa da divergência/)).toBeVisible();
    expect(
      within(modal).getByText(/O valor pago é diferente do saldo do título \(R\$ 150,50\)/),
    ).toBeVisible();

    await user.click(within(modal).getByRole('button', { name: 'Confirmar Baixa' }));
    expect(await within(modal).findByText('Justificativa é obrigatória.')).toBeVisible();
    expect(
      chamadasPara(fetchMock, `${API}/${ID_1}/baixar`).filter(([, i]) => i?.method === 'POST'),
    ).toHaveLength(0);
  });

  it('com a justificativa, envia a baixa divergente e o pagamento parcial', async () => {
    let corpo: Corpo = {};
    const { user } = renderTela(
      api({
        [`${API}/${ID_1}/baixar`]: (init) => {
          corpo = corpoDe(init);
          return json(conta({ status: 'PAGO', valorPago: '170.5' }));
        },
      }),
    );
    const modal = await abrirBaixa(user);
    await informarValorPago(user, modal, '17050');
    await user.type(
      await within(modal).findByLabelText(/Justificativa da divergência/),
      'Multa por atraso',
    );
    await user.click(within(modal).getByRole('button', { name: 'Confirmar Baixa' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(corpo).toMatchObject({
      valorPago: 170.5,
      pagamentoParcial: true,
      justificativaDivergencia: 'Multa por atraso',
    });
  });

  it('pagamento parcial abaixo do saldo não pede justificativa e envia pagamentoParcial', async () => {
    let corpo: Corpo = {};
    const { user } = renderTela(
      api({
        [`${API}/${ID_1}/baixar`]: (init) => {
          corpo = corpoDe(init);
          return json(conta({ valorPago: '100' }));
        },
      }),
    );
    const modal = await abrirBaixa(user);
    await informarValorPago(user, modal, '10000');
    expect(within(modal).queryByLabelText(/Justificativa da divergência/)).toBeNull();
    await user.click(within(modal).getByRole('button', { name: 'Confirmar Baixa' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(corpo).toMatchObject({
      valorPago: 100,
      pagamentoParcial: true,
      justificativaDivergencia: null,
    });
  });
});

describe('Contas a Pagar: aba Divergências (#163)', () => {
  it('lista as baixas com divergência, com as colunas do relatório', async () => {
    const fetchMock = api();
    const { user } = renderTela(fetchMock);
    await screen.findByText('Água Cuiaba');
    await user.click(screen.getByRole('tab', { name: 'Divergências' }));

    const tabela = await screen.findByRole('table');
    expect(
      within(tabela)
        .getAllByRole('columnheader')
        .map((c) => c.textContent),
    ).toEqual([
      '#',
      'Descrição',
      'Fornecedor / Funcionário',
      'Valor do título',
      'Valor pago',
      'Divergência',
      'Justificativa',
      'Data do pagamento',
    ]);
    const linha = (await within(tabela).findByText('Energia Novembro')).closest(
      'tr',
    ) as HTMLElement;
    expect(within(linha).getByText('Distribuidora Alfa')).toBeVisible();
    expect(within(linha).getByText('R$ 300,00')).toBeVisible();
    expect(within(linha).getByText('R$ 320,00')).toBeVisible();
    expect(within(linha).getByText('R$ 20,00')).toBeVisible();
    expect(within(linha).getByText('Multa por atraso')).toBeVisible();
    expect(within(linha).getByText('04/11/2026')).toBeVisible();
    expect(chamadasPara(fetchMock, `${API}/divergencias`).length).toBeGreaterThan(0);
  });

  it('mostra o estado vazio e o botão Exportar para quem pode exportar', async () => {
    const { user } = renderTela(api({ [`${API}/divergencias`]: () => pagina([]) }));
    await screen.findByText('Água Cuiaba');
    await user.click(screen.getByRole('tab', { name: 'Divergências' }));

    expect(await screen.findByText('Nenhuma divergência registrada.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Exportar' })).toBeVisible();
  });

  it('sem permissão de exportar, não mostra o botão Exportar', async () => {
    const permissoes = PERMISSOES.filter((p) => p !== 'financeiro.contas-pagar.exportar');
    const user = userEvent.setup();
    renderApp(
      '/pagar',
      apiFalsa({
        usuario: { ...USUARIO_TESTE, permissoes },
        rotas: {
          [API]: () => pagina([conta()]),
          [`${API}/divergencias`]: () => pagina([DIVERGENCIA]),
        },
      }),
    );
    await screen.findByText('Água Cuiaba');
    await user.click(screen.getByRole('tab', { name: 'Divergências' }));

    expect(await screen.findByText('Energia Novembro')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Exportar' })).toBeNull();
  });
});

describe('Contas a Pagar: aba Centros de Custo (#163)', () => {
  async function abrirAba(user: ReturnType<typeof userEvent.setup>, fetchMock = api()) {
    renderApp('/pagar', fetchMock);
    await screen.findByText('Água Cuiaba');
    await user.click(screen.getByRole('tab', { name: 'Centros de Custo' }));
    await screen.findByText('Administrativo');
  }

  it('lista os centros com o status e as ações', async () => {
    const user = userEvent.setup();
    await abrirAba(user);

    const ativo = screen.getByText('Administrativo').closest('tr') as HTMLElement;
    expect(within(ativo).getByText('Ativo')).toBeVisible();
    const inativo = screen.getByText('Clínico').closest('tr') as HTMLElement;
    expect(within(inativo).getByText('Inativo')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Novo Centro de Custo' })).toBeVisible();
  });

  it('Novo Centro de Custo: exige o nome e envia o POST', async () => {
    const corpos: Corpo[] = [];
    const user = userEvent.setup();
    await abrirAba(
      user,
      api({
        [CENTROS]: (init) => {
          if (init?.method !== 'POST') return pagina([centro()]);
          corpos.push(corpoDe(init));
          return json(centro({ id: CENTRO_2, nome: 'Clínico' }), 201);
        },
      }),
    );

    await user.click(screen.getByRole('button', { name: 'Novo Centro de Custo' }));
    const modal = await screen.findByRole('dialog', { name: 'Novo Centro de Custo' });
    await user.click(within(modal).getByRole('button', { name: 'Cadastrar' }));
    expect(await within(modal).findByText('Nome é obrigatório.')).toBeVisible();
    expect(corpos).toHaveLength(0);

    await user.type(within(modal).getByLabelText(/Nome/), ' Clínico ');
    await user.click(within(modal).getByRole('button', { name: 'Cadastrar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(corpos).toEqual([{ nome: 'Clínico' }]);
  });

  it('Editar abre com o nome e envia o PATCH', async () => {
    const corpos: Corpo[] = [];
    const user = userEvent.setup();
    await abrirAba(
      user,
      api({
        [`${CENTROS}/${CENTRO_1}`]: (init) => {
          corpos.push(corpoDe(init));
          return json(centro({ nome: 'Administração' }));
        },
      }),
    );

    await abrirMenu(user, 'Administrativo', 'Editar');
    const modal = await screen.findByRole('dialog', { name: 'Editar Centro de Custo' });
    const campo = within(modal).getByLabelText(/Nome/);
    expect(campo).toHaveValue('Administrativo');
    await user.clear(campo);
    await user.type(campo, 'Administração');
    await user.click(within(modal).getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(corpos).toEqual([{ nome: 'Administração' }]));
  });

  it('Desativar e Ativar alternam o interruptor da linha', async () => {
    const corpos: Corpo[] = [];
    const user = userEvent.setup();
    await abrirAba(
      user,
      api({
        [`${CENTROS}/${CENTRO_1}`]: (init) => {
          corpos.push(corpoDe(init));
          return json(centro({ ativo: false }));
        },
        [`${CENTROS}/${CENTRO_2}`]: (init) => {
          corpos.push(corpoDe(init));
          return json(centro({ id: CENTRO_2, ativo: true }));
        },
      }),
    );

    await abrirMenu(user, 'Administrativo', 'Desativar');
    await waitFor(() => expect(corpos).toEqual([{ ativo: false }]));
    await abrirMenu(user, 'Clínico', 'Ativar');
    await waitFor(() => expect(corpos).toEqual([{ ativo: false }, { ativo: true }]));
  });

  it('Excluir confirma antes e envia o DELETE; Cancelar não exclui', async () => {
    let excluidos = 0;
    const user = userEvent.setup();
    await abrirAba(
      user,
      api({
        [`${CENTROS}/${CENTRO_1}`]: () => {
          excluidos += 1;
          return json(centro());
        },
      }),
    );

    await abrirMenu(user, 'Administrativo', 'Excluir');
    const dialogo = await screen.findByRole('alertdialog', { name: 'Excluir Centro de Custo' });
    expect(within(dialogo).getByText(/centro de custo "Administrativo"/)).toBeVisible();
    await user.click(within(dialogo).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(excluidos).toBe(0);

    await abrirMenu(user, 'Administrativo', 'Excluir');
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Excluir' }),
    );
    await waitFor(() => expect(excluidos).toBe(1));
  });

  it('sem permissão de criar, editar e excluir, esconde o botão e as ações', async () => {
    const user = userEvent.setup();
    const somenteVer = PERMISSOES.filter((p) => p === 'financeiro.contas-pagar.ver');
    await abrirAba(
      user,
      apiFalsa({
        usuario: { ...USUARIO_TESTE, permissoes: somenteVer },
        rotas: {
          [API]: () => pagina([conta()]),
          [CENTROS]: () => pagina([centro()]),
        },
      }),
    );

    expect(screen.queryByRole('button', { name: 'Novo Centro de Custo' })).toBeNull();
    const tr = screen.getByText('Administrativo').closest('tr') as HTMLElement;
    expect(within(tr).queryByRole('button', { name: 'Ações' })).toBeNull();
  });
});

describe('Contas a Pagar: textos em inglês (#163)', () => {
  it('traduz os campos novos, o alerta de duplicidade, a justificativa e as abas', async () => {
    const corpos: Corpo[] = [];
    const fetchMock = api(
      {
        [`${API}/duplicidade`]: () => json({ candidatos: [DUPLICADA] }),
        [API]: (init) => {
          if (init?.method === 'POST') corpos.push(corpoDe(init));
          return pagina([conta()]);
        },
      },
      'en',
    );
    renderApp('/pagar', fetchMock);
    const user = userEvent.setup();

    expect(await screen.findByRole('tab', { name: 'Discrepancies' })).toBeVisible();
    expect(screen.getByRole('tab', { name: 'Cost Centers' })).toBeVisible();

    await user.click(await screen.findByRole('button', { name: 'Nova Conta' }));
    const modal = await screen.findByRole('dialog', { name: 'Nova Conta a Pagar' });
    expect(within(modal).getByLabelText('Accounting period')).toBeVisible();
    expect(within(modal).getByText('Cost Center')).toBeVisible();
    expect(
      within(modal).getByLabelText('Attached document (invoice, bill or receipt)'),
    ).toBeVisible();

    await user.type(within(modal).getByLabelText('Descrição'), 'Nova');
    await user.type(within(modal).getByLabelText('Valor'), '15050');
    await user.type(within(modal).getByLabelText('Data de Vencimento'), '2026-12-10');
    await user.click(within(modal).getByRole('button', { name: 'Cadastrar' }));

    const alerta = await screen.findByRole('dialog', { name: 'Possible duplicate payable' });
    expect(
      within(alerta).getByText('Same supplier, amount and due date · Same document number'),
    ).toBeVisible();
    expect(within(alerta).getByRole('button', { name: 'Record anyway' })).toBeVisible();
    expect(corpos).toHaveLength(0);

    await user.click(within(alerta).getByRole('button', { name: 'Back' }));
    await user.click(within(modal).getByRole('button', { name: 'Cancel' }));
    await user.click(screen.getByRole('tab', { name: 'Discrepancies' }));
    expect(
      await screen.findByText('Payments whose amount differs from the bill balance.'),
    ).toBeVisible();
    expect(await screen.findByRole('columnheader', { name: 'Amount paid' })).toBeVisible();
  });
});
