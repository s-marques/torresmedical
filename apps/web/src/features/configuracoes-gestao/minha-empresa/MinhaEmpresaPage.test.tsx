import type { DiaHorario, Empresa, Unidade, UsuarioResumo } from '@torres/shared';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { apiFalsa, chamadasPara, json, renderApp } from '@/test/render-app';

vi.setConfig({ testTimeout: 20_000 });

const API_BASE = '/api/configuracoes-gestao/minha-empresa';
const API_UNIDADES = '/api/configuracoes-gestao/unidades';

function empresa(parcial: Partial<Empresa> = {}): Empresa {
  return {
    id: '00000000-0000-4000-8000-0000000000e1',
    nome: 'TORRES MEDICAL CENTER CORP.',
    documento: '11222333000181',
    email: 'contato@torresmedical.com',
    telefone: '65999998888',
    logoArquivoId: null,
    createdAt: '2026-10-14T12:00:00.000Z',
    updatedAt: '2026-10-14T12:00:00.000Z',
    ...parcial,
  };
}

function usuario(parcial: Partial<UsuarioResumo> = {}): UsuarioResumo {
  return {
    id: '00000000-0000-4000-8000-0000000000a1',
    nome: 'Gleisielle Carvalho',
    email: 'gleisielle@example.com',
    perfilNome: 'admin',
    ativo: true,
    ultimoLoginEm: '2026-10-15T08:27:00.000Z',
    ...parcial,
  };
}

function diasFechados(): DiaHorario[] {
  return Array.from({ length: 7 }, (_, dia) => ({
    diaSemana: dia,
    fechado: true,
    abre: null,
    fecha: null,
    intervalos: [],
  }));
}

function unidade(parcial: Partial<Unidade> = {}): Unidade {
  return {
    id: '00000000-0000-4000-8000-0000000000b1',
    empresaId: '00000000-0000-4000-8000-0000000000e1',
    nome: 'Matriz',
    endereco: null,
    cidade: null,
    uf: null,
    telefone: null,
    cnpj: null,
    cnes: null,
    ativo: true,
    createdAt: '2026-10-14T12:00:00.000Z',
    updatedAt: '2026-10-14T12:00:00.000Z',
    ...parcial,
  };
}

function paginaUnidades(data: Unidade[] = []) {
  return json({ data, meta: { page: 1, pageSize: 10, total: data.length, totalPages: 1 } });
}

function renderTela(
  fetchMock = apiFalsa({
    rotas: {
      [API_BASE]: () => json(empresa()),
      [`${API_BASE}/usuarios`]: () => json({ data: [usuario()] }),
      [`${API_BASE}/horarios`]: () => json({ data: diasFechados() }),
      [API_UNIDADES]: () => paginaUnidades([unidade()]),
    },
  }),
) {
  return { user: userEvent.setup(), ...renderApp('/settings/empresa', fetchMock) };
}

describe('Minha Empresa (/settings/empresa)', () => {
  it('mostra título e as seis abas', async () => {
    const { user } = renderTela();

    expect(await screen.findByRole('heading', { name: 'Configurações da Empresa' })).toBeVisible();
    for (const aba of [
      'Dados',
      'Plano e Faturas',
      'Integrações',
      'Usuários',
      'Unidades',
      'Horários',
    ]) {
      expect(screen.getByRole('tab', { name: aba })).toBeVisible();
    }

    await user.click(screen.getByRole('tab', { name: 'Plano e Faturas' }));
    expect(await screen.findByRole('heading', { name: 'Meu Plano' })).toBeVisible();

    await user.click(screen.getByRole('tab', { name: 'Integrações' }));
    expect(await screen.findByRole('heading', { name: 'Google Calendar' })).toBeVisible();
  });

  it('aba Dados: mostra os campos preenchidos e salva com PUT', async () => {
    const fetchMock = apiFalsa({
      rotas: {
        [API_BASE]: () => json(empresa()),
        [`${API_BASE}/usuarios`]: () => json({ data: [] }),
        [`${API_BASE}/horarios`]: () => json({ data: diasFechados() }),
        [API_UNIDADES]: () => paginaUnidades(),
      },
    });
    const { user } = renderTela(fetchMock);

    expect(await screen.findByLabelText('Nome da Empresa', {}, { timeout: 10_000 })).toHaveValue(
      'TORRES MEDICAL CENTER CORP.',
    );
    expect(screen.getByLabelText('E-mail')).toHaveValue('contato@torresmedical.com');

    await user.click(screen.getByRole('button', { name: 'Salvar Alterações' }));

    await waitFor(() => expect(chamadasPara(fetchMock, API_BASE).length).toBeGreaterThan(1));
    const [, init] = chamadasPara(fetchMock, API_BASE).at(-1) ?? [];
    expect(init?.method).toBe('PUT');
    expect(await screen.findByText('Alterações salvas.')).toBeVisible();
  });

  it('aba Dados: mostra o logo quando já existe um arquivo e os campos opcionais vazios', async () => {
    const fetchMock = apiFalsa({
      rotas: {
        [API_BASE]: () =>
          json(
            empresa({
              logoArquivoId: '00000000-0000-4000-8000-0000000000f1',
              email: null,
              telefone: null,
            }),
          ),
        [`${API_BASE}/usuarios`]: () => json({ data: [] }),
        [`${API_BASE}/horarios`]: () => json({ data: diasFechados() }),
        [API_UNIDADES]: () => paginaUnidades(),
        '/api/arquivos/00000000-0000-4000-8000-0000000000f1/link': () =>
          json({ url: 'https://exemplo.test/logo.png', expiraEm: '2026-10-15T12:15:00.000Z' }),
      },
    });
    renderTela(fetchMock);

    expect(await screen.findByLabelText('Nome da Empresa', {}, { timeout: 10_000 })).toBeVisible();
    expect(screen.getByLabelText('E-mail')).toHaveValue('');
    expect(await screen.findByAltText('Logo da empresa')).toHaveAttribute(
      'src',
      'https://exemplo.test/logo.png',
    );
  });

  it('aba Usuários: lista somente leitura', async () => {
    const { user } = renderTela();

    await screen.findByRole('heading', { name: 'Configurações da Empresa' }, { timeout: 10_000 });
    await user.click(screen.getByRole('tab', { name: 'Usuários' }));

    expect(await screen.findByText('Gleisielle Carvalho', {}, { timeout: 10_000 })).toBeVisible();
    expect(screen.getByText('gleisielle@example.com')).toBeVisible();
  });

  it('aba Usuários: sem perfil/login, mostra "-"', async () => {
    const fetchMock = apiFalsa({
      rotas: {
        [API_BASE]: () => json(empresa()),
        [`${API_BASE}/usuarios`]: () =>
          json({ data: [usuario({ perfilNome: null, ultimoLoginEm: null })] }),
        [`${API_BASE}/horarios`]: () => json({ data: diasFechados() }),
        [API_UNIDADES]: () => paginaUnidades(),
      },
    });
    const { user } = renderTela(fetchMock);

    await screen.findByRole('heading', { name: 'Configurações da Empresa' }, { timeout: 10_000 });
    await user.click(screen.getByRole('tab', { name: 'Usuários' }));
    await screen.findByText('Gleisielle Carvalho', {}, { timeout: 10_000 });
    expect(screen.getAllByText('-').length).toBeGreaterThan(0);
  });

  it('aba Usuários: sem usuários, mostra o estado vazio', async () => {
    const fetchMock = apiFalsa({
      rotas: {
        [API_BASE]: () => json(empresa()),
        [`${API_BASE}/usuarios`]: () => json({ data: [] }),
        [`${API_BASE}/horarios`]: () => json({ data: diasFechados() }),
        [API_UNIDADES]: () => paginaUnidades(),
      },
    });
    const { user } = renderTela(fetchMock);

    await screen.findByRole('heading', { name: 'Configurações da Empresa' }, { timeout: 10_000 });
    await user.click(screen.getByRole('tab', { name: 'Usuários' }));
    expect(
      await screen.findByText('Nenhum usuário encontrado.', {}, { timeout: 10_000 }),
    ).toBeVisible();
  });

  it('aba Unidades: mostra a grid e o botão Nova Unidade', async () => {
    const { user } = renderTela();

    await screen.findByRole('heading', { name: 'Configurações da Empresa' }, { timeout: 10_000 });
    await user.click(screen.getByRole('tab', { name: 'Unidades' }));

    expect(await screen.findByText('Matriz', {}, { timeout: 10_000 })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Nova Unidade' })).toBeVisible();
  });

  it('aba Unidades: cria uma nova unidade (POST) e fecha o modal', async () => {
    const fetchMock = apiFalsa({
      rotas: {
        [API_BASE]: () => json(empresa()),
        [`${API_BASE}/usuarios`]: () => json({ data: [] }),
        [`${API_BASE}/horarios`]: () => json({ data: diasFechados() }),
        [API_UNIDADES]: (init) => {
          if (init?.method === 'POST') return json(unidade({ nome: 'Filial' }), 201);
          return paginaUnidades([unidade()]);
        },
      },
    });
    const { user } = renderTela(fetchMock);

    await screen.findByRole('heading', { name: 'Configurações da Empresa' }, { timeout: 10_000 });
    await user.click(screen.getByRole('tab', { name: 'Unidades' }));
    await screen.findByText('Matriz', {}, { timeout: 10_000 });

    await user.click(screen.getByRole('button', { name: 'Nova Unidade' }));
    const modal = await screen.findByRole('dialog', { name: 'Nova Unidade' });
    await user.type(within(modal).getByLabelText('Nome'), 'Filial');
    await user.click(within(modal).getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const [, init] =
      chamadasPara(fetchMock, API_UNIDADES).find(([, i]) => i?.method === 'POST') ?? [];
    expect(init?.body ? JSON.parse(init.body as string) : null).toMatchObject({ nome: 'Filial' });
  });

  it('aba Unidades: edita (PATCH) e exclui (DELETE) pelo menu de ações', async () => {
    const fetchMock = apiFalsa({
      rotas: {
        [API_BASE]: () => json(empresa()),
        [`${API_BASE}/usuarios`]: () => json({ data: [] }),
        [`${API_BASE}/horarios`]: () => json({ data: diasFechados() }),
        [`${API_UNIDADES}/${unidade().id}`]: (init) => {
          if (init?.method === 'PATCH') return json(unidade({ nome: 'Matriz Nova' }));
          if (init?.method === 'DELETE') return json(unidade());
          return json(unidade());
        },
        [API_UNIDADES]: () => paginaUnidades([unidade()]),
      },
    });
    const { user } = renderTela(fetchMock);

    await screen.findByRole('heading', { name: 'Configurações da Empresa' }, { timeout: 10_000 });
    await user.click(screen.getByRole('tab', { name: 'Unidades' }));
    const linha = (await screen.findByText('Matriz', {}, { timeout: 10_000 })).closest(
      'tr',
    ) as HTMLElement;

    await user.click(within(linha).getByRole('button', { name: 'Ações' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Editar' }));
    const modalEditar = await screen.findByRole('dialog', { name: 'Editar Unidade' });
    expect(within(modalEditar).getByLabelText('Nome')).toHaveValue('Matriz');
    await user.clear(within(modalEditar).getByLabelText('Nome'));
    await user.type(within(modalEditar).getByLabelText('Nome'), 'Matriz Nova');
    await user.click(within(modalEditar).getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    await user.click(within(linha).getByRole('button', { name: 'Ações' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Excluir' }));
    const confirmacao = await screen.findByRole('alertdialog', { name: 'Excluir Unidade' });
    await user.click(within(confirmacao).getByRole('button', { name: 'Excluir' }));

    await waitFor(() =>
      expect(
        chamadasPara(fetchMock, `${API_UNIDADES}/${unidade().id}`).some(
          ([, i]) => i?.method === 'DELETE',
        ),
      ).toBe(true),
    );
  });

  it('aba Horários: mostra os 7 dias da semana', async () => {
    const { user } = renderTela();

    await screen.findByRole('heading', { name: 'Configurações da Empresa' }, { timeout: 10_000 });
    await user.click(screen.getByRole('tab', { name: 'Horários' }));

    const painel = await screen.findByRole('tabpanel', { name: 'Horários' }, { timeout: 10_000 });
    for (const dia of ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']) {
      expect(within(painel).getByText(dia)).toBeVisible();
    }
    expect(within(painel).getByRole('button', { name: 'Salvar Horários' })).toBeVisible();
  });

  it('aba Horários: abre um dia, adiciona e remove uma pausa, e salva (PUT)', async () => {
    const fetchMock = apiFalsa({
      rotas: {
        [API_BASE]: () => json(empresa()),
        [`${API_BASE}/usuarios`]: () => json({ data: [] }),
        [`${API_BASE}/horarios`]: (init) =>
          init?.method === 'PUT' ? json({ data: diasFechados() }) : json({ data: diasFechados() }),
        [API_UNIDADES]: () => paginaUnidades(),
      },
    });
    const { user } = renderTela(fetchMock);

    await screen.findByRole('heading', { name: 'Configurações da Empresa' }, { timeout: 10_000 });
    await user.click(screen.getByRole('tab', { name: 'Horários' }));
    const painel = await screen.findByRole('tabpanel', { name: 'Horários' }, { timeout: 10_000 });

    await user.click(within(painel).getByRole('checkbox', { name: 'Segunda' }));
    expect(within(painel).getByLabelText('Abre')).toHaveValue('08:00');
    expect(within(painel).getByLabelText('Fecha')).toHaveValue('18:00');

    await user.click(within(painel).getByRole('button', { name: 'Intervalo' }));
    expect(within(painel).getByLabelText('Início da pausa')).toHaveValue('12:00');
    expect(within(painel).getByLabelText('Fim da pausa')).toHaveValue('13:00');

    await user.click(within(painel).getByRole('button', { name: 'Remover intervalo' }));
    expect(within(painel).queryByLabelText('Início da pausa')).not.toBeInTheDocument();

    await user.click(within(painel).getByRole('button', { name: 'Salvar Horários' }));

    await waitFor(() =>
      expect(
        chamadasPara(fetchMock, `${API_BASE}/horarios`).some(([, i]) => i?.method === 'PUT'),
      ).toBe(true),
    );
    const [, init] =
      chamadasPara(fetchMock, `${API_BASE}/horarios`).find(([, i]) => i?.method === 'PUT') ?? [];
    const corpo = init?.body ? JSON.parse(init.body as string) : null;
    expect(corpo.dias.find((d: { diaSemana: number }) => d.diaSemana === 1)).toMatchObject({
      fechado: false,
      abre: '08:00',
      fecha: '18:00',
      intervalos: [],
    });
    expect(await screen.findByText('Horários salvos.')).toBeVisible();

    // Desmarcar o dia some com os campos de horário.
    await user.click(within(painel).getByRole('checkbox', { name: 'Segunda' }));
    expect(within(painel).queryByLabelText('Abre')).not.toBeInTheDocument();
  });

  it('aba Horários: campo de abertura vazio mostra erro de validação e não envia', async () => {
    const fetchMock = apiFalsa({
      rotas: {
        [API_BASE]: () => json(empresa()),
        [`${API_BASE}/usuarios`]: () => json({ data: [] }),
        [`${API_BASE}/horarios`]: () => json({ data: diasFechados() }),
        [API_UNIDADES]: () => paginaUnidades(),
      },
    });
    const { user } = renderTela(fetchMock);

    await screen.findByRole('heading', { name: 'Configurações da Empresa' }, { timeout: 10_000 });
    await user.click(screen.getByRole('tab', { name: 'Horários' }));
    const painel = await screen.findByRole('tabpanel', { name: 'Horários' }, { timeout: 10_000 });

    await user.click(within(painel).getByRole('checkbox', { name: 'Segunda' }));
    fireEvent.change(within(painel).getByLabelText('Abre'), { target: { value: '' } });
    await user.click(within(painel).getByRole('button', { name: 'Salvar Horários' }));

    expect(await screen.findByText('Abre inválido (HH:MM)')).toBeVisible();
    expect(
      chamadasPara(fetchMock, `${API_BASE}/horarios`).some(([, i]) => i?.method === 'PUT'),
    ).toBe(false);
  });

  it('aba Horários: erro ao carregar mostra mensagem', async () => {
    const fetchMock = apiFalsa({
      rotas: {
        [API_BASE]: () => json(empresa()),
        [`${API_BASE}/usuarios`]: () => json({ data: [] }),
        [`${API_BASE}/horarios`]: () =>
          json({ statusCode: 500, code: 'INTERNAL', message: 'Erro' }, 500),
        [API_UNIDADES]: () => paginaUnidades(),
      },
    });
    const { user } = renderTela(fetchMock);

    await screen.findByRole('heading', { name: 'Configurações da Empresa' }, { timeout: 10_000 });
    await user.click(screen.getByRole('tab', { name: 'Horários' }));

    expect(
      await screen.findByText(
        'Não foi possível carregar os horários de funcionamento.',
        {},
        { timeout: 10_000 },
      ),
    ).toBeVisible();
  });
});
