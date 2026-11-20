import { PERMISSOES, PREFERENCIAS_PADRAO, type NaoConformidade } from '@torres/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { apiFalsa, chamadasPara, json, renderApp, USUARIO_TESTE } from '@/test/render-app';

vi.setConfig({ testTimeout: 20_000 });

const API = '/api/regulatorio-qualidade/nao-conformidades';
const ID_1 = '00000000-0000-4000-8000-0000000000a1';

function naoConformidade(parcial: Partial<NaoConformidade> = {}): NaoConformidade {
  return {
    id: ID_1,
    titulo: 'Lote armazenado fora da temperatura',
    descricao: null,
    setor: 'Estoque',
    tipo: 'produto',
    dataOcorrencia: '2026-11-10',
    dataLimiteCorrecao: null,
    responsavel: 'Responsável Fictício',
    acaoCorretiva: null,
    observacoes: null,
    status: 'em-tratamento',
    createdAt: '2026-11-10T12:00:00.000Z',
    updatedAt: '2026-11-10T12:00:00.000Z',
    ...parcial,
  };
}

function pagina<T>(data: T[]) {
  return json({ data, meta: { page: 1, pageSize: 10, total: data.length, totalPages: 1 } });
}

function renderTela(extra: Parameters<typeof apiFalsa>[0] = {}) {
  const fetchMock = apiFalsa({
    ...extra,
    rotas: { [API]: () => pagina([naoConformidade()]), ...extra.rotas },
  });
  return { user: userEvent.setup(), ...renderApp('/nao-conformidades', fetchMock), fetchMock };
}

describe('Não Conformidades (/nao-conformidades)', () => {
  it('mostra título, ação, chips de status e as colunas do inventário', async () => {
    renderTela();

    expect(await screen.findByRole('heading', { name: 'Não Conformidades' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Nova NC' })).toBeVisible();
    for (const aba of ['Todas', 'Aberta', 'Em Tratamento', 'Corrigida', 'Fechada']) {
      expect(screen.getByRole('button', { name: aba })).toBeVisible();
    }
    expect(screen.getByRole('button', { name: 'Exportar' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Colunas' })).toBeVisible();

    const cabecalhos = within(await screen.findByRole('table')).getAllByRole('columnheader');
    expect(cabecalhos.map((c) => c.textContent)).toEqual([
      'Título',
      'Setor',
      'Tipo',
      'Data Ocorrência',
      'Responsável',
      'Status',
    ]);
    const linha = (await screen.findByText('Estoque')).closest('tr') as HTMLElement;
    expect(within(linha).getByText('Lote armazenado fora da temperatura')).toBeVisible();
    expect(within(linha).getByText('Produto')).toBeVisible();
    expect(within(linha).getByText('Em Tratamento')).toBeVisible();
  });

  it('filtra pelas abas de status, busca e ordena chamando a API', async () => {
    const { user, fetchMock } = renderTela();
    await screen.findByText('Estoque');
    const chamou = (trecho: string) =>
      chamadasPara(fetchMock, API).some(([url]) => url.includes(trecho));

    await user.click(screen.getByRole('button', { name: 'Fechada' }));
    await waitFor(() => expect(chamou('status=fechada')).toBe(true));

    await user.type(screen.getByPlaceholderText('Buscar não conformidades...'), 'lote');
    await waitFor(() => expect(chamou('search=lote')).toBe(true));

    await user.click(screen.getByRole('button', { name: /Setor/ }));
    await waitFor(() => expect(chamou('sort=setor')).toBe(true));
  });

  it('estado vazio mostra a mensagem', async () => {
    renderTela({ rotas: { [API]: () => pagina([]) } });
    expect(await screen.findByText('Nenhuma não conformidade encontrada.')).toBeVisible();
  });

  it('Nova NC: Título e Tipo são obrigatórios e nada é enviado sem eles', async () => {
    const { user, fetchMock } = renderTela();
    await screen.findByText('Estoque');

    await user.click(screen.getByRole('button', { name: 'Nova NC' }));
    const modal = await screen.findByRole('dialog', { name: 'Nova Não Conformidade' });
    for (const campo of [
      'Descrição',
      'Setor',
      'Data Ocorrência',
      'Data Limite Correção',
      'Responsável',
      'Ação Corretiva',
      'Observações',
    ]) {
      expect(within(modal).getByLabelText(campo)).toBeVisible();
    }
    await user.click(within(modal).getByRole('button', { name: 'Registrar' }));

    expect(await within(modal).findByText('Título é obrigatório.')).toBeVisible();
    expect(within(modal).getByText('Tipo é obrigatório.')).toBeVisible();
    expect(chamadasPara(fetchMock, API).filter(([, i]) => i?.method === 'POST')).toHaveLength(0);
  });

  it('Nova NC: envia os dados, fecha o modal e recarrega a lista', async () => {
    let corpo: unknown;
    const { user, fetchMock } = renderTela({
      rotas: {
        [API]: (init) => {
          if (init?.method !== 'POST') return pagina([naoConformidade()]);
          corpo = JSON.parse(String(init.body));
          return json(naoConformidade({ titulo: 'Nova', status: 'aberta' }), 201);
        },
      },
    });
    await screen.findByText('Estoque');

    await user.click(screen.getByRole('button', { name: 'Nova NC' }));
    const modal = await screen.findByRole('dialog', { name: 'Nova Não Conformidade' });
    await user.type(within(modal).getByLabelText(/Título/), 'Falha no processo');
    await user.type(within(modal).getByLabelText('Setor'), 'Recepção');
    await user.click(within(modal).getByRole('combobox', { name: /Tipo/ }));
    await user.click(await screen.findByRole('option', { name: 'Processo' }));
    await user.click(within(modal).getByRole('button', { name: 'Registrar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(corpo).toMatchObject({
      titulo: 'Falha no processo',
      setor: 'Recepção',
      tipo: 'processo',
    });
    await waitFor(() =>
      expect(
        chamadasPara(fetchMock, API).filter(([, i]) => !i?.method || i.method === 'GET').length,
      ).toBeGreaterThan(1),
    );
  });

  it('sem a permissão criar, esconde Nova NC', async () => {
    renderTela({
      usuario: {
        ...USUARIO_TESTE,
        permissoes: PERMISSOES.filter((p) => p !== 'regulatorio-qualidade.nao-conformidades.criar'),
      },
    });
    await screen.findByText('Estoque');
    expect(screen.queryByRole('button', { name: 'Nova NC' })).not.toBeInTheDocument();
  });

  it('em inglês traduz a tela, as colunas, os status e a validação', async () => {
    const { user } = renderTela({
      usuario: { ...USUARIO_TESTE, preferencias: { ...PREFERENCIAS_PADRAO, idioma: 'en' } },
    });

    expect(await screen.findByRole('heading', { name: 'Nonconformities' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'New NC' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'In Treatment' })).toBeVisible();
    expect(await screen.findByText('Product')).toBeVisible();
    expect(screen.getByRole('columnheader', { name: /Occurrence Date/ })).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'New NC' }));
    const modal = await screen.findByRole('dialog', { name: 'New Nonconformity' });
    await user.click(within(modal).getByRole('button', { name: 'Register' }));
    expect(await within(modal).findByText(/Title is required/)).toBeVisible();
  });
});
