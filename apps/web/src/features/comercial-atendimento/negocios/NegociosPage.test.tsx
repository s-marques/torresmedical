import { PERMISSOES, type Negocio, type Pipeline } from '@torres/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { apiFalsa, chamadasPara, json, renderApp, USUARIO_TESTE } from '@/test/render-app';

vi.setConfig({ testTimeout: 20_000 });

const API = '/api/comercial-atendimento/negocios';
const P1 = '00000000-0000-4000-8000-0000000000a1';
const P2 = '00000000-0000-4000-8000-0000000000a2';
const E1 = '00000000-0000-4000-8000-0000000000b1';
const E2 = '00000000-0000-4000-8000-0000000000b2';
const E3 = '00000000-0000-4000-8000-0000000000b3';
const N1 = '00000000-0000-4000-8000-0000000000c1';
const N2 = '00000000-0000-4000-8000-0000000000c2';
const MOTIVO = '00000000-0000-4000-8000-0000000000d1';

const estagio = (id: string, pipelineId: string, nome: string, ordem: number) => ({
  id,
  pipelineId,
  nome,
  cor: '#3b82f6',
  marco: null,
  ordem,
  quantidade: 0,
});

const PIPELINES: Pipeline[] = [
  {
    id: P1,
    nome: 'Pipeline Torres',
    ordem: 1,
    estagios: [estagio(E1, P1, 'Contato inicial', 1), estagio(E2, P1, 'Proposta', 2)],
  },
  { id: P2, nome: 'VENDAS DE LOCAÇÕES', ordem: 2, estagios: [estagio(E3, P2, 'Em decisão', 1)] },
];

function negocio(parcial: Partial<Negocio> = {}): Negocio {
  return {
    id: N1,
    pipelineId: P1,
    estagioId: E1,
    titulo: 'Sala 10 - Clínica geral',
    estagio: 'Contato inicial',
    valor: '1160',
    contatoTipo: 'PACIENTE',
    contatoId: '00000000-0000-4000-8000-000000000099',
    contato: 'Ana Teste',
    responsavelId: USUARIO_TESTE.id,
    responsavel: 'Bia Responsável',
    previsaoFechamento: '2026-12-31',
    origemClienteId: null,
    origem: 'Instagram',
    status: 'ABERTO',
    motivoPerdaId: null,
    motivoPerda: null,
    observacoes: 'Ligar na segunda',
    fechadoEm: null,
    marcos: {},
    proximaAtividade: null,
    situacaoAcao: 'SEM_ACAO',
    createdAt: '2026-11-01T12:00:00.000Z',
    ...parcial,
  };
}

const NEGOCIOS = [
  negocio(),
  negocio({
    id: N2,
    titulo: 'Loja 04',
    valor: null,
    contato: null,
    contatoId: null,
    previsaoFechamento: null,
    origem: null,
    responsavel: null,
    status: 'PERDIDO',
    motivoPerdaId: MOTIVO,
    motivoPerda: 'Preço',
  }),
];

const RESUMO = {
  abertos: { quantidade: 1, total: '1160.00' },
  ganhos: { quantidade: 0, total: '0.00' },
  perdidos: { quantidade: 1, total: '0.00' },
};

function pagina(data: Negocio[]) {
  return json({ data, meta: { page: 1, pageSize: 10, total: data.length, totalPages: 1 } });
}

type Corpo = Record<string, unknown>;
const corpoDe = (init?: RequestInit): Corpo => JSON.parse(String(init?.body)) as Corpo;
const params = (url: string) => Object.fromEntries(new URL(url, 'http://x').searchParams);

function api(rotas: Parameters<typeof apiFalsa>[0] = {}) {
  return apiFalsa({
    ...rotas,
    rotas: {
      [API]: () => pagina(NEGOCIOS),
      [`${API}/resumo`]: () => json(RESUMO),
      [`${API}/pipelines`]: () => json(PIPELINES),
      [`${API}/motivos-perda`]: () =>
        json([{ id: MOTIVO, nome: 'Preço', codigo: 'preco', ordem: 1, quantidade: 0 }]),
      [`${API}/responsaveis`]: () => json([{ id: USUARIO_TESTE.id, nome: 'Bia Responsável' }]),
      ...rotas.rotas,
    },
  });
}

function renderTela(fetchMock = api(), caminho = '/negocios') {
  return { user: userEvent.setup(), ...renderApp(caminho, fetchMock) };
}

describe('Negócios (/negocios)', () => {
  it('mostra o título, os cartões de resumo e a grid com as colunas do inventário', async () => {
    renderTela();

    expect(await screen.findByRole('heading', { name: 'Negócios' })).toBeInTheDocument();
    expect(screen.getByText('Pipeline de vendas e oportunidades')).toBeVisible();
    const resumo = await screen.findByTestId('resumo-negocios');
    await waitFor(() => expect(within(resumo).getByText('Total de Negócios')).toBeVisible());
    expect(within(resumo).getByText('Valor Total')).toBeVisible();
    expect(within(resumo).getByText('Ganhos')).toBeVisible();
    expect(within(resumo).getByText('Perdidos')).toBeVisible();
    await waitFor(() => expect(within(resumo).getByText('2')).toBeVisible());

    const cabecalhos = within(await screen.findByRole('table')).getAllByRole('columnheader');
    expect(cabecalhos.map((c) => c.textContent)).toEqual([
      'Título',
      'Cliente',
      'Estágio',
      'Valor (R$)',
      'Previsão Fechamento',
      'Status',
      'Origem',
      'Motivo Perda',
      'Responsável',
      'Ações',
    ]);
    const linha = (await screen.findByText('Sala 10 - Clínica geral')).closest('tr');
    expect(linha).toHaveTextContent('Ana Teste');
    expect(linha).toHaveTextContent('Contato inicial');
    expect(linha).toHaveTextContent('31/12/2026');
    expect(linha).toHaveTextContent('Aberto');
    expect(linha).toHaveTextContent('Instagram');
    expect(linha).toHaveTextContent('Bia Responsável');
    expect(screen.getByText('Loja 04').closest('tr')).toHaveTextContent('Perdido');
    expect(screen.getByText('Loja 04').closest('tr')).toHaveTextContent('Preço');
    expect(screen.getByRole('button', { name: 'Novo Negócio' })).toBeVisible();
  });

  it('tem busca, chips de status, filtro de pipeline, Colunas e Exportar', async () => {
    renderTela();
    await screen.findByText('Sala 10 - Clínica geral');

    expect(screen.getByPlaceholderText('Buscar negócios...')).toBeVisible();
    const chips = within(screen.getByRole('group', { name: 'Filtrar por status' }));
    expect(chips.getAllByRole('button').map((b) => b.textContent)).toEqual([
      'Todos',
      'Aberto',
      'Ganho',
      'Perdido',
    ]);
    expect(screen.getByText('Todos os Pipelines')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Colunas/ })).toBeVisible();
    expect(screen.getByRole('button', { name: /Exportar/ })).toBeVisible();
  });

  it('chip de status, ordenação e paginação chamam a API com os parâmetros', async () => {
    const fetchMock = api();
    const { user } = renderTela(fetchMock);
    await screen.findByText('Sala 10 - Clínica geral');

    expect(params(chamadasPara(fetchMock, API)[0]?.[0] ?? '')).toMatchObject({
      page: '1',
      pageSize: '10',
    });

    await user.click(screen.getByRole('button', { name: 'Ganho' }));
    await waitFor(() =>
      expect(params(chamadasPara(fetchMock, API).at(-1)?.[0] ?? '')).toMatchObject({
        status: 'GANHO',
      }),
    );

    await user.click(screen.getByRole('button', { name: 'Cliente' }));
    await waitFor(() =>
      expect(params(chamadasPara(fetchMock, API).at(-1)?.[0] ?? '')).toMatchObject({
        sort: 'cliente:asc',
      }),
    );
  });

  it('o resumo acompanha o pipeline escolhido na URL', async () => {
    const fetchMock = api();
    renderTela(fetchMock, `/negocios?pipelineId=${P2}&search=loja`);
    await screen.findByText('Loja 04');

    await waitFor(() =>
      expect(params(chamadasPara(fetchMock, `${API}/resumo`).at(-1)?.[0] ?? '')).toMatchObject({
        pipelineId: P2,
        search: 'loja',
      }),
    );
    expect(params(chamadasPara(fetchMock, API).at(-1)?.[0] ?? '')).toMatchObject({
      pipelineId: P2,
      search: 'loja',
    });
  });

  it('Novo Negócio: só o título é obrigatório e mostra a mensagem padrão', async () => {
    const fetchMock = api();
    const { user } = renderTela(fetchMock);
    await screen.findByText('Sala 10 - Clínica geral');

    await user.click(screen.getByRole('button', { name: 'Novo Negócio' }));
    const modal = await screen.findByRole('dialog', { name: 'Novo Negócio' });
    for (const rotulo of [
      /Título/,
      /Valor/,
      /Cliente/,
      /Pipeline/,
      /Estágio/,
      /Responsável/,
      /Previsão de Fechamento/,
      /Status/,
      /Origem/,
      /Observações/,
    ]) {
      expect(within(modal).getAllByText(rotulo).length).toBeGreaterThan(0);
    }
    await user.click(within(modal).getByRole('button', { name: 'Criar Negócio' }));

    expect(await within(modal).findByText('Título é obrigatório.')).toBeVisible();
    expect(chamadasPara(fetchMock, API).filter(([, i]) => i?.method === 'POST')).toHaveLength(0);
  });

  it('Novo Negócio: salva só com o título, fecha o modal e recarrega a lista', async () => {
    let corpo: Corpo = {};
    const fetchMock = api({
      rotas: {
        [API]: (init) => {
          if (init?.method !== 'POST') return pagina(NEGOCIOS);
          corpo = corpoDe(init);
          return json(negocio({ titulo: 'Novo' }), 201);
        },
      },
    });
    const { user } = renderTela(fetchMock);
    await screen.findByText('Sala 10 - Clínica geral');

    await user.click(screen.getByRole('button', { name: 'Novo Negócio' }));
    const modal = await screen.findByRole('dialog', { name: 'Novo Negócio' });
    await user.type(within(modal).getByLabelText(/Título/), 'Novo');
    await user.type(within(modal).getByLabelText(/Observações/), 'Teste');
    await user.click(within(modal).getByRole('button', { name: 'Criar Negócio' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(corpo).toMatchObject({ titulo: 'Novo', observacoes: 'Teste', status: 'ABERTO' });
    expect(
      chamadasPara(fetchMock, API).filter(([, i]) => !i?.method || i.method === 'GET'),
    ).toHaveLength(2);
  });

  it('Editar: abre com os dados do negócio e envia PATCH', async () => {
    let corpo: Corpo = {};
    const { user } = renderTela(
      api({
        rotas: {
          [`${API}/${N1}`]: (init) => {
            corpo = corpoDe(init);
            return json(negocio({ titulo: 'Editado' }));
          },
        },
      }),
    );
    await screen.findByText('Sala 10 - Clínica geral');

    await user.click(
      within(screen.getByText('Sala 10 - Clínica geral').closest('tr')!).getByRole('button', {
        name: 'Ações',
      }),
    );
    await user.click(await screen.findByRole('menuitem', { name: 'Editar' }));
    const modal = await screen.findByRole('dialog', { name: 'Editar Negócio' });
    const titulo = within(modal).getByLabelText(/Título/);
    expect(titulo).toHaveValue('Sala 10 - Clínica geral');
    expect(within(modal).getByLabelText(/Observações/)).toHaveValue('Ligar na segunda');
    await user.clear(titulo);
    await user.type(titulo, 'Editado');
    await user.click(within(modal).getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(corpo).toMatchObject({
      titulo: 'Editado',
      pipelineId: P1,
      estagioId: E1,
      status: 'ABERTO',
    });
  });

  it('Excluir: confirma antes e envia DELETE; Cancelar não exclui', async () => {
    let excluidos = 0;
    const { user } = renderTela(
      api({
        rotas: {
          [`${API}/${N1}`]: () => {
            excluidos += 1;
            return json(negocio());
          },
        },
      }),
    );
    await screen.findByText('Sala 10 - Clínica geral');
    const abrirMenu = async () => {
      const linha = screen.getByText('Sala 10 - Clínica geral').closest('tr')!;
      await user.click(within(linha).getByRole('button', { name: 'Ações' }));
      await user.click(await screen.findByRole('menuitem', { name: 'Excluir' }));
    };

    await abrirMenu();
    const dialogo = await screen.findByRole('alertdialog', { name: 'Excluir Negócio' });
    expect(dialogo).toHaveTextContent(
      'Tem certeza que deseja excluir o negócio "Sala 10 - Clínica geral"? Esta ação não pode ser desfeita.',
    );
    await user.click(within(dialogo).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(excluidos).toBe(0);

    await abrirMenu();
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Confirmar' }),
    );
    await waitFor(() => expect(excluidos).toBe(1));
  });

  it('sem permissão de criar, editar e excluir, esconde os botões e o menu de ações', async () => {
    const somenteVer = PERMISSOES.filter((p) => p === 'comercial-atendimento.negocios.ver');
    renderTela(api({ usuario: { ...USUARIO_TESTE, permissoes: somenteVer } }));

    await screen.findByText('Sala 10 - Clínica geral');

    expect(screen.queryByRole('button', { name: 'Novo Negócio' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ações' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Exportar/ })).not.toBeInTheDocument();
  });
});
