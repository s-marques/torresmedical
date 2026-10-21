import { PERMISSOES, type ServicoProfissional } from '@torres/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { apiFalsa, chamadasPara, json, renderApp, USUARIO_TESTE } from '@/test/render-app';

vi.setConfig({ testTimeout: 20_000 });

const API = '/api/gestao-profissionais/servicos-profissionais';
const PROF_A = '00000000-0000-4000-8000-0000000000a1';
const PROF_B = '00000000-0000-4000-8000-0000000000a2';
const ID_1 = '00000000-0000-4000-8000-0000000000b1';
const ID_2 = '00000000-0000-4000-8000-0000000000b2';
const ID_3 = '00000000-0000-4000-8000-0000000000b3';

function servico(parcial: Partial<ServicoProfissional>): ServicoProfissional {
  return {
    id: ID_1,
    profissionalId: PROF_A,
    profissionalNome: 'Dra. Ana Teste',
    nome: 'Consulta',
    categoria: 'Consulta',
    valor: 450,
    duracaoMinutos: 50,
    descricao: 'Consulta completa',
    ativo: true,
    emUso: false,
    createdAt: '2026-10-21T12:00:00.000Z',
    updatedAt: '2026-10-21T12:00:00.000Z',
    ...parcial,
  };
}

const SERVICOS = [
  servico({}),
  servico({
    id: ID_2,
    nome: 'Retorno',
    categoria: null,
    descricao: null,
    valor: 0,
    duracaoMinutos: 30,
  }),
  servico({
    id: ID_3,
    profissionalId: PROF_B,
    profissionalNome: 'Dr. Bruno Teste',
    nome: 'Teste',
    categoria: null,
    descricao: null,
    ativo: false,
    emUso: true,
  }),
];

function pagina(data: ServicoProfissional[], totalPages = 1) {
  return json({
    data,
    meta: { page: 1, pageSize: 100, total: data.length, totalPages },
  });
}

const corpoDe = (init?: RequestInit) => JSON.parse(String(init?.body)) as Record<string, unknown>;
const ehLeitura = (init?: RequestInit) => !init?.method || init.method === 'GET';

function api(rotas: Parameters<typeof apiFalsa>[0] = {}) {
  return apiFalsa({
    ...rotas,
    rotas: {
      [API]: () => pagina(SERVICOS),
      '/api/lookups/profissionais': () =>
        json({
          data: [
            { id: PROF_A, label: 'Dra. Ana Teste', descricao: null },
            { id: PROF_B, label: 'Dr. Bruno Teste', descricao: null },
          ],
          meta: { page: 1, pageSize: 10, total: 2, totalPages: 1 },
        }),
      ...rotas.rotas,
    },
  });
}

function renderTela(fetchMock = api()) {
  return { user: userEvent.setup(), ...renderApp('/servicos-profissionais', fetchMock) };
}

const linha = (nome: string) =>
  screen.getByRole('heading', { name: nome }).closest('li') as HTMLElement;

describe('Serviços Profissionais (/servicos-profissionais)', () => {
  it('agrupa por profissional e mostra categoria, descrição, duração, valor e selo Inativo', async () => {
    renderTela();

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Serviços por Profissional' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Cadastre os serviços/procedimentos que cada profissional realiza'),
    ).toBeVisible();
    expect(await screen.findByText('3 serviço(s)')).toBeVisible();
    expect(screen.getByRole('heading', { level: 2, name: 'Dra. Ana Teste' })).toBeVisible();
    expect(screen.getByRole('heading', { level: 2, name: 'Dr. Bruno Teste' })).toBeVisible();

    const consulta = linha('Consulta');
    expect(within(consulta).getByText('Consulta completa')).toBeVisible();
    expect(within(consulta).getByText('50min')).toBeVisible();
    expect(within(consulta).getByText(/450,00/)).toBeVisible();
    expect(within(consulta).queryByText('Inativo')).not.toBeInTheDocument();
    expect(within(linha('Teste')).getByText('Inativo')).toBeVisible();
  });

  it('busca e filtro por profissional consultam a API', async () => {
    const fetchMock = api();
    const { user } = renderTela(fetchMock);
    await screen.findByText('Retorno');

    await user.type(screen.getByLabelText('Buscar'), 'ret');
    await waitFor(() => {
      const ultima = chamadasPara(fetchMock, API).at(-1)?.[0] ?? '';
      expect(new URL(ultima, 'http://x').searchParams.get('search')).toBe('ret');
    });

    await user.click(screen.getByRole('combobox', { name: 'Profissional' }));
    await user.click(await screen.findByRole('option', { name: /Dr. Bruno Teste/ }));
    await waitFor(() => {
      const ultima = chamadasPara(fetchMock, API).at(-1)?.[0] ?? '';
      expect(new URL(ultima, 'http://x').searchParams.get('profissionalId')).toBe(PROF_B);
    });
  });

  it('lista vazia mostra o estado vazio', async () => {
    renderTela(api({ rotas: { [API]: () => pagina([]) } }));

    expect(await screen.findByText('Nenhum serviço encontrado.')).toBeVisible();
  });

  it('Novo Serviço: abre com os padrões e valida os obrigatórios sem enviar', async () => {
    const fetchMock = api();
    const { user } = renderTela(fetchMock);
    await screen.findByText('Retorno');

    await user.click(screen.getByRole('button', { name: 'Novo Serviço' }));
    const modal = await screen.findByRole('dialog', { name: 'Novo Serviço' });
    expect(within(modal).getByLabelText('Duração (minutos)')).toHaveValue(30);
    expect(within(modal).getByPlaceholderText('Ex: Estética')).toBeVisible();
    expect(within(modal).getByPlaceholderText('Opcional')).toBeVisible();

    await user.click(within(modal).getByRole('button', { name: 'Criar' }));

    expect(await within(modal).findByText('Nome do serviço é obrigatório.')).toBeVisible();
    expect(within(modal).getByText('Profissional é obrigatório.')).toBeVisible();
    expect(chamadasPara(fetchMock, API).filter(([, i]) => i?.method === 'POST')).toHaveLength(0);
  });

  it('Novo Serviço: envia o corpo, fecha o modal e recarrega a lista', async () => {
    let corpo: Record<string, unknown> = {};
    const fetchMock = api({
      rotas: {
        [API]: (init) => {
          if (ehLeitura(init)) return pagina(SERVICOS);
          corpo = corpoDe(init);
          return json(servico({ nome: 'Novo' }), 201);
        },
      },
    });
    const { user } = renderTela(fetchMock);
    await screen.findByText('Retorno');

    await user.click(screen.getByRole('button', { name: 'Novo Serviço' }));
    const modal = await screen.findByRole('dialog', { name: 'Novo Serviço' });
    await user.click(within(modal).getByRole('combobox', { name: /Profissional/ }));
    await user.click(await screen.findByRole('option', { name: /Dra. Ana Teste/ }));
    await user.type(within(modal).getByLabelText(/Nome do Serviço/), 'Limpeza');
    await user.type(within(modal).getByLabelText('Categoria'), 'Estética');
    await user.click(within(modal).getByRole('button', { name: 'Criar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(corpo).toEqual({
      profissionalId: PROF_A,
      nome: 'Limpeza',
      categoria: 'Estética',
      valor: 0,
      duracaoMinutos: 30,
      descricao: null,
    });
    expect(chamadasPara(fetchMock, API).filter(([, i]) => ehLeitura(i)).length).toBeGreaterThan(1);
  });

  it('Editar Serviço: abre com os valores atuais e envia PATCH com Atualizar', async () => {
    let corpo: Record<string, unknown> = {};
    const { user } = renderTela(
      api({
        rotas: {
          [`${API}/${ID_1}`]: (init) => {
            corpo = corpoDe(init);
            return json(servico({ nome: 'Consulta 2' }));
          },
        },
      }),
    );
    await screen.findByText('Retorno');

    await user.click(screen.getByRole('button', { name: 'Editar Consulta' }));
    const modal = await screen.findByRole('dialog', { name: 'Editar Serviço' });
    expect(within(modal).getByLabelText(/Nome do Serviço/)).toHaveValue('Consulta');
    expect(within(modal).getByLabelText('Duração (minutos)')).toHaveValue(50);
    await user.type(within(modal).getByLabelText(/Nome do Serviço/), ' 2');
    await user.click(within(modal).getByRole('button', { name: 'Atualizar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(corpo).toMatchObject({ profissionalId: PROF_A, nome: 'Consulta 2', valor: 450 });
  });

  it('Desativar: abre modal de confirmação (não alert) e só desativa ao confirmar', async () => {
    const alerta = vi.spyOn(window, 'confirm');
    let corpo: Record<string, unknown> | null = null;
    const { user } = renderTela(
      api({
        rotas: {
          [`${API}/${ID_2}/status`]: (init) => {
            corpo = corpoDe(init);
            return json(servico({ id: ID_2, ativo: false }));
          },
        },
      }),
    );
    await screen.findByText('Retorno');

    await user.click(screen.getByRole('button', { name: 'Desativar Retorno' }));
    const dialogo = await screen.findByRole('alertdialog', { name: 'Desativar serviço?' });
    await user.click(within(dialogo).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(corpo).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Desativar Retorno' }));
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Desativar' }),
    );
    await waitFor(() => expect(corpo).toEqual({ ativo: false }));
    expect(alerta).not.toHaveBeenCalled();
  });

  it('serviço inativo mostra Ativar e reativa direto, sem confirmação', async () => {
    let corpo: Record<string, unknown> | null = null;
    const { user } = renderTela(
      api({
        rotas: {
          [`${API}/${ID_3}/status`]: (init) => {
            corpo = corpoDe(init);
            return json(servico({ id: ID_3 }));
          },
        },
      }),
    );
    await screen.findByText('Retorno');

    await user.click(screen.getByRole('button', { name: 'Ativar Teste' }));

    await waitFor(() => expect(corpo).toEqual({ ativo: true }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('Excluir: confirma em modal e chama DELETE; serviço em uso fica com a lixeira desabilitada', async () => {
    let excluido = false;
    const { user } = renderTela(
      api({
        rotas: {
          [`${API}/${ID_2}`]: () => {
            excluido = true;
            return json(servico({ id: ID_2 }));
          },
        },
      }),
    );
    await screen.findByText('Retorno');

    expect(screen.getByRole('button', { name: 'Excluir Teste' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Excluir Retorno' }));
    const dialogo = await screen.findByRole('alertdialog', { name: 'Excluir serviço?' });
    expect(within(dialogo).getByText(/excluído definitivamente/)).toBeVisible();
    await user.click(within(dialogo).getByRole('button', { name: 'Excluir' }));

    await waitFor(() => expect(excluido).toBe(true));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
  });

  it('sem permissão de criar, editar e excluir, esconde os botões', async () => {
    const somenteVer = PERMISSOES.filter(
      (p) => p === 'gestao-profissionais.servicos-profissionais.ver',
    );
    renderTela(api({ usuario: { ...USUARIO_TESTE, permissoes: somenteVer } }));

    await screen.findByText('Retorno');

    expect(screen.queryByRole('button', { name: 'Novo Serviço' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Editar Consulta' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Desativar Consulta' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Excluir Consulta' })).not.toBeInTheDocument();
  });

  it('com mais de uma página mostra a paginação', async () => {
    const fetchMock = api({ rotas: { [API]: () => pagina(SERVICOS, 2) } });
    const { user } = renderTela(fetchMock);
    await screen.findByText('Retorno');

    expect(screen.getByText('Página 1 de 2')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Próxima' }));
    await waitFor(() => {
      const ultima = chamadasPara(fetchMock, API).at(-1)?.[0] ?? '';
      expect(new URL(ultima, 'http://x').searchParams.get('page')).toBe('2');
    });
  });

  it('erro ao carregar mostra mensagem e permite tentar de novo', async () => {
    let falhar = true;
    const { user } = renderTela(
      api({
        rotas: {
          [API]: () =>
            falhar
              ? json({ statusCode: 500, code: 'ERRO_INTERNO', message: 'Erro interno' }, 500)
              : pagina(SERVICOS),
        },
      }),
    );

    expect(await screen.findByText(/Não foi possível carregar/)).toBeVisible();
    falhar = false;
    await user.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByText('Retorno')).toBeVisible();
  });
});
