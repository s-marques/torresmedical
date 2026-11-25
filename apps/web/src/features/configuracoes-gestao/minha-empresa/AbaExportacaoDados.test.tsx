import { PREFERENCIAS_PADRAO, type ExportacaoLote } from '@torres/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFalsa, chamadasPara, json, renderApp, USUARIO_TESTE } from '@/test/render-app';

const URL_LOTE = '/api/configuracoes-gestao/exportacoes-lote';

const ENTIDADES = [
  { id: 'pacientes', rotulo: 'Pacientes', comArquivos: false },
  { id: 'prontuarios', rotulo: 'Prontuários (com anexos)', comArquivos: true },
];

function exportacao(parcial: Partial<ExportacaoLote> = {}): ExportacaoLote {
  return {
    id: '00000000-0000-4000-8000-0000000000e1',
    entidade: 'pacientes',
    incluirArquivos: false,
    status: 'CONCLUIDA',
    solicitadoPorId: USUARIO_TESTE.id,
    solicitadaEm: '2026-11-25T10:00:00.000Z',
    concluidaEm: '2026-11-25T10:01:00.000Z',
    expiraEm: '2026-11-26T10:01:00.000Z',
    tamanhoBytes: 2048,
    erroCodigo: null,
    disponivel: true,
    ...parcial,
  };
}

function api(itens: ExportacaoLote[] = [exportacao()], usuario = USUARIO_TESTE) {
  return apiFalsa({
    usuario,
    rotas: {
      '/api/configuracoes-gestao/minha-empresa': () =>
        json({
          id: '00000000-0000-4000-8000-0000000000aa',
          nome: 'Empresa Teste',
          documento: '12345678000190',
          email: null,
          telefone: null,
          logoArquivoId: null,
          updatedAt: '2026-11-25T10:00:00.000Z',
        }),
      [`${URL_LOTE}/entidades`]: () => json(ENTIDADES),
      [URL_LOTE]: (init) =>
        init?.method === 'POST'
          ? json(exportacao({ status: 'PENDENTE', disponivel: false, expiraEm: null }), 202)
          : json({
              data: itens,
              meta: { page: 1, pageSize: 10, total: itens.length, totalPages: 1 },
            }),
      [`${URL_LOTE}/${exportacao().id}/download`]: () =>
        new Response('zip', {
          headers: { 'Content-Disposition': 'attachment; filename="exportacao.zip"' },
        }),
    },
  });
}

async function abrirAba(nome = 'Exportação de dados') {
  await userEvent.click(await screen.findByRole('tab', { name: nome }));
}

describe('Minha Empresa: aba Exportação de dados (issue #158)', { timeout: 20_000 }, () => {
  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => 'blob:1');
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it('lista as exportações com situação, tamanho e validade', async () => {
    renderApp('/settings/empresa', api());
    await abrirAba();

    expect(await screen.findByRole('cell', { name: 'Pacientes' })).toBeInTheDocument();
    const tabela = screen.getByRole('table');
    expect(within(tabela).getByText('Pronta')).toBeInTheDocument();
    expect(within(tabela).getByText('2.0 KB')).toBeInTheDocument();
  });

  it('pede a exportação da entidade escolhida e oferece arquivos só quando existem', async () => {
    const fetchMock = api();
    renderApp('/settings/empresa', fetchMock);
    await abrirAba();

    expect(screen.queryByLabelText('Incluir os arquivos (anexos e PDFs)')).not.toBeInTheDocument();
    await userEvent.click(await screen.findByRole('combobox', { name: 'O que exportar' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Prontuários (com anexos)' }));
    const arquivos = await screen.findByLabelText('Incluir os arquivos (anexos e PDFs)');
    expect(arquivos).toBeChecked();
    await userEvent.click(arquivos);
    await userEvent.click(screen.getByRole('button', { name: 'Solicitar exportação' }));

    expect(await screen.findByText(/Exportação solicitada/)).toBeInTheDocument();
    const post = chamadasPara(fetchMock, URL_LOTE).find(([, init]) => init?.method === 'POST');
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({
      entidade: 'prontuarios',
      incluirArquivos: false,
    });
  });

  it('só habilita "Solicitar exportação" com a entidade escolhida', async () => {
    renderApp('/settings/empresa', api());
    await abrirAba();

    expect(await screen.findByRole('button', { name: 'Solicitar exportação' })).toBeDisabled();
  });

  it('baixa o ZIP pronto pelo menu da linha', async () => {
    const fetchMock = api();
    renderApp('/settings/empresa', fetchMock);
    await abrirAba();

    await userEvent.click(await screen.findByRole('button', { name: 'Ações' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Baixar ZIP' }));

    await waitFor(() =>
      expect(chamadasPara(fetchMock, `${URL_LOTE}/${exportacao().id}/download`)).toHaveLength(1),
    );
  });

  it('mostra o código de erro traduzido e não oferece download de exportação falha ou expirada', async () => {
    renderApp(
      '/settings/empresa',
      api([
        exportacao({
          id: '00000000-0000-4000-8000-0000000000e2',
          status: 'FALHOU',
          disponivel: false,
          erroCodigo: 'ARQUIVOS_ACIMA_DO_LIMITE',
          expiraEm: null,
          tamanhoBytes: null,
        }),
        exportacao({
          id: '00000000-0000-4000-8000-0000000000e3',
          disponivel: false,
          expiraEm: '2026-11-24T10:00:00.000Z',
        }),
      ]),
    );
    await abrirAba();

    expect(await screen.findByText(/passam do limite de um ZIP/)).toBeInTheDocument();
    expect(screen.getByText('Expirada')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ações' })).not.toBeInTheDocument();
  });

  it('sem a permissão de ver, a aba não aparece', async () => {
    const usuario = {
      ...USUARIO_TESTE,
      permissoes: USUARIO_TESTE.permissoes.filter(
        (p) => p !== 'configuracoes-gestao.exportacao-lote.ver',
      ),
    };
    renderApp('/settings/empresa', api([exportacao()], usuario));

    await screen.findByRole('tab', { name: 'Dados' });

    expect(screen.queryByRole('tab', { name: 'Exportação de dados' })).not.toBeInTheDocument();
  });

  it('sem a permissão de executar, só o histórico aparece', async () => {
    const usuario = {
      ...USUARIO_TESTE,
      permissoes: USUARIO_TESTE.permissoes.filter(
        (p) => p !== 'configuracoes-gestao.exportacao-lote.executar',
      ),
    };
    renderApp('/settings/empresa', api([exportacao()], usuario));
    await abrirAba();

    expect(await screen.findByRole('cell', { name: 'Pacientes' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Solicitar exportação' })).not.toBeInTheDocument();
  });

  it('em inglês: aba, formulário e situação traduzidos', async () => {
    const usuario = {
      ...USUARIO_TESTE,
      preferencias: { ...PREFERENCIAS_PADRAO, idioma: 'en' as const },
    };
    renderApp('/settings/empresa', api([exportacao()], usuario));

    await abrirAba('Data export');

    const painel = await screen.findByRole('tabpanel', { name: 'Data export' });
    expect(await within(painel).findByText('Full data export')).toBeInTheDocument();
    expect(within(painel).getByRole('button', { name: 'Request export' })).toBeInTheDocument();
    expect(await within(within(painel).getByRole('table')).findByText('Ready')).toBeInTheDocument();
    expect(within(painel).getByRole('cell', { name: 'Patients' })).toBeInTheDocument();
  });
});
