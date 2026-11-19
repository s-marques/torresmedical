import type { BypassAgente } from '@torres/shared';
import { PERMISSOES } from '@torres/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { apiFalsa, chamadasPara, json, renderApp, USUARIO_TESTE } from '@/test/render-app';

vi.setConfig({ testTimeout: 20_000 });

const API = '/api/configuracoes-gestao/bypass-agente';
const ID_1 = '00000000-0000-4000-8000-0000000000b1';
const ID_2 = '00000000-0000-4000-8000-0000000000b2';

function registro(parcial: Partial<BypassAgente>): BypassAgente {
  return {
    id: ID_1,
    telefone: '5565999990001',
    nome: 'Ana Teste',
    cargo: 'Gerente',
    ativo: true,
    createdAt: '2026-11-19T12:00:00.000Z',
    updatedAt: '2026-11-19T12:00:00.000Z',
    ...parcial,
  };
}

const REGISTROS = [
  registro({}),
  registro({ id: ID_2, telefone: '5565999990002', nome: null, cargo: null, ativo: false }),
];

function pagina(data: BypassAgente[]) {
  return json({ data, meta: { page: 1, pageSize: 10, total: data.length, totalPages: 1 } });
}

type Corpo = Record<string, unknown>;

function corpoDe(init?: RequestInit): Corpo {
  return JSON.parse(String(init?.body)) as Corpo;
}

function api(rotas: Parameters<typeof apiFalsa>[0] = {}) {
  return apiFalsa({ ...rotas, rotas: { [API]: () => pagina(REGISTROS), ...rotas.rotas } });
}

function renderTela(fetchMock = api()) {
  return { user: userEvent.setup(), ...renderApp('/bypass-agente', fetchMock) };
}

describe('Bypass Agente (/bypass-agente)', () => {
  it('mostra título, descrição e a grid com Telefone, Nome, Cargo, Status e Ações', async () => {
    const fetchMock = api();
    renderTela(fetchMock);

    expect(await screen.findByRole('heading', { name: 'Bypass Agente' })).toBeInTheDocument();
    expect(screen.getByText(/não serão respondidos pelo agente IA/)).toBeVisible();
    const cabecalhos = within(await screen.findByRole('table')).getAllByRole('columnheader');
    expect(cabecalhos.map((c) => c.textContent)).toEqual([
      'Telefone',
      'Nome',
      'Cargo',
      'Status',
      'Ações',
    ]);
    expect(await screen.findByText('(65) 99999-0001')).toBeVisible();
    expect(screen.getByText('Ana Teste')).toBeVisible();
    expect(screen.getByRole('switch', { name: 'Desativar bypass de Ana Teste' })).toBeChecked();
    expect(
      screen.getByRole('switch', { name: 'Ativar bypass de (65) 99999-0002' }),
    ).not.toBeChecked();
    expect(screen.getByRole('button', { name: 'Adicionar' })).toBeVisible();
    expect(screen.getByPlaceholderText('Buscar por nome, telefone ou cargo...')).toBeVisible();

    const [url] = chamadasPara(fetchMock, API)[0] ?? [''];
    expect(Object.fromEntries(new URL(url, 'http://x').searchParams)).toMatchObject({
      page: '1',
      pageSize: '10',
    });
  });

  it('ordenar por Telefone e buscar chamam a API com sort e search', async () => {
    const fetchMock = api();
    const { user } = renderTela(fetchMock);
    await screen.findByText('Ana Teste');

    await user.click(screen.getByRole('button', { name: 'Telefone' }));
    await waitFor(() => {
      const [url] = chamadasPara(fetchMock, API).at(-1) ?? [''];
      expect(new URL(url, 'http://x').searchParams.get('sort')).toBe('telefone:asc');
    });

    await user.type(screen.getByPlaceholderText('Buscar por nome, telefone ou cargo...'), 'ana');
    await waitFor(() => {
      const [url] = chamadasPara(fetchMock, API).at(-1) ?? [''];
      expect(new URL(url, 'http://x').searchParams.get('search')).toBe('ana');
    });
  });

  it('Adicionar: Telefone vazio mostra "Telefone é obrigatório." e não envia', async () => {
    const fetchMock = api();
    const { user } = renderTela(fetchMock);
    await screen.findByText('Ana Teste');

    await user.click(screen.getByRole('button', { name: 'Adicionar' }));
    const modal = await screen.findByRole('dialog', { name: 'Adicionar Telefone ao Bypass' });
    await user.click(within(modal).getByRole('button', { name: 'Adicionar' }));

    expect(await within(modal).findByText('Telefone é obrigatório.')).toBeVisible();
    expect(chamadasPara(fetchMock, API).filter(([, i]) => i?.method === 'POST')).toHaveLength(0);
  });

  it('Adicionar: salva, fecha o modal e recarrega a lista', async () => {
    let corpo: Corpo = {};
    const fetchMock = api({
      rotas: {
        [API]: (init) => {
          if (init?.method !== 'POST') return pagina(REGISTROS);
          corpo = corpoDe(init);
          return json(registro({ id: '00000000-0000-4000-8000-0000000000b3' }), 201);
        },
      },
    });
    const { user } = renderTela(fetchMock);
    await screen.findByText('Ana Teste');

    await user.click(screen.getByRole('button', { name: 'Adicionar' }));
    const modal = await screen.findByRole('dialog', { name: 'Adicionar Telefone ao Bypass' });
    await user.type(within(modal).getByLabelText(/Telefone/), '65999990003');
    await user.type(within(modal).getByLabelText(/Nome/), 'Bia Teste');
    await user.click(within(modal).getByRole('button', { name: 'Adicionar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(corpo).toMatchObject({ telefone: '5565999990003', nome: 'Bia Teste' });
    expect(
      chamadasPara(fetchMock, API).filter(([, i]) => !i?.method || i.method === 'GET'),
    ).toHaveLength(2);
  });

  it('Adicionar: telefone repetido mostra o erro do servidor e mantém o modal aberto', async () => {
    const { user } = renderTela(
      api({
        rotas: {
          [API]: (init) =>
            init?.method === 'POST'
              ? json(
                  {
                    statusCode: 409,
                    code: 'DUPLICATE',
                    message: 'Este telefone já está na lista de bypass',
                  },
                  409,
                )
              : pagina(REGISTROS),
        },
      }),
    );
    await screen.findByText('Ana Teste');

    await user.click(screen.getByRole('button', { name: 'Adicionar' }));
    const modal = await screen.findByRole('dialog', { name: 'Adicionar Telefone ao Bypass' });
    await user.type(within(modal).getByLabelText(/Telefone/), '65999990001');
    await user.click(within(modal).getByRole('button', { name: 'Adicionar' }));

    expect(
      await within(modal).findByText('Este telefone já está na lista de bypass'),
    ).toBeVisible();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('Editar: abre com os dados atuais e envia PATCH', async () => {
    let corpo: Corpo = {};
    const { user } = renderTela(
      api({
        rotas: {
          [`${API}/${ID_1}`]: (init) => {
            corpo = corpoDe(init);
            return json(registro({ cargo: 'Diretora' }));
          },
        },
      }),
    );
    await screen.findByText('Ana Teste');

    await user.click(screen.getByRole('button', { name: 'Editar Ana Teste' }));
    const modal = await screen.findByRole('dialog', { name: 'Editar Telefone do Bypass' });
    expect(within(modal).getByLabelText(/Nome/)).toHaveValue('Ana Teste');
    const cargo = within(modal).getByLabelText(/Cargo/);
    await user.clear(cargo);
    await user.type(cargo, 'Diretora');
    await user.click(within(modal).getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(corpo).toMatchObject({ nome: 'Ana Teste', cargo: 'Diretora' });
  });

  it('interruptor: liga e desliga direto, com a mensagem de sucesso', async () => {
    const corpos: Corpo[] = [];
    const { user } = renderTela(
      api({
        rotas: {
          [`${API}/${ID_2}/status`]: (init) => {
            corpos.push(corpoDe(init));
            return json(registro({ id: ID_2, ativo: true }));
          },
          [`${API}/${ID_1}/status`]: (init) => {
            corpos.push(corpoDe(init));
            return json(registro({ ativo: false }));
          },
        },
      }),
    );
    await screen.findByText('Ana Teste');

    await user.click(screen.getByRole('switch', { name: 'Ativar bypass de (65) 99999-0002' }));
    expect(await screen.findByText('Bypass ativado.')).toBeVisible();
    await user.click(screen.getByRole('switch', { name: 'Desativar bypass de Ana Teste' }));
    expect(await screen.findByText('Bypass desativado.')).toBeVisible();
    expect(corpos).toEqual([{ ativo: true }, { ativo: false }]);
  });

  it('Excluir: confirma antes e envia DELETE; Cancelar não exclui', async () => {
    let excluidas = 0;
    const { user } = renderTela(
      api({
        rotas: {
          [`${API}/${ID_1}`]: () => {
            excluidas += 1;
            return json(registro({}));
          },
        },
      }),
    );
    await screen.findByText('Ana Teste');

    await user.click(screen.getByRole('button', { name: 'Excluir Ana Teste' }));
    const dialogo = await screen.findByRole('alertdialog', { name: 'Remover do bypass' });
    await user.click(within(dialogo).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(excluidas).toBe(0);

    await user.click(screen.getByRole('button', { name: 'Excluir Ana Teste' }));
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Confirmar' }),
    );
    await waitFor(() => expect(excluidas).toBe(1));
  });

  it('sem permissão de criar, editar e excluir, esconde os botões e trava o interruptor', async () => {
    const somenteVer = PERMISSOES.filter((p) => p === 'configuracoes-gestao.bypass-agente.ver');
    renderTela(api({ usuario: { ...USUARIO_TESTE, permissoes: somenteVer } }));

    await screen.findByText('Ana Teste');

    expect(screen.queryByRole('button', { name: 'Adicionar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Editar Ana Teste' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Excluir Ana Teste' })).not.toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Desativar bypass de Ana Teste' })).toBeDisabled();
  });
});
