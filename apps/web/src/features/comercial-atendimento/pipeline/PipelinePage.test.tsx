import { PERMISSOES, type Negocio, type Pipeline, type Quadro } from '@torres/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { apiFalsa, chamadasPara, json, renderApp, USUARIO_TESTE } from '@/test/render-app';

vi.setConfig({ testTimeout: 20_000 });

const API = '/api/comercial-atendimento/pipeline';
const P1 = '00000000-0000-4000-8000-0000000000a1';
const P2 = '00000000-0000-4000-8000-0000000000a2';
const E1 = '00000000-0000-4000-8000-0000000000b1';
const E2 = '00000000-0000-4000-8000-0000000000b2';
const N1 = '00000000-0000-4000-8000-0000000000c1';
const N2 = '00000000-0000-4000-8000-0000000000c2';
const N3 = '00000000-0000-4000-8000-0000000000c3';
const ATIVIDADE = '00000000-0000-4000-8000-0000000000d1';
const MOTIVO = '00000000-0000-4000-8000-0000000000e1';
const USUARIO = '00000000-0000-4000-8000-0000000000f1';

const PIPELINES: Pipeline[] = [
  {
    id: P1,
    nome: 'Pipeline Torres',
    ordem: 1,
    estagios: [
      {
        id: E1,
        pipelineId: P1,
        nome: 'Contato inicial',
        cor: '#3b82f6',
        marco: 'PRIMEIRO_CONTATO',
        ordem: 1,
        quantidade: 3,
      },
      {
        id: E2,
        pipelineId: P1,
        nome: 'Proposta',
        cor: '#84cc16',
        marco: 'PROPOSTA',
        ordem: 2,
        quantidade: 0,
      },
    ],
  },
  { id: P2, nome: 'VENDAS DE LOCAÇÕES', ordem: 2, estagios: [] },
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
    responsavelId: USUARIO,
    responsavel: 'Bia Responsável',
    previsaoFechamento: null,
    origemClienteId: null,
    origem: null,
    status: 'ABERTO',
    motivoPerdaId: null,
    motivoPerda: null,
    observacoes: null,
    fechadoEm: null,
    marcos: {},
    proximaAtividade: {
      id: ATIVIDADE,
      negocioId: N1,
      tipo: 'FOLLOW_UP',
      titulo: 'Ligar',
      descricao: null,
      dataHora: '2099-01-10T12:00:00.000Z',
      responsavelId: USUARIO,
      responsavel: 'Bia Responsável',
      status: 'PENDENTE',
      exigeProximaAcao: false,
    },
    situacaoAcao: 'EM_DIA',
    createdAt: '2026-11-01T12:00:00.000Z',
    ...parcial,
  };
}

const QUADRO: Quadro = {
  pipelineId: P1,
  colunas: [
    {
      estagioId: E1,
      nome: 'Contato inicial',
      cor: '#3b82f6',
      quantidade: 3,
      total: '3160.00',
      negocios: [
        negocio(),
        negocio({
          id: N2,
          titulo: 'Sala 08',
          valor: '1000',
          proximaAtividade: null,
          situacaoAcao: 'SEM_ACAO',
        }),
        negocio({
          id: N3,
          titulo: 'Loja 04',
          valor: '1000',
          situacaoAcao: 'ATRASADA',
          proximaAtividade: {
            ...negocio().proximaAtividade!,
            negocioId: N3,
            dataHora: '2020-01-10T12:00:00.000Z',
            exigeProximaAcao: true,
          },
        }),
      ],
    },
    { estagioId: E2, nome: 'Proposta', cor: '#84cc16', quantidade: 0, total: '0.00', negocios: [] },
  ],
  resumo: {
    abertos: { quantidade: 3, total: '3160.00' },
    ganhos: { quantidade: 14, total: '22030.00' },
    perdidos: { quantidade: 64, total: '167266.16' },
  },
};

type Escrita = { metodo: string; caminho: string; corpo: unknown };

function api({ usuario = USUARIO_TESTE } = {}) {
  const escritas: Escrita[] = [];
  const escrever = (caminho: string, resposta: unknown) => (init?: RequestInit) => {
    escritas.push({
      metodo: init?.method ?? 'GET',
      caminho,
      corpo: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
    return json(resposta, init?.method === 'POST' ? 201 : 200);
  };
  const rotaNegocio = (id: string) => escrever(`${API}/negocios/${id}`, negocio({ id }));
  const fetchMock = apiFalsa({
    usuario,
    rotas: {
      [`${API}/pipelines`]: (init) =>
        init?.method === 'POST'
          ? escrever(`${API}/pipelines`, { ...PIPELINES[1], id: P2 })(init)
          : json(PIPELINES),
      [`${API}/quadro`]: () => json(QUADRO),
      [`${API}/motivos-perda`]: (init) =>
        init?.method === 'POST'
          ? escrever(`${API}/motivos-perda`, {
              id: MOTIVO,
              nome: 'Prazo',
              codigo: 'prazo',
              ordem: 2,
            })(init)
          : json([{ id: MOTIVO, nome: 'Preço', codigo: 'preco', ordem: 1 }]),
      [`${API}/motivos-perda/${MOTIVO}`]: escrever(`${API}/motivos-perda/${MOTIVO}`, {
        id: MOTIVO,
        nome: 'Preço',
        codigo: 'preco',
        ordem: 1,
      }),
      [`${API}/responsaveis`]: () => json([{ id: USUARIO, nome: 'Bia Responsável' }]),
      [`${API}/negocios`]: escrever(`${API}/negocios`, negocio()),
      [`${API}/negocios/${N1}`]: rotaNegocio(N1),
      [`${API}/negocios/${N1}/mover`]: escrever(`${API}/negocios/${N1}/mover`, negocio()),
      [`${API}/negocios/${N1}/ganho`]: escrever(`${API}/negocios/${N1}/ganho`, negocio()),
      [`${API}/negocios/${N1}/perdido`]: escrever(`${API}/negocios/${N1}/perdido`, negocio()),
      [`${API}/negocios/${N1}/atividades`]: escrever(
        `${API}/negocios/${N1}/atividades`,
        negocio().proximaAtividade,
      ),
      [`${API}/negocios/${N3}/atividades`]: escrever(
        `${API}/negocios/${N3}/atividades`,
        negocio().proximaAtividade,
      ),
      [`${API}/atividades/${ATIVIDADE}/concluir`]: escrever(
        `${API}/atividades/${ATIVIDADE}/concluir`,
        negocio().proximaAtividade,
      ),
      [`${API}/pipelines/${P1}/estagios`]: escrever(
        `${API}/pipelines/${P1}/estagios`,
        PIPELINES[0]!.estagios[0],
      ),
      '/api/comercial-atendimento/origens-cliente': () =>
        json({
          data: [
            {
              id: '00000000-0000-4000-8000-0000000000aa',
              nome: 'Instagram',
              codigo: 'instagram',
              ordem: 1,
              ativa: true,
              createdAt: '2026-11-01T12:00:00.000Z',
              updatedAt: '2026-11-01T12:00:00.000Z',
            },
          ],
          meta: { page: 1, pageSize: 100, total: 1, totalPages: 1 },
        }),
    },
  });
  return { fetchMock, escritas };
}

function renderTela(opcoes?: Parameters<typeof api>[0]) {
  const { fetchMock, escritas } = api(opcoes);
  return { user: userEvent.setup(), escritas, ...renderApp('/crm', fetchMock) };
}

const parametrosQuadro = (fetchMock: ReturnType<typeof apiFalsa>) =>
  chamadasPara(fetchMock, `${API}/quadro`).map(
    ([url]) => Object.fromEntries(new URL(url, 'http://x').searchParams) as Record<string, string>,
  );

async function abrirMenu(user: ReturnType<typeof userEvent.setup>, titulo: string) {
  await user.click(await screen.findByRole('button', { name: `Ações de ${titulo}` }));
}

describe('Pipeline (/crm)', () => {
  it('mostra cabeçalho, ações, colunas, cartões e totais', async () => {
    renderTela();
    expect(await screen.findByRole('heading', { name: 'CRM — Pipeline' })).toBeInTheDocument();
    expect(screen.getByText('Gerencie seus negócios e oportunidades.')).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText('Buscar cliente (nome, tel, CPF, CNPJ)...'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Configurar/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Novo Negócio/ })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Pipeline Torres' })).toBeInTheDocument();

    const contato = await screen.findByRole('region', { name: 'Contato inicial' });
    expect(within(contato).getByText('R$ 3.160,00')).toBeInTheDocument();
    expect(within(contato).getByText('Sala 10 - Clínica geral')).toBeInTheDocument();
    expect(within(contato).getAllByText('Bia Responsável').length).toBeGreaterThan(0);
    expect(within(contato).getAllByText('Ana Teste').length).toBe(3);
    expect(
      within(screen.getByRole('region', { name: 'Proposta' })).getByText('Nenhum negócio'),
    ).toBeInTheDocument();

    expect(screen.getByTestId('resumo-pipeline')).toHaveTextContent(
      'Total: R$ 3.160,00 · 3 abertos · 14 ganhos · 64 perdidos',
    );
    expect(screen.getByText('R$ 22.030,00')).toBeInTheDocument();
    expect(screen.getByText('R$ 167.266,16')).toBeInTheDocument();
  });

  it('destaca cartão sem próxima ação ou atrasado', async () => {
    renderTela();
    const semAcao = await screen.findByRole('article', { name: 'Sala 08' });
    expect(semAcao).toHaveAttribute('data-situacao', 'SEM_ACAO');
    expect(within(semAcao).getByText('Sem próxima ação')).toBeInTheDocument();
    const atrasado = screen.getByRole('article', { name: 'Loja 04' });
    expect(within(atrasado).getByText('Atrasado')).toBeInTheDocument();
    const emDia = screen.getByRole('article', { name: 'Sala 10 - Clínica geral' });
    expect(within(emDia).queryByText(/Atrasado|Sem próxima ação/)).not.toBeInTheDocument();
  });

  it('busca e troca de pipeline consultam o quadro com os parâmetros', async () => {
    const { user, fetchMock } = renderTela();
    await screen.findByRole('region', { name: 'Contato inicial' });
    expect(parametrosQuadro(fetchMock).at(-1)).toEqual({ pipelineId: P1 });

    await user.type(screen.getByRole('searchbox', { name: 'Buscar cliente' }), 'ana');
    await waitFor(() =>
      expect(parametrosQuadro(fetchMock).at(-1)).toEqual({ pipelineId: P1, search: 'ana' }),
    );

    await user.click(screen.getByRole('button', { name: 'Pipeline Torres' }));
    await user.click(await screen.findByRole('menuitem', { name: 'VENDAS DE LOCAÇÕES' }));
    await waitFor(() => expect(parametrosQuadro(fetchMock).at(-1)?.pipelineId).toBe(P2));
  });

  it('Novo Negócio valida o título e cria no estágio escolhido', async () => {
    const { user, escritas } = renderTela();
    await user.click(await screen.findByRole('button', { name: /Novo Negócio/ }));
    const modal = await screen.findByRole('dialog', { name: 'Novo Negócio' });
    await user.click(within(modal).getByRole('button', { name: 'Criar' }));
    expect(await within(modal).findByText('Título é obrigatório.')).toBeInTheDocument();
    expect(escritas).toEqual([]);

    await user.type(within(modal).getByRole('textbox', { name: /Título/ }), 'Sala 11');
    await user.click(within(modal).getByRole('button', { name: 'Criar' }));
    await waitFor(() => expect(escritas).toHaveLength(1));
    expect(escritas[0]).toMatchObject({
      metodo: 'POST',
      caminho: `${API}/negocios`,
      corpo: { titulo: 'Sala 11', estagioId: E1, contatoTipo: 'PACIENTE', contatoId: null },
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('o "+" da coluna abre o Novo Negócio já no estágio dela', async () => {
    const { user, escritas } = renderTela();
    await user.click(await screen.findByRole('button', { name: 'Novo negócio em Proposta' }));
    const modal = await screen.findByRole('dialog', { name: 'Novo Negócio' });
    expect(within(modal).getByRole('combobox', { name: 'Estágio' })).toHaveTextContent('Proposta');
    await user.type(within(modal).getByRole('textbox', { name: /Título/ }), 'X');
    await user.click(within(modal).getByRole('button', { name: 'Criar' }));
    await waitFor(() => expect(escritas[0]?.corpo).toMatchObject({ estagioId: E2 }));
  });

  it('menu do cartão: mover, ganho e concluir próxima ação', async () => {
    const { user, escritas } = renderTela();
    await abrirMenu(user, 'Sala 10 - Clínica geral');
    expect(
      screen.queryByRole('menuitem', { name: 'Mover → Contato inicial' }),
    ).not.toBeInTheDocument();
    await user.click(await screen.findByRole('menuitem', { name: 'Mover → Proposta' }));
    await waitFor(() =>
      expect(escritas.at(-1)).toEqual({
        metodo: 'PATCH',
        caminho: `${API}/negocios/${N1}/mover`,
        corpo: { estagioId: E2 },
      }),
    );

    await abrirMenu(user, 'Sala 10 - Clínica geral');
    await user.click(await screen.findByRole('menuitem', { name: 'Ganho' }));
    await waitFor(() =>
      expect(escritas.at(-1)).toMatchObject({
        metodo: 'PATCH',
        caminho: `${API}/negocios/${N1}/ganho`,
      }),
    );

    await abrirMenu(user, 'Sala 10 - Clínica geral');
    await user.click(await screen.findByRole('menuitem', { name: 'Concluir próxima ação' }));
    await waitFor(() =>
      expect(escritas.at(-1)).toMatchObject({ caminho: `${API}/atividades/${ATIVIDADE}/concluir` }),
    );
  });

  it('concluir a última ação pede a próxima: agenda e depois conclui', async () => {
    const { user, escritas } = renderTela();
    await abrirMenu(user, 'Loja 04');
    await user.click(await screen.findByRole('menuitem', { name: 'Concluir próxima ação' }));
    const modal = await screen.findByRole('dialog', { name: 'Agendar próxima ação' });
    expect(modal).toHaveTextContent('"Loja 04" ficaria sem próxima ação.');
    expect(escritas).toEqual([]);

    await user.click(within(modal).getByRole('button', { name: 'Agendar e concluir' }));
    expect(await within(modal).findByText('Título é obrigatório.')).toBeInTheDocument();
    expect(escritas).toEqual([]);

    await user.type(within(modal).getByRole('textbox', { name: /Título/ }), 'Enviar proposta');
    await user.type(within(modal).getByLabelText(/Data/), '2026-12-01');
    await user.type(within(modal).getByLabelText(/Hora/), '0930');
    await user.click(within(modal).getByRole('button', { name: 'Agendar e concluir' }));
    await waitFor(() =>
      expect(escritas.map((e) => [e.metodo, e.caminho])).toEqual([
        ['POST', `${API}/negocios/${N3}/atividades`],
        ['PATCH', `${API}/atividades/${ATIVIDADE}/concluir`],
      ]),
    );
    expect(escritas[0]?.corpo).toMatchObject({
      titulo: 'Enviar proposta',
      data: '2026-12-01',
      hora: '09:30',
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('Perdido exige o motivo antes de enviar', async () => {
    const { user, escritas } = renderTela();
    await abrirMenu(user, 'Sala 10 - Clínica geral');
    await user.click(await screen.findByRole('menuitem', { name: 'Perdido' }));
    const modal = await screen.findByRole('dialog', { name: 'Marcar como perdido' });
    await user.click(within(modal).getByRole('button', { name: 'Marcar como perdido' }));
    expect(await within(modal).findByText('Motivo da perda é obrigatório.')).toBeInTheDocument();
    expect(escritas).toEqual([]);

    await user.click(within(modal).getByRole('combobox', { name: /Motivo da perda/ }));
    await user.click(await screen.findByRole('option', { name: 'Preço' }));
    await user.click(within(modal).getByRole('button', { name: 'Marcar como perdido' }));
    await waitFor(() =>
      expect(escritas.at(-1)).toEqual({
        metodo: 'PATCH',
        caminho: `${API}/negocios/${N1}/perdido`,
        corpo: { motivoPerdaId: MOTIVO },
      }),
    );
  });

  it('Agendar Follow-up valida título, data e hora', async () => {
    const { user, escritas } = renderTela();
    await abrirMenu(user, 'Sala 10 - Clínica geral');
    await user.click(await screen.findByRole('menuitem', { name: 'Agendar Follow-up' }));
    const modal = await screen.findByRole('dialog', { name: 'Agendar Follow-up' });
    await user.click(within(modal).getByRole('button', { name: 'Agendar' }));
    expect(await within(modal).findByText('Título é obrigatório.')).toBeInTheDocument();
    expect(within(modal).getByText('Data é obrigatória.')).toBeInTheDocument();
    expect(within(modal).getByText('Hora é obrigatória.')).toBeInTheDocument();
    expect(escritas).toEqual([]);
  });

  it('Excluir pede confirmação', async () => {
    const { user, escritas } = renderTela();
    await abrirMenu(user, 'Sala 10 - Clínica geral');
    await user.click(await screen.findByRole('menuitem', { name: 'Excluir' }));
    const confirmar = await screen.findByRole('alertdialog', { name: 'Excluir negócio?' });
    expect(escritas).toEqual([]);
    await user.click(within(confirmar).getByRole('button', { name: 'Excluir' }));
    await waitFor(() =>
      expect(escritas.at(-1)).toMatchObject({ metodo: 'DELETE', caminho: `${API}/negocios/${N1}` }),
    );
  });

  it('Configurar mostra pipelines, estágios, origens e motivos; adiciona estágio', async () => {
    const { user, escritas } = renderTela();
    await user.click(await screen.findByRole('button', { name: /Configurar/ }));
    const modal = await screen.findByRole('dialog', { name: 'Configurações do CRM' });
    expect(within(modal).getByText('VENDAS DE LOCAÇÕES')).toBeInTheDocument();
    expect(within(modal).getByText('Estágios — Pipeline Torres')).toBeInTheDocument();
    expect(within(modal).getByText('Primeiro contato')).toBeInTheDocument();
    expect(await within(modal).findByText('Instagram')).toBeInTheDocument();
    expect(await within(modal).findByText('preco')).toBeInTheDocument();

    await user.click(within(modal).getAllByRole('button', { name: 'Adicionar' })[0]!);
    expect(await within(modal).findByText('Nome é obrigatório.')).toBeInTheDocument();
    expect(escritas).toEqual([]);

    await user.type(within(modal).getByRole('textbox', { name: 'Nome do estágio' }), 'Contrato');
    await user.selectOptions(
      within(modal).getByRole('combobox', { name: 'Marco do dashboard' }),
      'CONTRATO',
    );
    await user.click(within(modal).getAllByRole('button', { name: 'Adicionar' })[0]!);
    await waitFor(() =>
      expect(escritas.at(-1)).toEqual({
        metodo: 'POST',
        caminho: `${API}/pipelines/${P1}/estagios`,
        corpo: { nome: 'Contrato', cor: '#3b82f6', marco: 'CONTRATO' },
      }),
    );
  });

  it('Configurar: excluir motivo de perda pede confirmação', async () => {
    const { user, escritas } = renderTela();
    await user.click(await screen.findByRole('button', { name: /Configurar/ }));
    const modal = await screen.findByRole('dialog', { name: 'Configurações do CRM' });
    await user.click(await within(modal).findByRole('button', { name: 'Excluir Preço' }));
    const confirmar = await screen.findByRole('alertdialog', { name: 'Excluir motivo?' });
    await user.click(within(confirmar).getByRole('button', { name: 'Excluir' }));
    await waitFor(() =>
      expect(escritas.at(-1)).toMatchObject({
        metodo: 'DELETE',
        caminho: `${API}/motivos-perda/${MOTIVO}`,
      }),
    );
  });

  it('só com permissão de ver: sem Novo Negócio e sem ações de escrita no menu', async () => {
    const somenteVer = PERMISSOES.filter((p) => p === 'comercial-atendimento.pipeline.ver');
    const { user } = renderTela({ usuario: { ...USUARIO_TESTE, permissoes: somenteVer } });
    await screen.findByRole('region', { name: 'Contato inicial' });
    expect(screen.queryByRole('button', { name: /Novo Negócio/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Novo negócio em/ })).not.toBeInTheDocument();
    await abrirMenu(user, 'Sala 10 - Clínica geral');
    expect(await screen.findByRole('menu')).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Editar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Ganho' })).not.toBeInTheDocument();
  });
});
