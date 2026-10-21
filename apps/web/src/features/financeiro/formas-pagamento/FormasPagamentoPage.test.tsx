import { PERMISSOES, type Bandeira, type FormaPagamento } from '@torres/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { apiFalsa, chamadasPara, json, renderApp, USUARIO_TESTE } from '@/test/render-app';

vi.setConfig({ testTimeout: 20_000 });

const API = '/api/financeiro/formas-pagamento';
const API_BANDEIRAS = '/api/financeiro/bandeiras';
const ID_1 = '00000000-0000-4000-8000-0000000000c1';
const ID_2 = '00000000-0000-4000-8000-0000000000c2';

function forma(parcial: Partial<FormaPagamento>): FormaPagamento {
  return {
    id: ID_1,
    nome: 'teste',
    finalidade: 'RECEBER',
    tipo: 'DINHEIRO',
    prazoRecebimentoDias: 0,
    maxParcelas: 1,
    movimentaContaBancaria: true,
    ativo: true,
    createdAt: '2026-10-14T12:00:00.000Z',
    updatedAt: '2026-10-14T12:00:00.000Z',
    ...parcial,
  };
}

const FORMAS = [
  forma({}),
  forma({
    id: ID_2,
    nome: 'Cartão',
    tipo: 'CARTAO_CREDITO',
    prazoRecebimentoDias: 30,
    maxParcelas: 12,
    ativo: false,
  }),
];

function pagina<T>(data: T[]) {
  return json({ data, meta: { page: 1, pageSize: 10, total: data.length, totalPages: 1 } });
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
      [API]: () => pagina(FORMAS),
      [API_BANDEIRAS]: () => pagina([]),
      ...rotas.rotas,
    },
  });
}

function renderTela(fetchMock = api()) {
  return { user: userEvent.setup(), ...renderApp('/formas-pgto', fetchMock) };
}

function linha(nome: string) {
  return screen.getByText(nome).closest('tr') as HTMLElement;
}

describe('Formas de Pagamento (/formas-pgto)', () => {
  it('mostra título, abas e a grid com as colunas e os valores formatados', async () => {
    const fetchMock = api();
    renderTela(fetchMock);

    expect(await screen.findByRole('heading', { name: 'Formas de Pagamento' })).toBeVisible();
    expect(
      screen.getByText('Gerencie formas de pagamento, bandeiras e taxas de cartão.'),
    ).toBeVisible();
    expect(screen.getAllByRole('tab').map((a) => a.textContent)).toEqual([
      'Formas de Pagamento',
      'Bandeiras',
      'Taxas por Bandeira',
    ]);
    const cabecalhos = within(await screen.findByRole('table')).getAllByRole('columnheader');
    expect(cabecalhos.map((c) => c.textContent)).toEqual([
      'Nome',
      'Finalidade',
      'Tipo',
      'Prazo',
      'Max. Parcelas',
      'Status',
      'Ações',
    ]);
    await screen.findByText('teste');
    const teste = linha('teste');
    expect(within(teste).getByText('Receber')).toBeVisible();
    expect(within(teste).getByText('Dinheiro')).toBeVisible();
    expect(within(teste).getByText('0 dias')).toBeVisible();
    expect(within(teste).getByText('1x')).toBeVisible();
    expect(within(teste).getByText('Ativo')).toBeVisible();
    const cartao = linha('Cartão');
    expect(within(cartao).getByText('Cartão de Crédito')).toBeVisible();
    expect(within(cartao).getByText('30 dias')).toBeVisible();
    expect(within(cartao).getByText('12x')).toBeVisible();
    expect(within(cartao).getByText('Inativo')).toBeVisible();
    expect(screen.getByPlaceholderText('Buscar formas de pagamento...')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Nova Forma de Pagamento' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Exportar' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Colunas' })).toBeVisible();
    expect(parametros(fetchMock)).toMatchObject({ page: '1', pageSize: '10' });
  });

  it('ordenar por Nome, Tipo, Prazo, Max. Parcelas e Status chama a API com o sort', async () => {
    const fetchMock = api();
    const { user } = renderTela(fetchMock);
    await screen.findByText('teste');

    const colunas = {
      Nome: 'nome',
      Tipo: 'tipo',
      Prazo: 'prazoRecebimentoDias',
      'Max. Parcelas': 'maxParcelas',
      Status: 'ativo',
    };
    for (const [titulo, campo] of Object.entries(colunas)) {
      await user.click(screen.getByRole('button', { name: titulo }));
      await waitFor(() => expect(parametros(fetchMock)).toMatchObject({ sort: `${campo}:asc` }));
    }
  });

  it('busca envia o texto na API', async () => {
    const fetchMock = api();
    const { user } = renderTela(fetchMock);
    await screen.findByText('teste');

    await user.type(screen.getByPlaceholderText('Buscar formas de pagamento...'), 'cart');

    await waitFor(() => expect(parametros(fetchMock)).toMatchObject({ search: 'cart' }));
  });

  it('Nova Forma de Pagamento: campos, padrões e botões', async () => {
    const { user } = renderTela();
    await screen.findByText('teste');

    await user.click(screen.getByRole('button', { name: 'Nova Forma de Pagamento' }));
    const modal = await screen.findByRole('dialog', { name: 'Nova Forma de Pagamento' });

    expect(within(modal).getByPlaceholderText('Nome da forma de pagamento')).toBeVisible();
    expect(within(modal).getByRole('combobox', { name: 'Finalidade' })).toHaveTextContent(
      'Vendas / Recebimento',
    );
    expect(within(modal).getByRole('combobox', { name: 'Tipo' })).toHaveTextContent('Dinheiro');
    expect(within(modal).getByLabelText('Prazo Recebimento (dias)')).toHaveValue(0);
    expect(within(modal).getByLabelText('Max. Parcelas')).toHaveValue(1);
    expect(within(modal).getByText('Ex: 12 para até 12x')).toBeVisible();
    expect(within(modal).getByRole('checkbox', { name: 'Movimenta conta bancária' })).toBeChecked();
    expect(within(modal).getByRole('button', { name: 'Cancelar' })).toBeVisible();
    expect(within(modal).getByRole('button', { name: 'Criar' })).toBeVisible();
  });

  it('Nova Forma de Pagamento: só o Nome é obrigatório e a mensagem aparece sem enviar', async () => {
    const fetchMock = api();
    const { user } = renderTela(fetchMock);
    await screen.findByText('teste');

    await user.click(screen.getByRole('button', { name: 'Nova Forma de Pagamento' }));
    const modal = await screen.findByRole('dialog', { name: 'Nova Forma de Pagamento' });
    await user.click(within(modal).getByRole('button', { name: 'Criar' }));

    expect(await within(modal).findByText('Nome é obrigatório.')).toBeVisible();
    expect(chamadasPara(fetchMock, API).filter(([, i]) => i?.method === 'POST')).toHaveLength(0);
  });

  it('Nova Forma de Pagamento: só com o nome envia os padrões, fecha e recarrega a lista', async () => {
    let corpo: Corpo = {};
    const fetchMock = api({
      rotas: {
        [API]: (init) => {
          if (init?.method !== 'POST') return pagina(FORMAS);
          corpo = corpoDe(init);
          return json(forma({ id: '00000000-0000-4000-8000-0000000000c3', nome: 'Pix' }), 201);
        },
      },
    });
    const { user } = renderTela(fetchMock);
    await screen.findByText('teste');

    await user.click(screen.getByRole('button', { name: 'Nova Forma de Pagamento' }));
    const modal = await screen.findByRole('dialog', { name: 'Nova Forma de Pagamento' });
    await user.type(within(modal).getByLabelText(/Nome/), 'Pix');
    await user.click(within(modal).getByRole('button', { name: 'Criar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(corpo).toEqual({
      nome: 'Pix',
      finalidade: 'receber',
      tipo: 'dinheiro',
      prazoRecebimentoDias: 0,
      maxParcelas: 1,
      movimentaContaBancaria: true,
    });
    expect(
      chamadasPara(fetchMock, API).filter(([, i]) => !i?.method || i.method === 'GET'),
    ).toHaveLength(2);
  });

  it('Nova Forma de Pagamento: envia os campos preenchidos', async () => {
    let corpo: Corpo = {};
    const { user } = renderTela(
      api({
        rotas: {
          [API]: (init) => {
            if (init?.method !== 'POST') return pagina(FORMAS);
            corpo = corpoDe(init);
            return json(forma({}), 201);
          },
        },
      }),
    );
    await screen.findByText('teste');

    await user.click(screen.getByRole('button', { name: 'Nova Forma de Pagamento' }));
    const modal = await screen.findByRole('dialog', { name: 'Nova Forma de Pagamento' });
    await user.type(within(modal).getByLabelText(/Nome/), 'Convênio X');
    await user.click(within(modal).getByRole('combobox', { name: 'Finalidade' }));
    await user.click(await screen.findByRole('option', { name: 'Compras / Pagamento' }));
    await user.click(within(modal).getByRole('combobox', { name: 'Tipo' }));
    await user.click(await screen.findByRole('option', { name: 'Convênio' }));
    await user.clear(within(modal).getByLabelText('Prazo Recebimento (dias)'));
    await user.type(within(modal).getByLabelText('Prazo Recebimento (dias)'), '30');
    await user.clear(within(modal).getByLabelText('Max. Parcelas'));
    await user.type(within(modal).getByLabelText('Max. Parcelas'), '6');
    await user.click(within(modal).getByRole('checkbox', { name: 'Movimenta conta bancária' }));
    await user.click(within(modal).getByRole('button', { name: 'Criar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(corpo).toEqual({
      nome: 'Convênio X',
      finalidade: 'pagar',
      tipo: 'convenio',
      prazoRecebimentoDias: 30,
      maxParcelas: 6,
      movimentaContaBancaria: false,
    });
  });

  it('Esc fecha o modal sem salvar', async () => {
    const { user } = renderTela();
    await screen.findByText('teste');

    await user.click(screen.getByRole('button', { name: 'Nova Forma de Pagamento' }));
    await screen.findByRole('dialog', { name: 'Nova Forma de Pagamento' });
    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('Editar abre com os dados e envia PATCH com Salvar', async () => {
    let corpo: Corpo = {};
    const { user } = renderTela(
      api({
        rotas: {
          [`${API}/${ID_2}`]: (init) => {
            corpo = corpoDe(init);
            return json(forma({ id: ID_2, nome: 'Cartão X' }));
          },
        },
      }),
    );
    await screen.findByText('Cartão');

    await user.click(within(linha('Cartão')).getByRole('button', { name: 'Editar Cartão' }));
    const modal = await screen.findByRole('dialog', { name: 'Editar Forma de Pagamento' });
    const nome = within(modal).getByLabelText(/Nome/);
    expect(nome).toHaveValue('Cartão');
    expect(within(modal).getByRole('combobox', { name: 'Tipo' })).toHaveTextContent(
      'Cartão de Crédito',
    );
    expect(within(modal).getByLabelText('Prazo Recebimento (dias)')).toHaveValue(30);
    expect(within(modal).getByLabelText('Max. Parcelas')).toHaveValue(12);
    await user.clear(nome);
    await user.type(nome, 'Cartão X');
    await user.click(within(modal).getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(corpo).toEqual({
      nome: 'Cartão X',
      finalidade: 'receber',
      tipo: 'cartao_credito',
      prazoRecebimentoDias: 30,
      maxParcelas: 12,
      movimentaContaBancaria: true,
    });
  });

  it('Desativar muda só o status, sem confirmação, e mostra o toast', async () => {
    const corpos: Corpo[] = [];
    const { user } = renderTela(
      api({
        rotas: {
          [`${API}/${ID_1}`]: (init) => {
            corpos.push(corpoDe(init));
            return json(forma({ ativo: false }));
          },
        },
      }),
    );
    await screen.findByText('teste');

    await user.click(within(linha('teste')).getByRole('button', { name: 'Desativar teste' }));

    await waitFor(() => expect(corpos).toEqual([{ ativo: false }]));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(await screen.findByText('teste desativada!')).toBeVisible();
  });

  it('Ativar muda só o status, sem confirmação, e mostra o toast', async () => {
    const corpos: Corpo[] = [];
    const { user } = renderTela(
      api({
        rotas: {
          [`${API}/${ID_2}`]: (init) => {
            corpos.push(corpoDe(init));
            return json(forma({ id: ID_2, nome: 'Cartão', ativo: true }));
          },
        },
      }),
    );
    await screen.findByText('Cartão');

    await user.click(within(linha('Cartão')).getByRole('button', { name: 'Ativar Cartão' }));

    await waitFor(() => expect(corpos).toEqual([{ ativo: true }]));
    expect(await screen.findByText('Cartão ativada!')).toBeVisible();
  });

  it('Excluir: confirma antes e envia DELETE; Cancelar não exclui', async () => {
    let excluidas = 0;
    const { user } = renderTela(
      api({
        rotas: {
          [`${API}/${ID_1}`]: () => {
            excluidas += 1;
            return json(forma({}));
          },
        },
      }),
    );
    await screen.findByText('teste');

    await user.click(within(linha('teste')).getByRole('button', { name: 'Excluir teste' }));
    const dialogo = await screen.findByRole('alertdialog', { name: 'Excluir Forma de Pagamento' });
    expect(dialogo).toHaveTextContent('Tem certeza que deseja excluir "teste"?');
    await user.click(within(dialogo).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(excluidas).toBe(0);

    await user.click(within(linha('teste')).getByRole('button', { name: 'Excluir teste' }));
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Excluir' }),
    );
    await waitFor(() => expect(excluidas).toBe(1));
  });

  it('Colunas: Nome, Tipo, Prazo, Max. Parcelas e Status podem ser ocultadas', async () => {
    const { user } = renderTela();
    await screen.findByText('teste');

    await user.click(screen.getByRole('button', { name: 'Colunas' }));

    for (const nome of ['Nome', 'Tipo', 'Prazo', 'Max. Parcelas', 'Status']) {
      expect(await screen.findByRole('menuitemcheckbox', { name: nome })).toBeVisible();
    }
    expect(screen.queryByRole('menuitemcheckbox', { name: 'Finalidade' })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitemcheckbox', { name: 'Ações' })).not.toBeInTheDocument();
  });

  it('aba Bandeiras: estado vazio, Nova Bandeira com padrão e obrigatório, e criação', async () => {
    let corpo: Corpo = {};
    const bandeira: Bandeira = {
      id: '00000000-0000-4000-8000-0000000000d1',
      nome: 'Visa',
      icone: 'fa-cc-visa',
      ativo: true,
      createdAt: '2026-10-14T12:00:00.000Z',
      updatedAt: '2026-10-14T12:00:00.000Z',
    };
    const { user } = renderTela(
      api({
        rotas: {
          [API_BANDEIRAS]: (init) => {
            if (init?.method !== 'POST') return pagina([]);
            corpo = corpoDe(init);
            return json(bandeira, 201);
          },
        },
      }),
    );
    await screen.findByText('teste');

    await user.click(screen.getByRole('tab', { name: 'Bandeiras' }));
    expect(await screen.findByText('Nenhuma bandeira cadastrada')).toBeVisible();
    expect(screen.getByText('Cadastre Visa, Mastercard, Elo, etc.')).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Nova Forma de Pagamento' }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Nova Bandeira' }));
    const modal = await screen.findByRole('dialog', { name: 'Nova Bandeira' });
    expect(within(modal).getByLabelText('Icone (FontAwesome)')).toHaveValue('fa-credit-card');
    expect(
      within(modal).getByText('Ex: fa-cc-visa, fa-cc-mastercard, fa-credit-card'),
    ).toBeVisible();
    await user.click(within(modal).getByRole('button', { name: 'Criar' }));
    expect(await within(modal).findByText('Nome é obrigatório.')).toBeVisible();

    await user.type(within(modal).getByLabelText(/Nome/), 'Visa');
    await user.clear(within(modal).getByLabelText('Icone (FontAwesome)'));
    await user.type(within(modal).getByLabelText('Icone (FontAwesome)'), 'fa-cc-visa');
    await user.click(within(modal).getByRole('button', { name: 'Criar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(corpo).toEqual({ nome: 'Visa', icone: 'fa-cc-visa' });
  });

  it('aba Bandeiras lista as bandeiras cadastradas', async () => {
    const { user } = renderTela(
      api({
        rotas: {
          [API_BANDEIRAS]: () =>
            pagina<Bandeira>([
              {
                id: '00000000-0000-4000-8000-0000000000d2',
                nome: 'Elo',
                icone: 'fa-credit-card',
                ativo: true,
                createdAt: '2026-10-14T12:00:00.000Z',
                updatedAt: '2026-10-14T12:00:00.000Z',
              },
            ]),
        },
      }),
    );
    await screen.findByText('teste');

    await user.click(screen.getByRole('tab', { name: 'Bandeiras' }));

    expect(await screen.findByText('Elo')).toBeVisible();
    expect(screen.queryByText('Nenhuma bandeira cadastrada')).not.toBeInTheDocument();
  });

  it('aba Taxas por Bandeira: canal, estado vazio e Salvar Taxas desabilitado', async () => {
    const { user } = renderTela();
    await screen.findByText('teste');

    await user.click(screen.getByRole('tab', { name: 'Taxas por Bandeira' }));

    expect(screen.getByRole('combobox', { name: 'Canal' })).toHaveTextContent(
      'Maquininha / InfiniteTap',
    );
    expect(screen.getByText('Nenhuma taxa cadastrada para este canal')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Salvar Taxas' })).toBeDisabled();
    await user.click(screen.getByRole('combobox', { name: 'Canal' }));
    expect(await screen.findByRole('option', { name: 'Link de Pagamento' })).toBeVisible();
  });

  it('sem permissão de criar, editar, excluir e exportar, esconde os botões', async () => {
    const somenteVer = PERMISSOES.filter((p) => p === 'financeiro.formas-pagamento.ver');
    renderTela(api({ usuario: { ...USUARIO_TESTE, permissoes: somenteVer } }));

    await screen.findByText('teste');

    expect(
      screen.queryByRole('button', { name: 'Nova Forma de Pagamento' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Exportar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Editar / })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Excluir / })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Desativar teste' })).toBeDisabled();
  });
});
