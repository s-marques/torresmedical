import type { OrigemCliente } from '@torres/shared';
import { PERMISSOES } from '@torres/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { apiFalsa, chamadasPara, json, renderApp, USUARIO_TESTE } from '@/test/render-app';

const API = '/api/comercial-atendimento/origens-cliente';
const ID_1 = '00000000-0000-4000-8000-0000000000a1';
const ID_2 = '00000000-0000-4000-8000-0000000000a2';

function origem(parcial: Partial<OrigemCliente>): OrigemCliente {
  return {
    id: ID_1,
    nome: 'Indicação',
    codigo: 'indicacao',
    ordem: 1,
    ativa: true,
    createdAt: '2026-10-14T12:00:00.000Z',
    updatedAt: '2026-10-14T12:00:00.000Z',
    ...parcial,
  };
}

const ORIGENS = [
  origem({}),
  origem({ id: ID_2, nome: 'Google', codigo: 'google', ordem: 2, ativa: false }),
];

function pagina(data: OrigemCliente[]) {
  return json({ data, meta: { page: 1, pageSize: 50, total: data.length, totalPages: 1 } });
}

type Corpo = Record<string, unknown>;

function corpoDe(init?: RequestInit): Corpo {
  return JSON.parse(String(init?.body)) as Corpo;
}

function api(rotas: Parameters<typeof apiFalsa>[0] = {}) {
  return apiFalsa({
    ...rotas,
    rotas: { [API]: () => pagina(ORIGENS), ...rotas.rotas },
  });
}

function renderTela(fetchMock = api()) {
  return { user: userEvent.setup(), ...renderApp('/origens-cliente', fetchMock) };
}

describe('Origens de Cliente (/origens-cliente)', () => {
  it('mostra o título, a descrição e a grid com Ordem, Nome, Código, Ativa e Ações', async () => {
    const fetchMock = api();
    renderTela(fetchMock);

    expect(await screen.findByRole('heading', { name: 'Origens de Cliente' })).toBeInTheDocument();
    expect(screen.getByText(/De onde os pacientes chegam/)).toBeVisible();
    const cabecalhos = within(await screen.findByRole('table')).getAllByRole('columnheader');
    expect(cabecalhos.map((c) => c.textContent)).toEqual([
      'Ordem',
      'Nome',
      'Código',
      'Ativa',
      'Ações',
    ]);
    expect(await screen.findByText('Indicação')).toBeVisible();
    expect(screen.getByText('google')).toBeVisible();
    expect(screen.getByRole('switch', { name: 'Desativar Indicação' })).toBeChecked();
    expect(screen.getByRole('switch', { name: 'Ativar Google' })).not.toBeChecked();
    expect(screen.getByRole('button', { name: 'Nova Origem' })).toBeVisible();

    const [url] = chamadasPara(fetchMock, API)[0] ?? [''];
    expect(Object.fromEntries(new URL(url, 'http://x').searchParams)).toMatchObject({
      page: '1',
      pageSize: '50',
    });
  });

  it('ordenar por coluna chama a API com o sort', async () => {
    const fetchMock = api();
    const { user } = renderTela(fetchMock);
    await screen.findByText('Indicação');

    await user.click(screen.getByRole('button', { name: 'Nome' }));

    await waitFor(() => {
      const [url] = chamadasPara(fetchMock, API).at(-1) ?? [''];
      expect(Object.fromEntries(new URL(url, 'http://x').searchParams)).toMatchObject({
        sort: 'nome:asc',
      });
    });
  });

  it('Nova Origem: Nome vazio mostra "Nome é obrigatório." e não envia', async () => {
    const fetchMock = api();
    const { user } = renderTela(fetchMock);
    await screen.findByText('Indicação');

    await user.click(screen.getByRole('button', { name: 'Nova Origem' }));
    const modal = await screen.findByRole('dialog', { name: 'Nova Origem' });
    expect(within(modal).getByPlaceholderText('Ex: Facebook Ads')).toBeVisible();
    await user.click(within(modal).getByRole('button', { name: 'Salvar' }));

    expect(await within(modal).findByText('Nome é obrigatório.')).toBeVisible();
    expect(chamadasPara(fetchMock, API).filter(([, init]) => init?.method === 'POST')).toHaveLength(
      0,
    );
  });

  it('Nova Origem: salva, fecha o modal e recarrega a lista', async () => {
    let corpo: Corpo = {};
    const fetchMock = api({
      rotas: {
        [API]: (init) => {
          if (init?.method !== 'POST') return pagina(ORIGENS);
          corpo = corpoDe(init);
          return json(origem({ id: '00000000-0000-4000-8000-0000000000a3', nome: 'Site' }), 201);
        },
      },
    });
    const { user } = renderTela(fetchMock);
    await screen.findByText('Indicação');

    await user.click(screen.getByRole('button', { name: 'Nova Origem' }));
    const modal = await screen.findByRole('dialog', { name: 'Nova Origem' });
    await user.type(within(modal).getByLabelText(/Nome/), 'Site');
    await user.click(within(modal).getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(corpo).toEqual({ nome: 'Site' });
    expect(
      chamadasPara(fetchMock, API).filter(([, i]) => !i?.method || i.method === 'GET'),
    ).toHaveLength(2);
  });

  it('Nova Origem: nome repetido mostra o erro do servidor e mantém o modal aberto', async () => {
    const { user } = renderTela(
      api({
        rotas: {
          [API]: (init) =>
            init?.method === 'POST'
              ? json(
                  {
                    statusCode: 409,
                    code: 'ORIGEM_CLIENTE_DUPLICADA',
                    message: "Já existe uma origem chamada 'teste'.",
                  },
                  409,
                )
              : pagina(ORIGENS),
        },
      }),
    );
    await screen.findByText('Indicação');

    await user.click(screen.getByRole('button', { name: 'Nova Origem' }));
    const modal = await screen.findByRole('dialog', { name: 'Nova Origem' });
    await user.type(within(modal).getByLabelText(/Nome/), 'teste');
    await user.click(within(modal).getByRole('button', { name: 'Salvar' }));

    expect(await within(modal).findByText("Já existe uma origem chamada 'teste'.")).toBeVisible();
    expect(screen.getByRole('dialog', { name: 'Nova Origem' })).toBeInTheDocument();
  });

  it('Esc fecha o modal sem salvar', async () => {
    const { user } = renderTela();
    await screen.findByText('Indicação');

    await user.click(screen.getByRole('button', { name: 'Nova Origem' }));
    await screen.findByRole('dialog', { name: 'Nova Origem' });
    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('Renomear Origem: abre com o nome atual e envia PATCH', async () => {
    let corpo: Corpo = {};
    const { user } = renderTela(
      api({
        rotas: {
          [`${API}/${ID_1}`]: (init) => {
            corpo = corpoDe(init);
            return json(origem({ nome: 'Indicação de paciente' }));
          },
        },
      }),
    );
    await screen.findByText('Indicação');

    await user.click(screen.getByRole('button', { name: 'Renomear Indicação' }));
    const modal = await screen.findByRole('dialog', { name: 'Renomear Origem' });
    const campo = within(modal).getByLabelText(/Nome/);
    expect(campo).toHaveValue('Indicação');
    await user.clear(campo);
    await user.type(campo, 'Indicação de paciente');
    await user.click(within(modal).getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(corpo).toEqual({ nome: 'Indicação de paciente' });
  });

  it('interruptor: ativa e desativa direto, com a mensagem de sucesso', async () => {
    const corpos: Corpo[] = [];
    const { user } = renderTela(
      api({
        rotas: {
          [`${API}/${ID_2}/ativa`]: (init) => {
            corpos.push(corpoDe(init));
            return json(origem({ id: ID_2, nome: 'Google', ativa: true }));
          },
          [`${API}/${ID_1}/ativa`]: (init) => {
            corpos.push(corpoDe(init));
            return json(origem({ ativa: false }));
          },
        },
      }),
    );
    await screen.findByText('Indicação');

    await user.click(screen.getByRole('switch', { name: 'Ativar Google' }));
    expect(await screen.findByText('Origem ativada.')).toBeVisible();
    await user.click(screen.getByRole('switch', { name: 'Desativar Indicação' }));
    expect(await screen.findByText('Origem desativada.')).toBeVisible();
    expect(corpos).toEqual([{ ativa: true }, { ativa: false }]);
  });

  it('setas: movem para cima e para baixo', async () => {
    const corpos: Corpo[] = [];
    const { user } = renderTela(
      api({
        rotas: {
          [`${API}/${ID_2}/mover`]: (init) => {
            corpos.push(corpoDe(init));
            return json(origem({ id: ID_2 }));
          },
          [`${API}/${ID_1}/mover`]: (init) => {
            corpos.push(corpoDe(init));
            return json(origem({}));
          },
        },
      }),
    );
    await screen.findByText('Indicação');

    await user.click(screen.getByRole('button', { name: 'Mover Google para cima' }));
    await waitFor(() => expect(corpos).toHaveLength(1));
    await user.click(screen.getByRole('button', { name: 'Mover Indicação para baixo' }));
    await waitFor(() => expect(corpos).toHaveLength(2));
    expect(corpos).toEqual([{ direcao: 'cima' }, { direcao: 'baixo' }]);
  });

  it('Excluir: confirma antes e envia DELETE; Cancelar não exclui', async () => {
    let excluidas = 0;
    const { user } = renderTela(
      api({
        rotas: {
          [`${API}/${ID_1}`]: () => {
            excluidas += 1;
            return json(origem({}));
          },
        },
      }),
    );
    await screen.findByText('Indicação');

    await user.click(screen.getByRole('button', { name: 'Excluir Indicação' }));
    const dialogo = await screen.findByRole('alertdialog', { name: 'Excluir origem' });
    expect(dialogo).toHaveTextContent(
      'Excluir a origem "Indicação"? Só é possível se nenhum cliente estiver usando.',
    );
    await user.click(within(dialogo).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(excluidas).toBe(0);

    await user.click(screen.getByRole('button', { name: 'Excluir Indicação' }));
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Confirmar' }),
    );
    await waitFor(() => expect(excluidas).toBe(1));
  });

  it('Excluir origem em uso: mostra o erro e mantém a confirmação aberta', async () => {
    const { user } = renderTela(
      api({
        rotas: {
          [`${API}/${ID_1}`]: () =>
            json(
              {
                statusCode: 409,
                code: 'ORIGEM_CLIENTE_EM_USO',
                message: 'Não é possível excluir: há clientes usando esta origem.',
              },
              409,
            ),
        },
      }),
    );
    await screen.findByText('Indicação');

    await user.click(screen.getByRole('button', { name: 'Excluir Indicação' }));
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Confirmar' }),
    );

    expect(
      await screen.findByText('Não é possível excluir: há clientes usando esta origem.'),
    ).toBeVisible();
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });

  it('sem permissão de criar, editar e excluir, esconde os botões e trava os controles', async () => {
    const somenteVer = PERMISSOES.filter((p) => p === 'comercial-atendimento.origens-cliente.ver');
    renderTela(api({ usuario: { ...USUARIO_TESTE, permissoes: somenteVer } }));

    await screen.findByText('Indicação');

    expect(screen.queryByRole('button', { name: 'Nova Origem' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Renomear Indicação' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Excluir Indicação' })).not.toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Desativar Indicação' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Mover Indicação para cima' })).toBeDisabled();
  });
});
