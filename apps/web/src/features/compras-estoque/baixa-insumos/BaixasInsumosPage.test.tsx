import { PERMISSOES, type BaixaInsumo } from '@torres/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { apiFalsa, chamadasPara, json, renderApp, USUARIO_TESTE } from '@/test/render-app';

// Tela com modal e comboboxes: estoura os 5 s padrão no CI (cobertura).
vi.setConfig({ testTimeout: 20_000 });

const BASE = '/api/compras-estoque/baixas-insumos';
const PRODUTO = '00000000-0000-4000-8000-0000000000a1';
const PACIENTE = '00000000-0000-4000-8000-0000000000c1';
const META = { page: 1, pageSize: 10, total: 2, totalPages: 1 };

function baixa(parcial: Partial<BaixaInsumo>): BaixaInsumo {
  return {
    id: '00000000-0000-4000-8000-0000000000b1',
    pacienteId: PACIENTE,
    pacienteNome: 'Paciente Fictícia',
    profissionalId: null,
    profissionalNome: 'Dra. Fictícia',
    unidadeId: null,
    unidadeNome: 'Matriz',
    pressaoArterial: null,
    dextro: null,
    observacao: null,
    responsavelId: USUARIO_TESTE.id,
    responsavelNome: 'Pessoa de Teste',
    itens: [{ produtoId: PRODUTO, produtoNome: 'Luva Nitrílica', quantidade: '2' }],
    createdAt: '2026-11-10T15:30:00.000Z',
    ...parcial,
  };
}

const BAIXAS = [
  baixa({}),
  baixa({
    id: '00000000-0000-4000-8000-0000000000b2',
    pacienteId: null,
    pacienteNome: null,
    profissionalNome: null,
    itens: [
      { produtoId: PRODUTO, produtoNome: 'Gaze Estéril', quantidade: '5' },
      { produtoId: PRODUTO, produtoNome: 'Álcool', quantidade: '1' },
    ],
  }),
];

const lookup = (data: { id: string; label: string }[]) =>
  json({ data: data.map((d) => ({ ...d, descricao: null })), meta: META });

type Rota = (init?: RequestInit) => Response;

function api(rotas: Record<string, Rota> = {}, permissoes?: string[]) {
  return apiFalsa({
    usuario: permissoes
      ? { ...USUARIO_TESTE, permissoes: permissoes as typeof USUARIO_TESTE.permissoes }
      : USUARIO_TESTE,
    rotas: {
      [BASE]: () => json({ data: BAIXAS, meta: META }),
      '/api/lookups/produtos': () => lookup([{ id: PRODUTO, label: 'Luva Nitrílica' }]),
      '/api/lookups/pacientes': () => lookup([{ id: PACIENTE, label: 'Paciente Fictícia' }]),
      '/api/lookups/profissionais': () => lookup([]),
      '/api/lookups/unidades': () => lookup([]),
      ...rotas,
    },
  });
}

function renderTela(fetchMock = api()) {
  return { ...renderApp('/baixa-insumos', fetchMock), user: userEvent.setup(), fetchMock };
}

function ultimaQuery(fetchMock: ReturnType<typeof apiFalsa>) {
  const gets = chamadasPara(fetchMock, BASE).filter(
    ([, init]) => !init?.method || init.method === 'GET',
  );
  const [url] = gets.at(-1) ?? [''];
  return Object.fromEntries(new URL(url, 'http://x').searchParams);
}

describe('Baixa de Insumos (/baixa-insumos)', () => {
  it('mostra título, Nova Baixa e o grid com colunas, itens e responsável', async () => {
    renderTela();

    expect(await screen.findByRole('heading', { name: 'Baixa de Insumos' })).toBeVisible();
    expect(screen.getByText('Controle de consumo de insumos por atendimento')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Nova Baixa' })).toBeVisible();

    const tabela = await screen.findByRole('table');
    expect(
      within(tabela)
        .getAllByRole('columnheader')
        .map((c) => c.textContent),
    ).toEqual(['Data', 'Paciente', 'Profissional', 'Unidade', 'Itens', 'Responsável']);
    const primeira = within(tabela).getByRole('row', { name: /Luva Nitrílica/ });
    for (const texto of ['Paciente Fictícia', 'Dra. Fictícia', 'Matriz', 'Luva Nitrílica (2)']) {
      expect(within(primeira).getByText(texto)).toBeVisible();
    }
    expect(within(primeira).getByText('Pessoa de Teste')).toBeVisible();
    expect(within(tabela).getByRole('row', { name: /Gaze/ })).toHaveTextContent(
      'Gaze Estéril (5), Álcool (1)',
    );
  });

  it('estado vazio do inventário', async () => {
    renderTela(
      api({ [BASE]: () => json({ data: [], meta: { ...META, total: 0, totalPages: 0 } }) }),
    );
    expect(await screen.findByText('Nenhuma baixa registrada.')).toBeVisible();
  });

  it('filtra por Data Início/Fim, limpa o período e ordena pela API', async () => {
    const { user, fetchMock } = renderTela();
    await screen.findByText('Luva Nitrílica (2)');
    expect(ultimaQuery(fetchMock)).toEqual({ page: '1', pageSize: '10' });

    const periodo = screen.getByRole('group', { name: 'Período' });
    await user.type(within(periodo).getByLabelText('Período de:'), '2026-11-01');
    await user.type(within(periodo).getByLabelText('até:'), '2026-11-30');
    await waitFor(() =>
      expect(ultimaQuery(fetchMock)).toMatchObject({
        dataInicio: '2026-11-01',
        dataFim: '2026-11-30',
      }),
    );

    await user.click(within(periodo).getByRole('button', { name: 'Limpar Período' }));
    await waitFor(() => expect(within(periodo).getByLabelText('Período de:')).toHaveValue(''));
    expect(within(periodo).getByLabelText('até:')).toHaveValue('');

    await user.click(screen.getByRole('button', { name: /Paciente/ }));
    await waitFor(() => expect(ultimaQuery(fetchMock)).toMatchObject({ sort: 'paciente:asc' }));
  });

  it('Nova Baixa: exige um insumo e envia o POST com itens e quantidades', async () => {
    let corpo: Record<string, unknown> = {};
    const fetchMock = api({
      [BASE]: (init) => {
        if (init?.method === 'POST') {
          corpo = JSON.parse(String(init.body)) as Record<string, unknown>;
          return json(baixa({}), 201);
        }
        return json({ data: BAIXAS, meta: META });
      },
    });
    const { user } = renderTela(fetchMock);
    await screen.findByText('Luva Nitrílica (2)');
    await user.click(screen.getByRole('button', { name: 'Nova Baixa' }));
    const modal = await screen.findByRole('dialog', { name: 'Nova Baixa de Insumos' });

    expect(within(modal).getByLabelText('Pressão Arterial')).toBeVisible();
    expect(within(modal).getByLabelText('Dextro (Glicemia)')).toBeVisible();
    expect(within(modal).getByLabelText('Observação')).toBeVisible();
    expect(within(modal).getByRole('button', { name: 'Cancelar' })).toBeVisible();

    await user.click(within(modal).getByRole('button', { name: 'Registrar Baixa' }));
    expect(await within(modal).findByText('Selecione ao menos um insumo.')).toBeVisible();
    expect(
      chamadasPara(fetchMock, BASE).filter(([, init]) => init?.method === 'POST'),
    ).toHaveLength(0);

    await user.click(within(modal).getByRole('combobox', { name: 'Buscar insumo' }));
    await user.click(await screen.findByRole('option', { name: /Luva Nitrílica/ }));
    const quantidade = await within(modal).findByLabelText('Quantidade do insumo 1');
    await user.clear(quantidade);
    await user.type(quantidade, '3');
    await user.type(within(modal).getByLabelText('Pressão Arterial'), '12/8');
    await user.click(within(modal).getByRole('button', { name: 'Registrar Baixa' }));

    await waitFor(() =>
      expect(corpo).toMatchObject({
        pressaoArterial: '12/8',
        itens: [{ produtoId: PRODUTO, quantidade: 3 }],
      }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(await screen.findByText('Baixa registrada.')).toBeVisible();
  });

  it('remove um insumo da baixa e Cancelar fecha o modal sem enviar', async () => {
    const { user, fetchMock } = renderTela();
    await screen.findByText('Luva Nitrílica (2)');
    await user.click(screen.getByRole('button', { name: 'Nova Baixa' }));
    const modal = await screen.findByRole('dialog', { name: 'Nova Baixa de Insumos' });

    await user.click(within(modal).getByRole('combobox', { name: 'Buscar insumo' }));
    await user.click(await screen.findByRole('option', { name: /Luva Nitrílica/ }));
    await user.click(await within(modal).findByRole('button', { name: 'Remover insumo 1' }));
    expect(within(modal).queryByLabelText('Quantidade do insumo 1')).not.toBeInTheDocument();

    await user.click(within(modal).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(
      chamadasPara(fetchMock, BASE).filter(([, init]) => init?.method === 'POST'),
    ).toHaveLength(0);
  });

  it('sem permissão de criar: esconde Nova Baixa', async () => {
    renderTela(
      api(
        {},
        PERMISSOES.filter((p) => p === 'compras-estoque.baixa-insumos.ver'),
      ),
    );
    expect(await screen.findByText('Luva Nitrílica (2)')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Nova Baixa' })).not.toBeInTheDocument();
  });
});
