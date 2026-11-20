import { PERMISSOES, PREFERENCIAS_PADRAO, type Treinamento } from '@torres/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { apiFalsa, chamadasPara, json, renderApp, USUARIO_TESTE } from '@/test/render-app';

vi.setConfig({ testTimeout: 20_000 });

const API = '/api/regulatorio-qualidade/treinamentos';
const API_TIPOS = '/api/regulatorio-qualidade/tipos-treinamento';
const API_FUNCIONARIOS = '/api/lookups/funcionarios';
const ID_1 = '00000000-0000-4000-8000-0000000000a1';
const ID_FUNCIONARIO = '00000000-0000-4000-8000-0000000000f1';
const ID_TIPO = '00000000-0000-4000-8000-0000000000b1';

function treinamento(parcial: Partial<Treinamento> = {}): Treinamento {
  return {
    id: ID_1,
    funcionarioId: ID_FUNCIONARIO,
    funcionarioNome: 'Funcionária Fictícia',
    tipoTreinamentoId: ID_TIPO,
    tipoNome: 'NR-32',
    descricao: null,
    dataRealizacao: '2025-01-10',
    dataVencimento: '2026-01-10',
    cargaHoraria: 8,
    instituicao: 'Instituto de Teste',
    observacoes: null,
    status: 'vencido',
    createdAt: '2025-01-10T12:00:00.000Z',
    updatedAt: '2025-01-10T12:00:00.000Z',
    ...parcial,
  };
}

function pagina<T>(data: T[]) {
  return json({ data, meta: { page: 1, pageSize: 10, total: data.length, totalPages: 1 } });
}

const TIPOS = [{ id: ID_TIPO, nome: 'NR-32', createdAt: '2025-01-01T12:00:00.000Z' }];

function renderTela(extra: Parameters<typeof apiFalsa>[0] = {}) {
  const fetchMock = apiFalsa({
    ...extra,
    rotas: {
      [API]: () => pagina([treinamento()]),
      [API_TIPOS]: () => json(TIPOS),
      [API_FUNCIONARIOS]: () =>
        pagina([{ id: ID_FUNCIONARIO, label: 'Funcionária Fictícia', descricao: null }]),
      ...extra.rotas,
    },
  });
  return { user: userEvent.setup(), ...renderApp('/treinamentos', fetchMock), fetchMock };
}

describe('Treinamentos (/treinamentos)', () => {
  it('mostra título, ações, abas e as colunas do inventário', async () => {
    renderTela();

    expect(await screen.findByRole('heading', { name: 'Treinamentos' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Novo Treinamento' })).toBeVisible();
    for (const aba of ['Todos', 'Válido', 'Vencido']) {
      expect(screen.getByRole('button', { name: aba })).toBeVisible();
    }
    expect(screen.getByRole('button', { name: 'Exportar' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Colunas' })).toBeVisible();

    const cabecalhos = within(await screen.findByRole('table')).getAllByRole('columnheader');
    expect(cabecalhos.map((c) => c.textContent)).toEqual([
      'Funcionário',
      'Tipo',
      'Realização',
      'Vencimento',
      'Instituição',
      'Status',
    ]);
    const linha = (await screen.findByText('Funcionária Fictícia')).closest('tr') as HTMLElement;
    expect(within(linha).getByText('NR-32')).toBeVisible();
    expect(within(linha).getByText('10/01/2025')).toBeVisible();
    expect(within(linha).getByText('10/01/2026')).toBeVisible();
    expect(within(linha).getByText('Instituto de Teste')).toBeVisible();
    expect(within(linha).getByText('Vencido')).toBeVisible();
  });

  it('filtra pelas abas, busca e ordena chamando a API', async () => {
    const { user, fetchMock } = renderTela();
    await screen.findByText('Funcionária Fictícia');
    const chamou = (trecho: string) =>
      chamadasPara(fetchMock, API).some(([url]) => url.includes(trecho));

    await user.click(screen.getByRole('button', { name: 'Válido' }));
    await waitFor(() => expect(chamou('status=valido')).toBe(true));

    await user.type(screen.getByPlaceholderText('Buscar treinamentos...'), 'nr');
    await waitFor(() => expect(chamou('search=nr')).toBe(true));

    await user.click(screen.getByRole('button', { name: /Instituição/ }));
    await waitFor(() => expect(chamou('sort=instituicao')).toBe(true));
  });

  it('estado vazio mostra a mensagem', async () => {
    renderTela({ rotas: { [API]: () => pagina([]) } });
    expect(await screen.findByText('Nenhum treinamento encontrado.')).toBeVisible();
  });

  it('Novo Treinamento: Funcionário e Tipo são obrigatórios e nada é enviado sem eles', async () => {
    const { user, fetchMock } = renderTela();
    await screen.findByText('Funcionária Fictícia');

    await user.click(screen.getByRole('button', { name: 'Novo Treinamento' }));
    const modal = await screen.findByRole('dialog', { name: 'Novo Treinamento' });
    for (const campo of [
      'Descrição',
      'Data Realização',
      'Data Vencimento',
      'Carga Horária (h)',
      'Instituição',
      'Observações',
    ]) {
      expect(within(modal).getByLabelText(campo)).toBeVisible();
    }
    await user.click(within(modal).getByRole('button', { name: 'Cadastrar' }));

    expect(await within(modal).findByText('Funcionário é obrigatório.')).toBeVisible();
    expect(within(modal).getByText('Tipo é obrigatório.')).toBeVisible();
    expect(chamadasPara(fetchMock, API).filter(([, i]) => i?.method === 'POST')).toHaveLength(0);
  });

  it('Novo Treinamento: envia os dados, fecha o modal e recarrega a lista', async () => {
    let corpo: unknown;
    const { user, fetchMock } = renderTela({
      rotas: {
        [API]: (init) => {
          if (init?.method !== 'POST') return pagina([treinamento()]);
          corpo = JSON.parse(String(init.body));
          return json(treinamento({ status: 'valido' }), 201);
        },
      },
    });
    await screen.findByText('Funcionária Fictícia');

    await user.click(screen.getByRole('button', { name: 'Novo Treinamento' }));
    const modal = await screen.findByRole('dialog', { name: 'Novo Treinamento' });
    await user.click(within(modal).getByRole('combobox', { name: /Funcionário/ }));
    await user.click(await screen.findByRole('option', { name: 'Funcionária Fictícia' }));
    await user.click(within(modal).getByRole('combobox', { name: /Tipo/ }));
    await user.click(await screen.findByRole('option', { name: 'NR-32' }));
    await user.type(within(modal).getByLabelText('Instituição'), 'Instituto de Teste');
    await user.type(within(modal).getByLabelText('Carga Horária (h)'), '8');
    await user.click(within(modal).getByRole('button', { name: 'Cadastrar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(corpo).toMatchObject({
      funcionarioId: ID_FUNCIONARIO,
      tipoTreinamentoId: ID_TIPO,
      instituicao: 'Instituto de Teste',
      cargaHoraria: 8,
    });
    await waitFor(() =>
      expect(
        chamadasPara(fetchMock, API).filter(([, i]) => !i?.method || i.method === 'GET').length,
      ).toBeGreaterThan(1),
    );
  });

  it('Novo Tipo: o Nome é obrigatório e o tipo criado é enviado à API', async () => {
    let corpo: unknown;
    const { user } = renderTela({
      rotas: {
        [API_TIPOS]: (init) => {
          if (init?.method !== 'POST') return json(TIPOS);
          corpo = JSON.parse(String(init.body));
          return json(
            { id: ID_TIPO, nome: 'Biossegurança', createdAt: '2025-01-01T12:00:00.000Z' },
            201,
          );
        },
      },
    });
    await screen.findByText('Funcionária Fictícia');

    await user.click(screen.getByRole('button', { name: 'Novo Tipo' }));
    const modal = await screen.findByRole('dialog', { name: 'Novo Tipo de Treinamento' });
    await user.click(within(modal).getByRole('button', { name: 'Criar Tipo' }));
    expect(await within(modal).findByText('Nome é obrigatório.')).toBeVisible();

    await user.type(within(modal).getByLabelText(/Nome/), 'Biossegurança');
    await user.click(within(modal).getByRole('button', { name: 'Criar Tipo' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(corpo).toEqual({ nome: 'Biossegurança' });
  });

  it('sem a permissão criar, esconde Novo Treinamento e Novo Tipo', async () => {
    renderTela({
      usuario: {
        ...USUARIO_TESTE,
        permissoes: PERMISSOES.filter((p) => p !== 'regulatorio-qualidade.treinamentos.criar'),
      },
    });
    await screen.findByText('Funcionária Fictícia');
    expect(screen.queryByRole('button', { name: 'Novo Treinamento' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Novo Tipo' })).not.toBeInTheDocument();
  });

  it('em inglês traduz a tela, as colunas, os status e a validação', async () => {
    const { user } = renderTela({
      usuario: { ...USUARIO_TESTE, preferencias: { ...PREFERENCIAS_PADRAO, idioma: 'en' } },
    });

    expect(await screen.findByRole('heading', { name: 'Training' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'New Training' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Expired' })).toBeVisible();
    expect(await screen.findByRole('columnheader', { name: /Employee/ })).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'New Training' }));
    const modal = await screen.findByRole('dialog', { name: 'New Training' });
    await user.click(within(modal).getByRole('button', { name: 'Register' }));
    expect(await within(modal).findByText(/Employee is required/)).toBeVisible();
  });
});
