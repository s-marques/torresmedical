import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  exportUnidadesQuerySchema,
  listUnidadesQuerySchema,
  PERMISSOES,
  unidadePageSchema,
  type Permissao,
  type Unidade,
} from '@torres/shared';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { aplicarIdioma } from '@/lib/i18n';
import { matchMediaStub } from '../../../test/match-media';
import { servidorMsw, usarMsw } from '../../../test/msw';
import { StatusAtivo } from '../StatusBadge';
import { DataGrid } from './DataGrid';
import type { ColunaGrid, DataGridProps } from './tipos';

const sessao = vi.hoisted(() => ({ permissoes: [] as readonly string[] }));
vi.mock('@/lib/auth/use-sessao', () => ({ usePermissoes: () => sessao.permissoes }));

usarMsw();

const URL_LISTA = '/api/configuracoes-gestao/unidades';
const TOTAL = 25;
const EMPRESA = '7a1d3c52-8d0f-4b8e-9f4c-2b2f3c4d5e6f';

function unidade(i: number): Unidade {
  return {
    id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    empresaId: EMPRESA,
    nome: `Unidade ${i}`,
    endereco: null,
    cidade: null,
    uf: null,
    telefone: null,
    cnpj: null,
    cnes: null,
    ativo: i % 2 === 1,
    createdAt: '2026-10-01T12:00:00.000Z',
    updatedAt: '2026-10-01T12:00:00.000Z',
  };
}

/** Query strings recebidas pela API falsa, por caminho. */
let pedidos: Record<string, URLSearchParams[]>;

function ultimo(caminho = URL_LISTA): Record<string, string> {
  return Object.fromEntries(pedidos[caminho]?.at(-1) ?? []);
}

function responderLista(total = TOTAL) {
  servidorMsw.use(
    http.get(URL_LISTA, ({ request }) => {
      const params = new URL(request.url).searchParams;
      (pedidos[URL_LISTA] ??= []).push(params);
      const page = Number(params.get('page'));
      const pageSize = Number(params.get('pageSize'));
      const inicio = (page - 1) * pageSize;
      const data = Array.from({ length: Math.max(0, Math.min(pageSize, total - inicio)) }, (_, i) =>
        unidade(inicio + i + 1),
      );
      return HttpResponse.json({
        data,
        meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
      });
    }),
  );
}

const COLUNAS: ColunaGrid<Unidade>[] = [
  { id: 'nome', titulo: 'Nome', ordenavel: true, exportavel: true },
  {
    id: 'status',
    titulo: 'Status',
    ordenavel: 'ativo',
    exportavel: true,
    celula: (u) => <StatusAtivo ativo={u.ativo} />,
  },
  { id: 'createdAt', titulo: 'Criado em', ordenavel: true, exportavel: true, oculta: true },
  { id: 'empresaId', titulo: 'Empresa', ocultavel: false },
];

const PROPS: DataGridProps<Unidade> = {
  url: URL_LISTA,
  schema: unidadePageSchema,
  querySchema: listUnidadesQuerySchema,
  colunas: COLUNAS,
  busca: 'Buscar unidades...',
  status: {
    opcoes: [
      { valor: 'ativo', rotulo: 'Ativo' },
      { valor: 'inativo', rotulo: 'Inativo' },
    ],
  },
  exportacao: {
    permissao: 'configuracoes-gestao.minha-empresa.exportar',
    schema: exportUnidadesQuerySchema,
  },
  mensagemVazio: 'Nenhuma unidade encontrada.',
};

function renderizar(props: Partial<DataGridProps<Unidade>> = {}, inicial = '/lista') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(
    [{ path: '/lista', element: <DataGrid {...PROPS} {...props} /> }],
    { initialEntries: [inicial] },
  );
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { user: userEvent.setup(), router };
}

const botao = (nome: string) => screen.getByRole('button', { name: nome });

beforeEach(() => {
  pedidos = {};
  sessao.permissoes = PERMISSOES;
  responderLista();
});

describe('DataGrid no celular (issue #161)', () => {
  beforeEach(() => {
    vi.stubGlobal('matchMedia', (query: string) => matchMediaStub(query, true));
  });

  it('mostra cada linha como cartão, com a primeira coluna de título e as demais como campos', async () => {
    renderizar();

    expect(await screen.findByText('Unidade 1')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    const cartoes = screen.getAllByRole('listitem');
    expect(cartoes).toHaveLength(10);
    expect(within(cartoes[0]!).getByText('Unidade 1')).toBeInTheDocument();
    expect(within(cartoes[0]!).getByText('Status')).toBeInTheDocument();
    expect(within(cartoes[0]!).getByText('Empresa')).toBeInTheDocument();
    // Coluna oculta por padrão continua oculta.
    expect(within(cartoes[0]!).queryByText('Criado em')).not.toBeInTheDocument();
    expect(screen.getByText('25 linha(s) no total.')).toBeInTheDocument();
  });

  it('usa a coluna marcada com `tituloCartao` como título', async () => {
    const colunas = COLUNAS.map((c) => (c.id === 'status' ? { ...c, tituloCartao: true } : c));
    renderizar({ colunas });

    await screen.findByText('Unidade 1');
    const primeiro = screen.getAllByRole('listitem')[0]!;
    const [titulo] = primeiro.querySelectorAll('.font-medium');
    expect(titulo).toHaveTextContent('Ativo');
    expect(within(primeiro).getByText('Nome')).toBeInTheDocument();
  });

  it('abre o menu de ações e o clique no cartão sem disputar o clique do botão', async () => {
    const aoClicarLinha = vi.fn();
    const onSelect = vi.fn();
    const { user } = renderizar({
      aoClicarLinha,
      acoes: () => [{ rotulo: 'Editar', onSelect }],
    });

    await screen.findByText('Unidade 1');
    const primeiro = screen.getAllByRole('listitem')[0]!;
    await user.click(within(primeiro).getByRole('button', { name: 'Ações' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Editar' }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(aoClicarLinha).not.toHaveBeenCalled();

    await user.click(within(primeiro).getByText('Unidade 1'));
    expect(aoClicarLinha).toHaveBeenCalledWith(expect.objectContaining({ nome: 'Unidade 1' }));
  });

  it('mostra a mensagem de lista vazia', async () => {
    responderLista(0);
    renderizar();

    expect(await screen.findByText('Nenhuma unidade encontrada.')).toBeInTheDocument();
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
  });

  it('mostra o erro com "Tentar novamente"', async () => {
    servidorMsw.use(http.get(URL_LISTA, () => HttpResponse.json({}, { status: 500 })));
    renderizar();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível carregar os dados.',
    );
    expect(screen.getByRole('button', { name: 'Tentar novamente' })).toBeInTheDocument();
  });
});

describe('DataGrid', () => {
  it('textos do grid no idioma do usuário (issue #205)', async () => {
    aplicarIdioma('en');
    renderizar();

    expect(await screen.findByText('Unidade 1')).toBeInTheDocument();
    expect(screen.getByText('25 row(s) in total.')).toBeInTheDocument();
    expect(screen.getByText('Page 1 of 3')).toBeInTheDocument();
    expect(screen.getByText('Rows per page')).toBeInTheDocument();
    expect(botao('Go to next page')).toBeInTheDocument();
    expect(botao('Columns')).toBeInTheDocument();
    expect(screen.getAllByText('Active').length).toBeGreaterThan(0);
  });

  it('lista as colunas e as linhas da primeira página com o rodapé', async () => {
    renderizar();

    expect(await screen.findByText('Unidade 1')).toBeInTheDocument();
    const cabecalhos = screen.getAllByRole('columnheader').map((th) => th.textContent);
    expect(cabecalhos).toEqual(['Nome', 'Status', 'Empresa']);
    expect(screen.getAllByRole('row')).toHaveLength(11);
    expect(screen.getAllByText('Ativo').length).toBeGreaterThan(0);
    expect(screen.getByText('25 linha(s) no total.')).toBeInTheDocument();
    expect(screen.getByText('Página 1 de 3')).toBeInTheDocument();
    expect(ultimo()).toEqual({ page: '1', pageSize: '10' });
  });

  it('mostra o `resumo` com o meta da consulta', async () => {
    renderizar({ resumo: (meta) => `${meta.total} unidade(s)` });

    expect(await screen.findByText('25 unidade(s)')).toBeInTheDocument();
  });

  it('envia a `consultaFixa` em toda consulta e aceita id pelo índice da linha', async () => {
    const idLinha = vi.fn((_linha: Unidade, indice: number) => `linha-${indice}`);
    renderizar({ consultaFixa: { de: '2026-10-01', ate: '2026-10-31' }, idLinha });

    expect(await screen.findByText('Unidade 1')).toBeInTheDocument();
    expect(ultimo()).toEqual({ page: '1', pageSize: '10', de: '2026-10-01', ate: '2026-10-31' });
    expect(idLinha).toHaveBeenCalledWith(expect.objectContaining({ nome: 'Unidade 2' }), 1);
  });

  it('refaz a consulta sozinha quando recebe `atualizacaoMs`', async () => {
    renderizar({ atualizacaoMs: 50 });
    await screen.findByText('Unidade 1');

    await waitFor(() => expect(pedidos[URL_LISTA]?.length).toBeGreaterThanOrEqual(3));
  });

  it('sem `atualizacaoMs` consulta uma vez só', async () => {
    renderizar();
    await screen.findByText('Unidade 1');
    await new Promise((resolver) => setTimeout(resolver, 150));

    expect(pedidos[URL_LISTA]).toHaveLength(1);
  });

  it('ordena pelo cabeçalho: asc, desc e volta ao padrão', async () => {
    const { user, router } = renderizar();
    await screen.findByText('Unidade 1');
    const nome = () => screen.getByRole('columnheader', { name: /Nome/ });
    expect(
      within(screen.getByRole('columnheader', { name: 'Empresa' })).queryByRole('button'),
    ).toBeNull();

    await user.click(within(nome()).getByRole('button'));
    await waitFor(() => expect(ultimo().sort).toBe('nome:asc'));
    expect(nome()).toHaveAttribute('aria-sort', 'ascending');

    await user.click(within(nome()).getByRole('button'));
    await waitFor(() => expect(ultimo().sort).toBe('nome:desc'));
    expect(nome()).toHaveAttribute('aria-sort', 'descending');
    expect(router.state.location.search).toBe('?sort=nome%3Adesc');

    await user.click(within(nome()).getByRole('button'));
    await waitFor(() => expect(router.state.location.search).toBe(''));
    expect(nome()).toHaveAttribute('aria-sort', 'none');
  });

  it('pagina no servidor e troca o tamanho da página', async () => {
    const { user } = renderizar();
    await screen.findByText('Unidade 1');
    expect(botao('Ir para primeira página')).toHaveAttribute('aria-disabled', 'true');
    expect(botao('Ir para página anterior')).toHaveAttribute('aria-disabled', 'true');

    await user.click(botao('Ir para próxima página'));
    expect(await screen.findByText('Unidade 11')).toBeInTheDocument();
    expect(ultimo().page).toBe('2');

    await user.click(botao('Ir para última página'));
    expect(await screen.findByText('Unidade 21')).toBeInTheDocument();
    expect(screen.getByText('Página 3 de 3')).toBeInTheDocument();
    const proxima = botao('Ir para próxima página');
    expect(proxima).toHaveAttribute('aria-disabled', 'true');
    // Desabilitado sem perder o foco: o clique não muda de página.
    await user.click(proxima);
    expect(proxima).toHaveFocus();
    expect(ultimo().page).toBe('3');

    await user.click(botao('Ir para página anterior'));
    await waitFor(() => expect(ultimo().page).toBe('2'));
    await user.click(botao('Ir para primeira página'));
    await waitFor(() => expect(ultimo().page).toBe('1'));

    await user.click(screen.getByRole('combobox', { name: 'Linhas por página' }));
    await user.click(await screen.findByRole('option', { name: '20' }));
    await waitFor(() => expect(ultimo()).toEqual({ page: '1', pageSize: '20' }));
    expect(await screen.findByText('Página 1 de 2')).toBeInTheDocument();
  });

  it('busca com atraso, voltando para a página 1', async () => {
    const { user, router } = renderizar({}, '/lista?page=2');
    await screen.findByText('Unidade 11');

    await user.type(screen.getByRole('searchbox', { name: 'Buscar' }), 'centro');

    await waitFor(() => expect(ultimo()).toEqual({ page: '1', pageSize: '10', search: 'centro' }));
    // Uma consulta só para o texto todo, não uma por tecla.
    expect(pedidos[URL_LISTA]?.filter((p) => p.has('search'))).toHaveLength(1);
    expect(router.state.location.search).toBe('?search=centro');
  });

  it('filtra pelos chips de status, selects e período', async () => {
    const { user } = renderizar({
      filtros: [
        {
          tipo: 'select',
          parametro: 'empresaId',
          rotulo: 'Empresa',
          opcoes: [{ valor: EMPRESA, rotulo: 'Matriz' }],
        },
        { tipo: 'periodo', rotulo: 'Criação', parametroDe: 'de', parametroAte: 'ate' },
      ],
      querySchema: undefined,
    });
    await screen.findByText('Unidade 1');
    const chips = screen.getByRole('group', { name: 'Filtrar por status' });

    await user.click(within(chips).getByRole('button', { name: 'Inativo' }));
    await waitFor(() => expect(ultimo().status).toBe('inativo'));
    expect(within(chips).getByRole('button', { name: 'Inativo' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await user.click(screen.getByRole('combobox', { name: 'Empresa' }));
    await user.click(await screen.findByRole('option', { name: 'Matriz' }));
    await waitFor(() => expect(ultimo().empresaId).toBe(EMPRESA));

    const periodo = screen.getByRole('group', { name: 'Criação' });
    await user.type(within(periodo).getByLabelText('Criação de:'), '2026-10-01');
    await user.type(within(periodo).getByLabelText('até:'), '2026-10-31');
    await waitFor(() =>
      expect(ultimo()).toMatchObject({
        status: 'inativo',
        empresaId: EMPRESA,
        de: '2026-10-01',
        ate: '2026-10-31',
      }),
    );

    await user.click(within(periodo).getByRole('button', { name: 'Limpar Criação' }));
    await user.click(within(chips).getByRole('button', { name: 'Todos' }));
    await user.click(screen.getByRole('combobox', { name: 'Empresa' }));
    await user.click(await screen.findByRole('option', { name: 'Todos' }));
    await waitFor(() => expect(ultimo()).toEqual({ page: '1', pageSize: '10' }));
  });

  it('filtra por entidade (combobox com busca), checkbox e select com rótulo próprio', async () => {
    const PRODUTO = '9b2d3c52-8d0f-4b8e-9f4c-2b2f3c4d5e6f';
    servidorMsw.use(
      http.get('/api/lookups/produtos', () =>
        HttpResponse.json({
          data: [{ id: PRODUTO, label: 'Luva', descricao: null }],
          meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
        }),
      ),
      http.get('/api/lookups/produtos/:id', () =>
        HttpResponse.json({ id: PRODUTO, label: 'Luva', descricao: null }),
      ),
    );
    const { user, router } = renderizar({
      filtros: [
        {
          tipo: 'entidade',
          parametro: 'produtoId',
          rotulo: 'Produto',
          entidade: 'produtos',
          rotuloTodos: 'Todos os produtos',
        },
        { tipo: 'checkbox', parametro: 'comSaldo', rotulo: 'Apenas com saldo' },
        {
          tipo: 'select',
          parametro: 'empresaId',
          rotulo: 'Empresa',
          rotuloTodos: 'Todas as empresas',
          opcoes: [{ valor: EMPRESA, rotulo: 'Matriz' }],
        },
      ],
      querySchema: undefined,
    });
    await screen.findByText('Unidade 1');
    const produto = screen.getByRole('combobox', { name: 'Produto' });
    expect(produto).toHaveTextContent('Todos os produtos');
    expect(screen.getByRole('combobox', { name: 'Empresa' })).toHaveTextContent(
      'Todas as empresas',
    );

    await user.click(produto);
    await user.click(await screen.findByRole('option', { name: /Luva/ }));
    await waitFor(() => expect(ultimo().produtoId).toBe(PRODUTO));

    await user.click(screen.getByRole('checkbox', { name: 'Apenas com saldo' }));
    await waitFor(() => expect(ultimo()).toMatchObject({ produtoId: PRODUTO, comSaldo: 'true' }));
    expect(router.state.location.search).toContain('comSaldo=true');

    await user.click(screen.getByRole('checkbox', { name: 'Apenas com saldo' }));
    await user.click(screen.getByRole('combobox', { name: 'Produto' }));
    await user.click(await screen.findByRole('option', { name: 'Limpar seleção' }));
    await waitFor(() => expect(ultimo()).toEqual({ page: '1', pageSize: '10' }));
  });

  it('filtro de texto: parâmetro próprio, com atraso, junto com a busca e restaurado da URL', async () => {
    const { user, router } = renderizar(
      {
        filtros: [
          { tipo: 'texto', parametro: 'nome', rotulo: 'Nome', placeholder: 'Buscar nome...' },
        ],
        querySchema: undefined,
      },
      '/lista?search=centro',
    );
    await screen.findByText('Unidade 1');
    const nome = screen.getByRole('searchbox', { name: 'Nome' });
    expect(nome).toHaveAttribute('placeholder', 'Buscar nome...');

    await user.type(nome, 'matriz');

    await waitFor(() =>
      expect(ultimo()).toEqual({ page: '1', pageSize: '10', search: 'centro', nome: 'matriz' }),
    );
    expect(pedidos[URL_LISTA]?.filter((p) => p.has('nome'))).toHaveLength(1);
    expect(router.state.location.search).toContain('nome=matriz');

    await user.clear(nome);
    await waitFor(() => expect(ultimo()).toEqual({ page: '1', pageSize: '10', search: 'centro' }));
  });

  it('restaura o checkbox marcado a partir da URL', async () => {
    renderizar(
      {
        filtros: [{ tipo: 'checkbox', parametro: 'comSaldo', rotulo: 'Apenas com saldo' }],
        querySchema: undefined,
      },
      '/lista?comSaldo=true',
    );
    await screen.findByText('Unidade 1');
    expect(screen.getByRole('checkbox', { name: 'Apenas com saldo' })).toBeChecked();
    expect(ultimo().comSaldo).toBe('true');
  });

  it('restaura o estado da URL e descarta parâmetros fora do schema', async () => {
    renderizar({}, '/lista?page=2&pageSize=20&sort=ativo:desc&status=ativo&search=x&pageSize=abc');
    await screen.findByText('Unidade 21');
    expect(ultimo()).toEqual({
      page: '2',
      pageSize: '20',
      sort: 'ativo:desc',
      status: 'ativo',
      search: 'x',
    });
    expect(screen.getByRole('searchbox')).toHaveValue('x');
    expect(screen.getByRole('button', { name: 'Ativo' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('troca o texto do chip "Todos" por `rotuloTodos`', async () => {
    renderizar({
      status: { rotuloTodos: 'Todas', opcoes: [{ valor: 'ativo', rotulo: 'Ativo' }] },
    });
    await screen.findByText('Unidade 1');
    expect(botao('Todas')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('button', { name: 'Todos' })).not.toBeInTheDocument();
  });

  it('ignora ordenação fora da whitelist e tamanho de página inválido', async () => {
    renderizar({}, '/lista?sort=empresaId:asc&pageSize=7&page=0');
    await screen.findByText('Unidade 1');
    expect(ultimo()).toEqual({ page: '1', pageSize: '10' });
  });

  it('mostra e oculta colunas pelo botão "Colunas"', async () => {
    const { user } = renderizar({ acoes: () => [] });
    await screen.findByText('Unidade 1');

    await user.click(botao('Colunas'));
    const menu = await screen.findByRole('menu');
    expect(
      within(menu)
        .getAllByRole('menuitemcheckbox')
        .map((item) => item.textContent),
    ).toEqual(['Nome', 'Status', 'Criado em']);
    await user.click(within(menu).getByRole('menuitemcheckbox', { name: 'Criado em' }));
    await user.click(within(menu).getByRole('menuitemcheckbox', { name: 'Status' }));
    await user.keyboard('{Escape}');

    const cabecalhos = screen.getAllByRole('columnheader').map((th) => th.textContent);
    expect(cabecalhos).toEqual(['Nome', 'Criado em', 'Empresa', 'Ações']);
    expect(screen.getAllByText('2026-10-01T12:00:00.000Z').length).toBe(10);
  });

  describe('exportação', () => {
    const urlOriginal = { create: URL.createObjectURL, revoke: URL.revokeObjectURL };

    afterEach(() => {
      URL.createObjectURL = urlOriginal.create;
      URL.revokeObjectURL = urlOriginal.revoke;
    });

    it('exporta com os filtros, a ordenação e as colunas visíveis', async () => {
      URL.createObjectURL = vi.fn(() => 'blob:1');
      URL.revokeObjectURL = vi.fn();
      const clique = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
      servidorMsw.use(
        http.get(`${URL_LISTA}/export`, ({ request }) => {
          (pedidos.export ??= []).push(new URL(request.url).searchParams);
          return new HttpResponse('xlsx', {
            headers: { 'Content-Disposition': 'attachment; filename="unidades.xlsx"' },
          });
        }),
      );
      const { user } = renderizar({}, '/lista?page=2&sort=nome:asc&status=ativo&search=centro');
      await screen.findByText('Unidade 11');

      await user.click(botao('Exportar'));
      await user.click(await screen.findByRole('menuitem', { name: 'Excel' }));

      await waitFor(() => expect(clique).toHaveBeenCalledOnce());
      expect(ultimo('export')).toEqual({
        sort: 'nome:asc',
        status: 'ativo',
        search: 'centro',
        format: 'xlsx',
        columns: 'nome,status',
      });
      expect((clique.mock.contexts[0] as HTMLAnchorElement).download).toBe('unidades.xlsx');
    });

    it('exporta em CSV com os mesmos filtros da listagem', async () => {
      URL.createObjectURL = vi.fn(() => 'blob:1');
      URL.revokeObjectURL = vi.fn();
      vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
      servidorMsw.use(
        http.get(`${URL_LISTA}/export`, ({ request }) => {
          (pedidos.export ??= []).push(new URL(request.url).searchParams);
          return new HttpResponse('csv', {
            headers: { 'Content-Disposition': 'attachment; filename="unidades.csv"' },
          });
        }),
      );
      const { user } = renderizar({}, '/lista?page=2&sort=nome:asc&status=ativo&search=centro');
      await screen.findByText('Unidade 11');

      await user.click(botao('Exportar'));
      await user.click(await screen.findByRole('menuitem', { name: 'CSV' }));

      await waitFor(() =>
        expect(ultimo('export')).toMatchObject({ format: 'csv', search: 'centro' }),
      );
    });

    it('não envia exportação inválida para o schema', async () => {
      const { user } = renderizar({
        colunas: [{ id: 'empresaId', titulo: 'Empresa', exportavel: true }],
      });
      await screen.findAllByText(EMPRESA);

      await user.click(botao('Exportar'));
      await user.click(await screen.findByRole('menuitem', { name: 'PDF' }));

      // Sem handler de exportação: com `onUnhandledRequest: 'error'`, uma chamada falharia o teste.
      await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
      expect(pedidos.export).toBeUndefined();
    });

    it('esconde o "Exportar" sem a permissão', async () => {
      sessao.permissoes = [];
      renderizar();
      await screen.findByText('Unidade 1');
      expect(screen.queryByRole('button', { name: 'Exportar' })).not.toBeInTheDocument();
      expect(botao('Colunas')).toBeInTheDocument();
    });
  });

  it('ação desabilitada aparece no menu e não dispara', async () => {
    const movimentar = vi.fn();
    const { user } = renderizar({
      acoes: () => [{ rotulo: 'Movimentar', onSelect: movimentar, desabilitada: true }],
    });

    await screen.findByText('Unidade 1');
    await user.click(screen.getAllByRole('button', { name: /ações/i })[0] as HTMLElement);
    const item = await screen.findByRole('menuitem', { name: 'Movimentar' });
    expect(item).toHaveAttribute('aria-disabled', 'true');
    await user.click(item);

    expect(movimentar).not.toHaveBeenCalled();
  });

  it('aoClicarLinha: clique ou Enter na linha, sem disparar pelo menu de ações', async () => {
    const abrir = vi.fn();
    const editar = vi.fn();
    const { user } = renderizar({
      aoClicarLinha: abrir,
      acoes: () => [{ rotulo: 'Editar', onSelect: editar }],
    });

    await user.click(await screen.findByText('Unidade 1'));
    expect(abrir).toHaveBeenCalledTimes(1);
    expect(abrir).toHaveBeenLastCalledWith(expect.objectContaining({ nome: 'Unidade 1' }));

    const linha = screen.getByText('Unidade 2').closest('tr') as HTMLElement;
    linha.focus();
    await user.keyboard('{Enter}');
    expect(abrir).toHaveBeenCalledTimes(2);

    await user.click(screen.getAllByRole('button', { name: /ações/i })[0] as HTMLElement);
    await user.click(await screen.findByRole('menuitem', { name: 'Editar' }));
    expect(editar).toHaveBeenCalledTimes(1);
    expect(abrir).toHaveBeenCalledTimes(2);
  });

  it('ações por linha respeitam a permissão', async () => {
    sessao.permissoes = ['configuracoes-gestao.minha-empresa.editar'] satisfies Permissao[];
    const editar = vi.fn();
    const { user } = renderizar({
      acoes: (u) => [
        {
          rotulo: 'Editar',
          onSelect: () => editar(u.nome),
          permissao: 'configuracoes-gestao.minha-empresa.editar',
        },
        {
          rotulo: 'Excluir',
          onSelect: vi.fn(),
          destrutiva: true,
          permissao: 'configuracoes-gestao.minha-empresa.excluir',
        },
      ],
    });
    await screen.findByText('Unidade 1');

    const linha = screen.getByRole('row', { name: /Unidade 2 / });
    await user.click(within(linha).getByRole('button', { name: 'Ações' }));
    const menu = await screen.findByRole('menu');
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((item) => item.textContent),
    ).toEqual(['Editar']);
    await user.keyboard('{ArrowDown}{Enter}');
    expect(editar).toHaveBeenCalledWith('Unidade 2');
  });

  it('esconde o menu de ações quando nenhuma é permitida', async () => {
    sessao.permissoes = [];
    renderizar({
      acoes: () => [
        {
          rotulo: 'Excluir',
          onSelect: vi.fn(),
          permissao: 'configuracoes-gestao.minha-empresa.excluir',
        },
      ],
    });
    await screen.findByText('Unidade 1');
    expect(screen.queryByRole('button', { name: 'Ações' })).not.toBeInTheDocument();
  });

  it('mostra o estado vazio com a mensagem da tela', async () => {
    responderLista(0);
    renderizar({ busca: false, status: undefined });

    expect(await screen.findByRole('status')).toHaveTextContent('Nenhuma unidade encontrada.');
    expect(screen.getByText('Página 1 de 0')).toBeInTheDocument();
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
  });

  it('mostra o erro e tenta de novo', async () => {
    let falhar = true;
    servidorMsw.use(
      http.get(URL_LISTA, () =>
        falhar
          ? HttpResponse.json({ statusCode: 500, code: 'X', message: 'Erro' }, { status: 500 })
          : undefined,
      ),
    );
    const { user } = renderizar();

    const alerta = await screen.findByRole('alert');
    expect(alerta).toHaveTextContent('Não foi possível carregar os dados.');
    falhar = false;
    await user.click(within(alerta).getByRole('button', { name: 'Tentar novamente' }));
    expect(await screen.findByText('Unidade 1')).toBeInTheDocument();
  });
});
