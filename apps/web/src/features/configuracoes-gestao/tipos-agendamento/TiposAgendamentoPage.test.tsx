import { PERMISSOES, type TipoAgendamento } from '@torres/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { apiFalsa, chamadasPara, json, renderApp, USUARIO_TESTE } from '@/test/render-app';

const API = '/api/configuracoes-gestao/tipos-agendamento';
const ID_1 = '00000000-0000-4000-8000-0000000000b1';
const ID_2 = '00000000-0000-4000-8000-0000000000b2';

function tipo(parcial: Partial<TipoAgendamento>): TipoAgendamento {
  return {
    id: ID_1,
    nome: 'Avaliação',
    duracaoMinutos: 30,
    cor: '#3b82f6',
    permiteProcedimento: true,
    permitePacote: true,
    soroterapia: false,
    ativo: true,
    createdAt: '2026-10-14T12:00:00.000Z',
    updatedAt: '2026-10-14T12:00:00.000Z',
    ...parcial,
  };
}

const TIPOS = [
  tipo({}),
  tipo({
    id: ID_2,
    nome: 'Retorno',
    duracaoMinutos: 20,
    cor: '#aa5500',
    permiteProcedimento: false,
    permitePacote: false,
  }),
];

function pagina(data: TipoAgendamento[]) {
  return json({ data, meta: { page: 1, pageSize: 100, total: data.length, totalPages: 1 } });
}

function corpoDe(init?: RequestInit): Record<string, unknown> {
  return JSON.parse(String(init?.body)) as Record<string, unknown>;
}

function api(rotas: Parameters<typeof apiFalsa>[0] = {}) {
  return apiFalsa({ ...rotas, rotas: { [API]: () => pagina(TIPOS), ...rotas.rotas } });
}

function renderTela(fetchMock = api()) {
  return { user: userEvent.setup(), ...renderApp('/config/tipos-agendamento', fetchMock) };
}

describe('Tipos de Agendamento (/config/tipos-agendamento)', () => {
  it('mostra título, descrição, botão e um card por tipo com duração e chips', async () => {
    const fetchMock = api();
    renderTela(fetchMock);

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Tipos de Agendamento' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Cadastre e gerencie os tipos de consulta/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Novo Tipo' })).toBeVisible();

    const avaliacao = (await screen.findByRole('heading', { name: 'Avaliação' })).closest('li');
    expect(within(avaliacao as HTMLElement).getByText('30 min')).toBeVisible();
    expect(within(avaliacao as HTMLElement).getByText('Procedimento')).toBeVisible();
    expect(within(avaliacao as HTMLElement).getByText('Pacote')).toBeVisible();
    expect(within(avaliacao as HTMLElement).queryByText('Soroterapia')).not.toBeInTheDocument();
    expect(within(avaliacao as HTMLElement).getByTestId('cor-tipo')).toHaveStyle({
      backgroundColor: '#3b82f6',
    });

    const retorno = screen.getByRole('heading', { name: 'Retorno' }).closest('li');
    expect(within(retorno as HTMLElement).getByText('20 min')).toBeVisible();
    expect(within(retorno as HTMLElement).queryByText('Procedimento')).not.toBeInTheDocument();

    const [url] = chamadasPara(fetchMock, API)[0] ?? [''];
    expect(Object.fromEntries(new URL(url, 'http://x').searchParams)).toMatchObject({
      page: '1',
      pageSize: '100',
      sort: 'nome:asc',
    });
  });

  it('lista vazia mostra o estado vazio', async () => {
    renderTela(api({ rotas: { [API]: () => pagina([]) } }));

    expect(await screen.findByText('Nenhum tipo de agendamento cadastrado.')).toBeVisible();
  });

  it('Novo Tipo: abre com os padrões (30 min, #3b82f6) e os 3 checkboxes desmarcados', async () => {
    const { user } = renderTela();
    await screen.findByText('Avaliação');

    await user.click(screen.getByRole('button', { name: 'Novo Tipo' }));
    const modal = await screen.findByRole('dialog', { name: 'Novo Tipo de Agendamento' });

    expect(within(modal).getByPlaceholderText('Ex: Consulta, Retorno, Exame...')).toBeVisible();
    expect(within(modal).getByLabelText('Duração padrão (min)')).toHaveValue(30);
    expect(within(modal).getByLabelText('Cor')).toHaveValue('#3b82f6');
    for (const rotulo of [
      'Permite vincular procedimento/produto',
      'Permite vincular pacote de sessões',
      'É soroterapia (agenda separada)',
    ]) {
      expect(within(modal).getByRole('checkbox', { name: rotulo })).not.toBeChecked();
    }
    expect(within(modal).getByRole('button', { name: 'Criar' })).toBeVisible();
    expect(within(modal).getByRole('button', { name: 'Cancelar' })).toBeVisible();
  });

  it('Novo Tipo: Nome vazio mostra "Nome é obrigatório." e não envia', async () => {
    const fetchMock = api();
    const { user } = renderTela(fetchMock);
    await screen.findByText('Avaliação');

    await user.click(screen.getByRole('button', { name: 'Novo Tipo' }));
    const modal = await screen.findByRole('dialog', { name: 'Novo Tipo de Agendamento' });
    await user.click(within(modal).getByRole('button', { name: 'Criar' }));

    expect(await within(modal).findByText('Nome é obrigatório.')).toBeVisible();
    expect(chamadasPara(fetchMock, API).filter(([, init]) => init?.method === 'POST')).toHaveLength(
      0,
    );
  });

  it('Novo Tipo: salva com os campos, fecha o modal e recarrega a lista', async () => {
    let corpo: Record<string, unknown> = {};
    const fetchMock = api({
      rotas: {
        [API]: (init) => {
          if (init?.method !== 'POST') return pagina(TIPOS);
          corpo = corpoDe(init);
          return json(tipo({ id: '00000000-0000-4000-8000-0000000000b3', nome: 'Exame' }), 201);
        },
      },
    });
    const { user } = renderTela(fetchMock);
    await screen.findByText('Avaliação');

    await user.click(screen.getByRole('button', { name: 'Novo Tipo' }));
    const modal = await screen.findByRole('dialog', { name: 'Novo Tipo de Agendamento' });
    await user.type(within(modal).getByLabelText(/Nome/), 'Exame');
    await user.clear(within(modal).getByLabelText('Duração padrão (min)'));
    await user.type(within(modal).getByLabelText('Duração padrão (min)'), '45');
    await user.click(within(modal).getByRole('checkbox', { name: /soroterapia/ }));
    await user.click(within(modal).getByRole('button', { name: 'Criar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(corpo).toEqual({
      nome: 'Exame',
      duracaoMinutos: 45,
      cor: '#3b82f6',
      permiteProcedimento: false,
      permitePacote: false,
      soroterapia: true,
    });
    expect(
      chamadasPara(fetchMock, API).filter(([, i]) => !i?.method || i.method === 'GET'),
    ).toHaveLength(2);
  });

  it('Editar Tipo: abre com os valores atuais e envia PATCH com Salvar', async () => {
    let corpo: Record<string, unknown> = {};
    const { user } = renderTela(
      api({
        rotas: {
          [`${API}/${ID_2}`]: (init) => {
            corpo = corpoDe(init);
            return json(tipo({ id: ID_2, nome: 'Retorno 2' }));
          },
        },
      }),
    );
    await screen.findByText('Retorno');

    await user.click(screen.getByRole('button', { name: 'Editar Retorno' }));
    const modal = await screen.findByRole('dialog', { name: 'Editar Tipo' });
    expect(within(modal).getByLabelText(/Nome/)).toHaveValue('Retorno');
    expect(within(modal).getByLabelText('Duração padrão (min)')).toHaveValue(20);
    expect(within(modal).getByLabelText('Cor')).toHaveValue('#aa5500');
    await user.type(within(modal).getByLabelText(/Nome/), ' 2');
    await user.click(within(modal).getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(corpo).toMatchObject({ nome: 'Retorno 2', duracaoMinutos: 20, cor: '#aa5500' });
  });

  it('Esc fecha o modal sem salvar', async () => {
    const { user } = renderTela();
    await screen.findByText('Avaliação');

    await user.click(screen.getByRole('button', { name: 'Novo Tipo' }));
    await screen.findByRole('dialog', { name: 'Novo Tipo de Agendamento' });
    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('Excluir: pede confirmação com o texto do sistema atual e só exclui ao confirmar', async () => {
    let excluido = false;
    const fetchMock = api({
      rotas: {
        [`${API}/${ID_2}`]: () => {
          excluido = true;
          return json(tipo({ id: ID_2 }));
        },
      },
    });
    const { user } = renderTela(fetchMock);
    await screen.findByText('Retorno');

    await user.click(screen.getByRole('button', { name: 'Excluir Retorno' }));
    const dialogo = await screen.findByRole('alertdialog', { name: 'Excluir tipo' });
    expect(
      within(dialogo).getByText(
        'Deseja excluir o tipo "Retorno"? Agendamentos existentes com este tipo não serão afetados.',
      ),
    ).toBeVisible();

    await user.click(within(dialogo).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(excluido).toBe(false);

    await user.click(screen.getByRole('button', { name: 'Excluir Retorno' }));
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Confirmar' }),
    );
    await waitFor(() => expect(excluido).toBe(true));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
  });

  it('sem permissão de criar, editar e excluir, esconde os botões', async () => {
    const somenteVer = PERMISSOES.filter((p) => p === 'configuracoes-gestao.tipos-agendamento.ver');
    renderTela(api({ usuario: { ...USUARIO_TESTE, permissoes: somenteVer } }));

    await screen.findByText('Avaliação');

    expect(screen.queryByRole('button', { name: 'Novo Tipo' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Editar Avaliação' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Excluir Avaliação' })).not.toBeInTheDocument();
  });

  it('erro ao carregar mostra mensagem e permite tentar de novo', async () => {
    let falhar = true;
    const { user } = renderTela(
      api({
        rotas: {
          [API]: () =>
            falhar
              ? json({ statusCode: 500, code: 'ERRO_INTERNO', message: 'Erro interno' }, 500)
              : pagina(TIPOS),
        },
      }),
    );

    expect(await screen.findByText(/Não foi possível carregar/)).toBeVisible();
    falhar = false;
    await user.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByText('Avaliação')).toBeVisible();
  });
});
