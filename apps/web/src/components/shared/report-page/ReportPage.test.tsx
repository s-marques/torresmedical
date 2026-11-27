import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PERIODO_INVALIDO, PERMISSOES, type CatalogoRelatorios } from '@torres/shared';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { servidorMsw, usarMsw } from '../../../test/msw';
import { ReportPage } from './ReportPage';
import { periodoPadrao } from './use-selecao-relatorio';

const sessao = vi.hoisted(() => ({ permissoes: [] as readonly string[] }));
vi.mock('@/lib/auth/use-sessao', () => ({ usePermissoes: () => sessao.permissoes }));

usarMsw();

const URL_CATALOGO = '/api/configuracoes-gestao/relatorios';
const PERIODO = { de: '2026-10-01', ate: '2026-10-31' };
const OPCOES_STATUS = ['ativo', 'inativo'].map((valor) => ({
  valor,
  rotulo: valor === 'ativo' ? 'Ativo' : 'Inativo',
}));

const CATALOGO: CatalogoRelatorios = {
  data: [
    {
      id: 'EX-01',
      nome: 'Unidades cadastradas no período',
      colunas: [
        { id: 'nome', titulo: 'Nome', tipo: 'text', ordenavel: true },
        { id: 'createdAt', titulo: 'Criado em', tipo: 'datetime', ordenavel: true },
      ],
      filtros: [{ tipo: 'select', parametro: 'status', rotulo: 'Status', opcoes: OPCOES_STATUS }],
    },
    {
      id: 'EX-02',
      nome: 'Outro relatório',
      colunas: [{ id: 'valor', titulo: 'Valor', tipo: 'currency', ordenavel: false }],
      filtros: [],
    },
  ],
};

const LINHAS: Record<string, Record<string, unknown>[]> = {
  'EX-01': [
    { nome: 'Centro', createdAt: '2026-10-05T15:30:00.000Z' },
    { nome: 'Barra', createdAt: null },
  ],
  'EX-02': [{ valor: '1234.5' }],
};

/** Linha de totais devolvida pela API falsa, por relatório. */
const TOTAIS: Record<string, Record<string, unknown>> = {};

/** Query strings recebidas pela API falsa, por caminho. */
let pedidos: Record<string, Record<string, string>[]>;

function ultimo(caminho: string): Record<string, string> | undefined {
  return pedidos[caminho]?.at(-1);
}

function responder(catalogo: CatalogoRelatorios = CATALOGO) {
  servidorMsw.use(
    http.get(URL_CATALOGO, () => HttpResponse.json(catalogo)),
    http.get(`${URL_CATALOGO}/:id`, ({ request, params }) => {
      const id = String(params.id);
      const query = Object.fromEntries(new URL(request.url).searchParams);
      (pedidos[id] ??= []).push(query);
      const data = LINHAS[id] ?? [];
      return HttpResponse.json({
        data,
        meta: { page: 1, pageSize: 10, total: data.length, totalPages: 1 },
        ...(TOTAIS[id] && { totais: TOTAIS[id] }),
      });
    }),
  );
}

function renderizar(inicial = '/gestao/relatorios') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(
    [
      {
        path: '/gestao/relatorios',
        element: (
          <ReportPage
            tela="configuracoes-gestao.relatorios"
            titulo="Relatórios de Gestão"
            descricao="Log de acesso, ticket médio, ocupação de sala e LTV."
          />
        ),
      },
    ],
    { initialEntries: [inicial] },
  );
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { user: userEvent.setup(), router };
}

const comPeriodo = (relatorio: string) =>
  `/gestao/relatorios?relatorio=${relatorio}&de=${PERIODO.de}&ate=${PERIODO.ate}`;

function parametros(router: ReturnType<typeof renderizar>['router']) {
  return Object.fromEntries(new URLSearchParams(router.state.location.search));
}

async function escolher(user: ReturnType<typeof userEvent.setup>, nome: string, opcao: string) {
  await user.click(screen.getByRole('combobox', { name: nome }));
  await user.click(await screen.findByRole('option', { name: opcao }));
}

beforeEach(() => {
  pedidos = {};
  for (const id of Object.keys(TOTAIS)) delete TOTAIS[id];
  sessao.permissoes = PERMISSOES;
  responder();
});

describe('ReportPage', () => {
  it('mostra a linha de total no rodapé, com o rótulo na 1ª coluna e o valor formatado', async () => {
    TOTAIS['EX-01'] = { createdAt: '2026-10-05T15:30:00.000Z' };
    renderizar(comPeriodo('EX-01'));

    const rodape = (await screen.findByText('Total')).closest('tr') as HTMLElement;
    const celulas = within(rodape).getAllByRole('cell');
    expect(celulas).toHaveLength(2);
    expect(celulas[1]?.textContent).toMatch(/^05\/10\/2026/);
  });

  it('sem totais na resposta, não mostra rodapé', async () => {
    renderizar(comPeriodo('EX-02'));

    expect(await screen.findByText(/1\.234,50/)).toBeInTheDocument();
    expect(screen.queryByText('Total')).not.toBeInTheDocument();
  });

  it('sem relatório: cabeçalho, seletor, período padrão e estado vazio, sem consultar', async () => {
    renderizar();

    expect(screen.getByRole('heading', { name: 'Relatórios de Gestão' })).toBeInTheDocument();
    const seletor = screen.getByRole('combobox', { name: 'Relatório' });
    await waitFor(() => expect(seletor).toHaveTextContent('Selecione um relatório...'));
    const padrao = periodoPadrao();
    expect(screen.getByLabelText('De')).toHaveValue(padrao.de);
    expect(screen.getByLabelText('Até')).toHaveValue(padrao.ate);
    expect(screen.getByText('Selecione um relatório')).toBeInTheDocument();
    expect(pedidos).toEqual({});
  });

  it('lista no seletor só os relatórios do catálogo da API, com o código', async () => {
    const { user } = renderizar();
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Relatório' })).toBeEnabled());

    await user.click(screen.getByRole('combobox', { name: 'Relatório' }));

    const opcoes = await screen.findAllByRole('option');
    expect(opcoes.map((opcao) => opcao.textContent)).toEqual([
      'EX-01 — Unidades cadastradas no período',
      'EX-02 — Outro relatório',
    ]);
  });

  it('ao escolher o relatório, consulta o período e monta o grid com as colunas da API', async () => {
    const { user, router } = renderizar();
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Relatório' })).toBeEnabled());

    await escolher(user, 'Relatório', 'EX-01 — Unidades cadastradas no período');

    expect(await screen.findByText('Centro')).toBeInTheDocument();
    const cabecalhos = screen.getAllByRole('columnheader').map((th) => th.textContent);
    expect(cabecalhos).toEqual(['Nome', 'Criado em']);
    // Data/hora formatada; vazio vira "-".
    expect(screen.getByText(/^05\/10\/2026/)).toBeInTheDocument();
    expect(screen.getByText('-')).toBeInTheDocument();
    const padrao = periodoPadrao();
    expect(ultimo('EX-01')).toEqual({ page: '1', pageSize: '10', ...padrao });
    expect(parametros(router)).toEqual({ relatorio: 'EX-01', ...padrao });
  });

  it('abre direto pelo link e formata moeda; trocar de relatório descarta a ordenação', async () => {
    const { user, router } = renderizar(`${comPeriodo('EX-01')}&sort=nome:desc&page=2`);
    expect(await screen.findByText('Centro')).toBeInTheDocument();
    expect(ultimo('EX-01')).toEqual({ page: '2', pageSize: '10', sort: 'nome:desc', ...PERIODO });

    await escolher(user, 'Relatório', 'EX-02 — Outro relatório');

    expect(await screen.findByText('R$ 1.234,50')).toBeInTheDocument();
    expect(ultimo('EX-02')).toEqual({ page: '1', pageSize: '10', ...PERIODO });
    expect(parametros(router)).toEqual({ relatorio: 'EX-02', ...PERIODO });
  });

  it('De depois de Até: mostra o erro do schema e não consulta; ao corrigir, volta à página 1', async () => {
    const { router } = renderizar(`${comPeriodo('EX-01')}&page=2`);
    await screen.findByText('Centro');
    const consultas = pedidos['EX-01']?.length;

    fireEvent.change(screen.getByLabelText('De'), { target: { value: '2026-11-15' } });

    expect(await screen.findByText(PERIODO_INVALIDO)).toBeInTheDocument();
    expect(screen.getByLabelText('Até')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(pedidos['EX-01']).toHaveLength(consultas ?? 0);

    fireEvent.change(screen.getByLabelText('Até'), { target: { value: '2026-11-30' } });

    await waitFor(() =>
      expect(ultimo('EX-01')).toEqual({
        page: '1',
        pageSize: '10',
        de: '2026-11-15',
        ate: '2026-11-30',
      }),
    );
    expect(screen.queryByText(PERIODO_INVALIDO)).not.toBeInTheDocument();
    expect(parametros(router)).toEqual({ relatorio: 'EX-01', de: '2026-11-15', ate: '2026-11-30' });
  });

  it('aplica os filtros extras do relatório', async () => {
    const { user } = renderizar(comPeriodo('EX-01'));
    await screen.findByText('Centro');

    await escolher(user, 'Status', 'Inativo');

    await waitFor(() => expect(ultimo('EX-01')).toMatchObject({ status: 'inativo', ...PERIODO }));
  });

  it('relatório fora do catálogo (sem permissão) não consulta e sai da URL', async () => {
    responder({ data: [] });
    const { router } = renderizar(comPeriodo('EX-01'));

    expect(await screen.findByText('Selecione um relatório')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'Relatório' })).toHaveTextContent(
        'Nenhum relatório disponível',
      ),
    );
    await waitFor(() => expect(parametros(router)).toEqual(PERIODO));
    expect(pedidos).toEqual({});
  });

  it('usa só o teclado: escolhe o relatório e chega ao "Exportar"', async () => {
    const { user } = renderizar();
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Relatório' })).toBeEnabled());

    await user.tab();
    expect(screen.getByRole('link', { name: 'Painel' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('combobox', { name: 'Relatório' })).toHaveFocus();
    await user.keyboard('{Enter}');
    // Aberto, o foco fica na primeira opção.
    expect(await screen.findByRole('option', { name: /^EX-01/ })).toHaveFocus();
    await user.keyboard('{Enter}');

    expect(await screen.findByText('Centro')).toBeInTheDocument();
    await user.tab();
    expect(screen.getByLabelText('De')).toHaveFocus();
    await user.tab();
    expect(screen.getByLabelText('Até')).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('combobox', { name: 'Status' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Exportar' })).toHaveFocus();
  });

  describe('exportação', () => {
    const urlOriginal = { create: URL.createObjectURL, revoke: URL.revokeObjectURL };

    afterEach(() => {
      URL.createObjectURL = urlOriginal.create;
      URL.revokeObjectURL = urlOriginal.revoke;
    });

    it('exporta com o período, a ordenação e as colunas visíveis', async () => {
      URL.createObjectURL = vi.fn(() => 'blob:1');
      URL.revokeObjectURL = vi.fn();
      const clique = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
      servidorMsw.use(
        http.get(`${URL_CATALOGO}/EX-01/export`, ({ request }) => {
          (pedidos.export ??= []).push(Object.fromEntries(new URL(request.url).searchParams));
          return new HttpResponse('pdf', {
            headers: { 'Content-Disposition': 'attachment; filename="relatorio-ex-01.pdf"' },
          });
        }),
      );
      const { user } = renderizar(`${comPeriodo('EX-01')}&sort=nome:asc`);
      await screen.findByText('Centro');

      await user.click(screen.getByRole('button', { name: 'Exportar' }));
      await user.click(await screen.findByRole('menuitem', { name: 'PDF' }));

      await waitFor(() => expect(clique).toHaveBeenCalledOnce());
      expect(ultimo('export')).toEqual({
        relatorio: 'EX-01',
        sort: 'nome:asc',
        format: 'pdf',
        columns: 'nome,createdAt',
        ...PERIODO,
      });
    });

    it('esconde o "Exportar" sem a permissão de exportar da tela', async () => {
      sessao.permissoes = PERMISSOES.filter(
        (p) => p !== 'configuracoes-gestao.relatorios.exportar',
      );
      renderizar(comPeriodo('EX-01'));

      expect(await screen.findByText('Centro')).toBeInTheDocument();
      expect(within(screen.getByRole('table')).getByText('Barra')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Exportar' })).not.toBeInTheDocument();
    });
  });
});
