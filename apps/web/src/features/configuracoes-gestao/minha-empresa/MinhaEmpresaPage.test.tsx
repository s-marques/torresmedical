import type { DiaHorario, Empresa, Unidade, UsuarioResumo } from '@torres/shared';
import { screen, waitFor, within } from '@testing-library/react';
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
    renderTela();

    expect(await screen.findByRole('heading', { name: 'Configurações da Empresa' })).toBeVisible();
    for (const aba of ['Dados', 'Plano e Faturas', 'Integrações', 'Usuários', 'Unidades', 'Horários']) {
      expect(screen.getByRole('tab', { name: aba })).toBeVisible();
    }
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

    expect(
      await screen.findByLabelText('Nome da Empresa', {}, { timeout: 10_000 }),
    ).toHaveValue('TORRES MEDICAL CENTER CORP.');
    expect(screen.getByLabelText('E-mail')).toHaveValue('contato@torresmedical.com');

    await user.click(screen.getByRole('button', { name: 'Salvar Alterações' }));

    await waitFor(() => expect(chamadasPara(fetchMock, API_BASE).length).toBeGreaterThan(1));
    const [, init] = chamadasPara(fetchMock, API_BASE).at(-1) ?? [];
    expect(init?.method).toBe('PUT');
    expect(await screen.findByText('Alterações salvas.')).toBeVisible();
  });

  it('aba Usuários: lista somente leitura', async () => {
    const { user } = renderTela();

    await screen.findByRole('heading', { name: 'Configurações da Empresa' }, { timeout: 10_000 });
    await user.click(screen.getByRole('tab', { name: 'Usuários' }));

    expect(await screen.findByText('Gleisielle Carvalho', {}, { timeout: 10_000 })).toBeVisible();
    expect(screen.getByText('gleisielle@example.com')).toBeVisible();
  });

  it('aba Unidades: mostra a grid e o botão Nova Unidade', async () => {
    const { user } = renderTela();

    await screen.findByRole('heading', { name: 'Configurações da Empresa' }, { timeout: 10_000 });
    await user.click(screen.getByRole('tab', { name: 'Unidades' }));

    expect(await screen.findByText('Matriz', {}, { timeout: 10_000 })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Nova Unidade' })).toBeVisible();
  });

  it('aba Horários: mostra os 7 dias da semana', async () => {
    const { user } = renderTela();

    await screen.findByRole('heading', { name: 'Configurações da Empresa' }, { timeout: 10_000 });
    await user.click(screen.getByRole('tab', { name: 'Horários' }));

    const painel = await screen.findByRole(
      'tabpanel',
      { name: 'Horários' },
      { timeout: 10_000 },
    );
    for (const dia of ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']) {
      expect(within(painel).getByText(dia)).toBeVisible();
    }
    expect(within(painel).getByRole('button', { name: 'Salvar Horários' })).toBeVisible();
  });
});
