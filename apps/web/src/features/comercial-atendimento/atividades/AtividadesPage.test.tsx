import { PERMISSOES, type Atividade } from '@torres/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { apiFalsa, chamadasPara, json, renderApp, USUARIO_TESTE } from '@/test/render-app';
import { partesDataHora } from './partes-data-hora';

vi.setConfig({ testTimeout: 20_000 });

const API = '/api/comercial-atendimento/atividades';
const LOOKUP = '/api/lookups/negocios';
const A1 = '00000000-0000-4000-8000-0000000000f1';
const A2 = '00000000-0000-4000-8000-0000000000f2';
const A3 = '00000000-0000-4000-8000-0000000000f3';
const N1 = '00000000-0000-4000-8000-0000000000c1';

function atividade(parcial: Partial<Atividade> = {}): Atividade {
  return {
    id: A1,
    negocioId: N1,
    negocio: 'Sala 10 - Clínica geral',
    negocioStatus: 'ABERTO',
    tipo: 'LIGACAO',
    titulo: 'Ligar para o lead',
    descricao: 'Perguntar sobre a sala',
    dataHora: '2026-11-20T12:00:00.000Z',
    responsavelId: USUARIO_TESTE.id,
    responsavel: 'Bia Responsável',
    status: 'PENDENTE',
    exigeProximaAcao: false,
    concluidaEm: null,
    canceladaEm: null,
    createdAt: '2026-11-01T12:00:00.000Z',
    ...parcial,
  };
}

const ATIVIDADES = [
  atividade(),
  atividade({
    id: A2,
    titulo: 'Enviar tabela',
    tipo: 'EMAIL',
    negocioId: null,
    negocio: null,
    descricao: null,
    responsavel: null,
    status: 'CONCLUIDA',
  }),
  atividade({ id: A3, titulo: 'Última do negócio', exigeProximaAcao: true }),
];

const RESUMO = { total: 7, pendentes: 4, concluidas: 2, canceladas: 1 };

function pagina(data: Atividade[]) {
  return json({ data, meta: { page: 1, pageSize: 10, total: data.length, totalPages: 1 } });
}

type Corpo = Record<string, unknown>;
type Escrita = { metodo: string; caminho: string; corpo: Corpo | undefined };
const params = (url: string) => Object.fromEntries(new URL(url, 'http://x').searchParams);

function api(opcoes: Parameters<typeof apiFalsa>[0] = {}) {
  const escritas: Escrita[] = [];
  const escrever = (caminho: string, resposta: unknown) => (init?: RequestInit) => {
    escritas.push({
      metodo: init?.method ?? 'GET',
      caminho,
      corpo: init?.body ? (JSON.parse(String(init.body)) as Corpo) : undefined,
    });
    return json(resposta, init?.method === 'POST' ? 201 : 200);
  };
  const fetchMock = apiFalsa({
    ...opcoes,
    rotas: {
      [API]: (init) =>
        init?.method === 'POST' ? escrever(API, atividade())(init) : pagina(ATIVIDADES),
      [`${API}/resumo`]: () => json(RESUMO),
      [`${API}/responsaveis`]: () => json([{ id: USUARIO_TESTE.id, nome: 'Bia Responsável' }]),
      [LOOKUP]: () =>
        json({
          data: [{ id: N1, label: 'Sala 10 - Clínica geral', descricao: 'Contato inicial' }],
          meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
        }),
      [`${LOOKUP}/${N1}`]: () =>
        json({ id: N1, label: 'Sala 10 - Clínica geral', descricao: 'Contato inicial' }),
      ...Object.fromEntries(
        [A1, A2, A3].flatMap((id) => [
          [`${API}/${id}`, escrever(`${API}/${id}`, atividade({ id }))],
          [`${API}/${id}/concluir`, escrever(`${API}/${id}/concluir`, atividade({ id }))],
          [`${API}/${id}/cancelar`, escrever(`${API}/${id}/cancelar`, atividade({ id }))],
        ]),
      ),
      ...opcoes.rotas,
    },
  });
  return { fetchMock, escritas };
}

function renderTela(opcoes?: Parameters<typeof api>[0], caminho = '/atividades') {
  const { fetchMock, escritas } = api(opcoes);
  return { user: userEvent.setup(), escritas, ...renderApp(caminho, fetchMock), fetchMock };
}

async function abrirAcao(user: ReturnType<typeof userEvent.setup>, titulo: string, acao: string) {
  const linha = (await screen.findByText(titulo)).closest('tr')!;
  await user.click(within(linha).getByRole('button', { name: 'Ações' }));
  await user.click(await screen.findByRole('menuitem', { name: acao }));
}

describe('Atividades (/atividades)', () => {
  it('mostra título, cartões e a grid com as colunas do inventário', async () => {
    renderTela();

    expect(await screen.findByRole('heading', { name: 'Atividades' })).toBeInTheDocument();
    expect(screen.getByText('Tarefas, ligações e follow-ups')).toBeVisible();
    const resumo = await screen.findByTestId('resumo-atividades');
    await waitFor(() => expect(within(resumo).getByText('7')).toBeVisible());
    for (const [rotulo, valor] of [
      ['Total', '7'],
      ['Pendentes', '4'],
      ['Concluídas', '2'],
      ['Canceladas', '1'],
    ] as const) {
      expect(within(resumo).getByText(rotulo).closest('div.rounded-lg')).toHaveTextContent(
        `${rotulo}${valor}`,
      );
    }

    const cabecalhos = within(await screen.findByRole('table')).getAllByRole('columnheader');
    expect(cabecalhos.map((c) => c.textContent)).toEqual([
      'Título',
      'Tipo',
      'Negócio',
      'Data Agendamento',
      'Status',
      'Ações',
    ]);
    const linha = (await screen.findByText('Ligar para o lead')).closest('tr');
    expect(linha).toHaveTextContent('Ligação');
    expect(linha).toHaveTextContent('Sala 10 - Clínica geral');
    expect(linha).toHaveTextContent('20/11/2026');
    expect(linha).toHaveTextContent('Pendente');
    const avulsa = screen.getByText('Enviar tabela').closest('tr');
    expect(avulsa).toHaveTextContent('E-mail');
    expect(avulsa).toHaveTextContent('Concluída');
    expect(screen.getByRole('button', { name: 'Nova Atividade' })).toBeVisible();
  });

  it('tem busca, filtros de tipo e status, Colunas e Exportar', async () => {
    renderTela();
    await screen.findByText('Ligar para o lead');

    expect(screen.getByPlaceholderText('Buscar atividades...')).toBeVisible();
    expect(screen.getByText('Todos os tipos')).toBeInTheDocument();
    expect(screen.getByText('Todos os status')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Colunas/ })).toBeVisible();
    expect(screen.getByRole('button', { name: /Exportar/ })).toBeVisible();
  });

  it('filtros e resumo vêm da URL; ordenação chama a API', async () => {
    const { user, fetchMock } = renderTela(undefined, '/atividades?tipo=EMAIL&status=CONCLUIDA');
    await screen.findByText('Enviar tabela');

    expect(params(chamadasPara(fetchMock, API).at(-1)?.[0] ?? '')).toMatchObject({
      page: '1',
      pageSize: '10',
      tipo: 'EMAIL',
      status: 'CONCLUIDA',
    });
    await waitFor(() =>
      expect(params(chamadasPara(fetchMock, `${API}/resumo`).at(-1)?.[0] ?? '')).toEqual({
        tipo: 'EMAIL',
      }),
    );

    await user.click(screen.getByRole('button', { name: 'Data Agendamento' }));
    await waitFor(() =>
      expect(params(chamadasPara(fetchMock, API).at(-1)?.[0] ?? '')).toMatchObject({
        sort: 'dataHora:asc',
      }),
    );
  });

  it('Nova Atividade: campos do inventário e mensagens dos obrigatórios', async () => {
    const { user, escritas } = renderTela();
    await screen.findByText('Ligar para o lead');

    await user.click(screen.getByRole('button', { name: 'Nova Atividade' }));
    const modal = await screen.findByRole('dialog', { name: 'Nova Atividade' });
    for (const rotulo of [/Título/, /Tipo/, /Negócio/, /Data Agendamento/, /Hora/, /Descrição/]) {
      expect(within(modal).getAllByText(rotulo).length).toBeGreaterThan(0);
    }
    expect(within(modal).getByRole('combobox', { name: 'Tipo' })).toHaveTextContent('Tarefa');
    await user.click(within(modal).getByRole('button', { name: 'Criar Atividade' }));

    expect(await within(modal).findByText('Título é obrigatório.')).toBeVisible();
    expect(within(modal).getByText('Data é obrigatória.')).toBeVisible();
    expect(within(modal).getByText('Hora é obrigatória.')).toBeVisible();
    expect(escritas).toEqual([]);
  });

  it('Nova Atividade: envia o formulário, fecha e recarrega', async () => {
    const { user, escritas, fetchMock } = renderTela();
    await screen.findByText('Ligar para o lead');

    await user.click(screen.getByRole('button', { name: 'Nova Atividade' }));
    const modal = await screen.findByRole('dialog', { name: 'Nova Atividade' });
    await user.type(within(modal).getByRole('textbox', { name: /Título/ }), 'Reunião');
    await user.type(within(modal).getByLabelText(/Data Agendamento/), '2026-12-01');
    await user.type(within(modal).getByLabelText(/Hora/), '1400');
    await user.type(within(modal).getByLabelText(/Descrição/), 'Levar contrato');
    await user.click(within(modal).getByRole('button', { name: 'Criar Atividade' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(escritas).toEqual([
      {
        metodo: 'POST',
        caminho: API,
        corpo: expect.objectContaining({
          titulo: 'Reunião',
          tipo: 'TAREFA',
          data: '2026-12-01',
          hora: '14:00',
          negocioId: null,
          descricao: 'Levar contrato',
        }),
      },
    ]);
    await waitFor(() =>
      expect(
        chamadasPara(fetchMock, API).filter(([, i]) => !i?.method || i.method === 'GET'),
      ).toHaveLength(2),
    );
  });

  it('Editar: abre com os dados da atividade e envia PATCH', async () => {
    const { user, escritas } = renderTela();
    await abrirAcao(user, 'Ligar para o lead', 'Editar');
    const modal = await screen.findByRole('dialog', { name: 'Editar Atividade' });
    const titulo = within(modal).getByRole('textbox', { name: /Título/ });
    expect(titulo).toHaveValue('Ligar para o lead');
    expect(within(modal).getByLabelText(/Descrição/)).toHaveValue('Perguntar sobre a sala');
    const { data, hora } = partesDataHora('2026-11-20T12:00:00.000Z');
    expect(within(modal).getByLabelText(/Data Agendamento/)).toHaveValue(data);
    expect(within(modal).getByLabelText(/Hora/)).toHaveValue(hora);
    expect(await within(modal).findByText('Sala 10 - Clínica geral')).toBeInTheDocument();

    await user.clear(titulo);
    await user.type(titulo, 'Editada');
    await user.click(within(modal).getByRole('button', { name: 'Salvar' }));
    await waitFor(() =>
      expect(escritas.at(-1)).toMatchObject({
        metodo: 'PATCH',
        caminho: `${API}/${A1}`,
        corpo: { titulo: 'Editada', negocioId: N1, tipo: 'LIGACAO' },
      }),
    );
  });

  it('Concluir envia direto; Cancelar pede confirmação; concluída não tem essas ações', async () => {
    const { user, escritas } = renderTela();
    await abrirAcao(user, 'Ligar para o lead', 'Concluir');
    await waitFor(() =>
      expect(escritas.at(-1)).toMatchObject({ metodo: 'PATCH', caminho: `${API}/${A1}/concluir` }),
    );

    await abrirAcao(user, 'Ligar para o lead', 'Cancelar');
    const dialogo = await screen.findByRole('alertdialog', { name: 'Cancelar Atividade' });
    expect(dialogo).toHaveTextContent(
      'Tem certeza que deseja cancelar a atividade "Ligar para o lead"?',
    );
    await user.click(within(dialogo).getByRole('button', { name: 'Confirmar' }));
    await waitFor(() =>
      expect(escritas.at(-1)).toMatchObject({ caminho: `${API}/${A1}/cancelar` }),
    );

    const concluida = screen.getByText('Enviar tabela').closest('tr')!;
    await user.click(within(concluida).getByRole('button', { name: 'Ações' }));
    expect(await screen.findByRole('menuitem', { name: 'Editar' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Concluir' })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Cancelar' })).not.toBeInTheDocument();
  });

  it('última pendente do negócio: agenda a próxima e então conclui', async () => {
    const { user, escritas } = renderTela();
    await abrirAcao(user, 'Última do negócio', 'Concluir');
    const modal = await screen.findByRole('dialog', { name: 'Agendar próxima atividade' });
    expect(modal).toHaveTextContent('é a última atividade pendente do negócio');
    expect(escritas).toEqual([]);

    await user.type(within(modal).getByRole('textbox', { name: /Título/ }), 'Visita');
    await user.type(within(modal).getByLabelText(/Data Agendamento/), '2026-12-02');
    await user.type(within(modal).getByLabelText(/Hora/), '1000');
    await user.click(within(modal).getByRole('button', { name: 'Agendar e concluir' }));

    await waitFor(() =>
      expect(escritas.map((e) => [e.metodo, e.caminho])).toEqual([
        ['POST', API],
        ['PATCH', `${API}/${A3}/concluir`],
      ]),
    );
    expect(escritas[0]?.corpo).toMatchObject({ titulo: 'Visita', negocioId: N1 });
  });

  it('Excluir: confirma antes e envia DELETE', async () => {
    const { user, escritas } = renderTela();
    await abrirAcao(user, 'Ligar para o lead', 'Excluir');
    const dialogo = await screen.findByRole('alertdialog', { name: 'Excluir Atividade' });
    expect(dialogo).toHaveTextContent(
      'Tem certeza que deseja excluir a atividade "Ligar para o lead"? Esta ação não pode ser desfeita.',
    );
    await user.click(within(dialogo).getByRole('button', { name: 'Confirmar' }));
    await waitFor(() =>
      expect(escritas.at(-1)).toMatchObject({ metodo: 'DELETE', caminho: `${API}/${A1}` }),
    );
  });

  it('só com "ver", esconde Nova Atividade, ações e Exportar', async () => {
    const somenteVer = PERMISSOES.filter((p) => p === 'comercial-atendimento.atividades.ver');
    renderTela({ usuario: { ...USUARIO_TESTE, permissoes: somenteVer } });

    await screen.findByText('Ligar para o lead');
    expect(screen.queryByRole('button', { name: 'Nova Atividade' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ações' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Exportar/ })).not.toBeInTheDocument();
  });
});
