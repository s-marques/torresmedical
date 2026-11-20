import {
  PERMISSOES,
  PREFERENCIAS_PADRAO,
  type AtendimentoMedicoItem,
  type SoroterapiaChecklist,
  type SoroterapiaPacote,
} from '@torres/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { apiFalsa, chamadasPara, json, renderApp, USUARIO_TESTE } from '@/test/render-app';

const BASE = '/api/consultorio-assistencial/soroterapia';
const FILA = `${BASE}/fila-dia`;
const PACOTES = `${BASE}/pacotes`;
const EM_ANDAMENTO = `${BASE}/em-andamento`;
const HISTORICO = `${BASE}/historico`;
const ID_1 = '00000000-0000-4000-8000-0000000000a1';
const ID_2 = '00000000-0000-4000-8000-0000000000a2';
const PACIENTE = '00000000-0000-4000-8000-0000000000b1';
const MEDICO = '00000000-0000-4000-8000-0000000000c1';

function checklist(parcial: Partial<SoroterapiaChecklist>): SoroterapiaChecklist {
  return {
    id: ID_1,
    data: '2026-11-10T13:00:00.000Z',
    pacienteId: PACIENTE,
    pacienteNome: 'Paciente Alfa',
    profissionalId: MEDICO,
    profissionalNome: 'Dra. Teste Beta',
    protocolo: 'Protocolo Imunidade',
    sinaisVitaisInicio: 'PA 120x80',
    status: 'EM_ANDAMENTO',
    duracaoMinutos: null,
    ...parcial,
  };
}

const EM_CURSO = [checklist({}), checklist({ id: ID_2, sinaisVitaisInicio: null })];
const ENCERRADOS = [
  checklist({ id: ID_1, status: 'FINALIZADO', duracaoMinutos: 45 }),
  checklist({ id: ID_2, status: 'SUSPENSO', protocolo: 'Protocolo Hidratacao' }),
];

const AGENDAMENTO: AtendimentoMedicoItem = {
  id: ID_1,
  inicio: '2026-11-19T15:30:00.000Z',
  pacienteId: PACIENTE,
  pacienteNome: 'Paciente Gama',
  profissionalId: MEDICO,
  profissionalNome: 'Dr. Teste Delta',
  procedimento: 'Soro Vitaminico',
  status: 'CONFIRMADO',
  pago: false,
};

const PACOTE: SoroterapiaPacote = {
  id: ID_1,
  orcamentoId: ID_2,
  orcamentoNumero: 12,
  pacienteId: PACIENTE,
  pacienteNome: 'Paciente Epsilon',
  protocolo: 'Protocolo Detox',
  quantidade: 4,
};

function pagina(data: SoroterapiaChecklist[]) {
  return json({ data, meta: { page: 1, pageSize: 10, total: data.length, totalPages: 1 } });
}

function api(rotas: Parameters<typeof apiFalsa>[0] = {}) {
  return apiFalsa({
    ...rotas,
    rotas: {
      [FILA]: () => json([]),
      [PACOTES]: () => json([]),
      [EM_ANDAMENTO]: () => pagina(EM_CURSO),
      [HISTORICO]: () => pagina(ENCERRADOS),
      ...rotas.rotas,
    },
  });
}

function parametros(fetchMock: ReturnType<typeof apiFalsa>, caminho: string) {
  const [url] = chamadasPara(fetchMock, caminho).at(-1) ?? [''];
  return Object.fromEntries(new URL(url, 'http://x').searchParams);
}

function renderTela(caminho = '/soroterapia', fetchMock = api()) {
  return { user: userEvent.setup(), ...renderApp(caminho, fetchMock) };
}

const cabecalhos = () =>
  within(screen.getByRole('table'))
    .getAllByRole('columnheader')
    .map((c) => c.textContent);

describe('Soroterapia (/soroterapia)', { timeout: 20_000 }, () => {
  it('mostra título, subtítulo e as quatro abas, com a Fila do Dia aberta e vazia', async () => {
    renderTela();

    expect(await screen.findByRole('heading', { name: 'Soroterapia' })).toBeInTheDocument();
    expect(screen.getByText('Checklists de infusao e soroterapia.')).toBeVisible();
    expect(screen.getAllByRole('tab').map((aba) => aba.textContent)).toEqual([
      'Fila do Dia',
      'Pacotes',
      'Em Andamento',
      'Historico',
    ]);
    expect(screen.getByRole('tab', { name: 'Fila do Dia' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(await screen.findByText('Nenhum agendamento de soroterapia para hoje.')).toBeVisible();
  });

  it('Fila do Dia lista os agendamentos com horário, paciente, profissional e status', async () => {
    renderTela('/soroterapia', api({ rotas: { [FILA]: () => json([AGENDAMENTO]) } }));

    const lista = await screen.findByRole('list', { name: 'Agendamentos de soroterapia de hoje' });
    expect(within(lista).getByText('Paciente Gama')).toBeVisible();
    expect(within(lista).getByText('Dr. Teste Delta — Soro Vitaminico')).toBeVisible();
    expect(within(lista).getByText('Confirmado')).toBeVisible();
    expect(within(lista).getByText(/^\d{2}:\d{2}$/)).toBeVisible();
  });

  it('Pacotes mostra o estado vazio com a dica e, havendo dados, a lista', async () => {
    const { user } = renderTela();
    await user.click(await screen.findByRole('tab', { name: 'Pacotes' }));

    expect(await screen.findByText('Nenhum pacote de protocolo aprovado.')).toBeVisible();
    expect(screen.getByText('Crie orçamentos com protocolo no atendimento médico.')).toBeVisible();
  });

  it('Pacotes lista os protocolos de orçamentos aprovados', async () => {
    renderTela('/soroterapia?aba=pacotes', api({ rotas: { [PACOTES]: () => json([PACOTE]) } }));

    const lista = await screen.findByRole('list', { name: 'Pacotes de protocolo aprovados' });
    expect(within(lista).getByText('Protocolo Detox')).toBeVisible();
    expect(within(lista).getByText(/Paciente Epsilon — Orçamento #12/)).toBeVisible();
    expect(within(lista).getByText('Qtd: 4')).toBeVisible();
  });

  it('Em Andamento mostra a grid com as colunas do inventário, busca, Exportar e Colunas', async () => {
    const { user, fetchMock } = renderTela('/soroterapia?aba=em-andamento');

    expect(await screen.findAllByText('Paciente Alfa')).toHaveLength(2);
    expect(cabecalhos()).toEqual([
      'Data',
      'Paciente',
      'Profissional',
      'Protocolo',
      'Sinais Vitais Inicio',
      'Status',
      'Duracao',
    ]);
    expect(screen.getByPlaceholderText('Buscar por paciente ou protocolo...')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Exportar' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Colunas' })).toBeVisible();
    expect(screen.queryByRole('group', { name: 'Filtrar por status' })).not.toBeInTheDocument();

    const primeira = screen.getAllByText('Paciente Alfa')[0]?.closest('tr') as HTMLElement;
    expect(within(primeira).getByText('PA 120x80')).toBeVisible();
    expect(within(primeira).getByText('Em andamento')).toBeVisible();
    expect(within(primeira).getByText('Dra. Teste Beta')).toBeVisible();
    // Sem fim, a duração e os sinais vitais ausentes aparecem como "-".
    expect(within(primeira).getByText('-')).toBeVisible();
    expect(parametros(fetchMock, EM_ANDAMENTO)).toMatchObject({ page: '1', pageSize: '10' });

    await user.type(screen.getByPlaceholderText('Buscar por paciente ou protocolo...'), 'imuni');
    await waitFor(() =>
      expect(parametros(fetchMock, EM_ANDAMENTO)).toMatchObject({ search: 'imuni' }),
    );
  });

  it('ordena pelas colunas do inventário; Sinais Vitais Inicio e Duracao não ordenam', async () => {
    const { user, fetchMock } = renderTela('/soroterapia?aba=em-andamento');
    await screen.findAllByText('Paciente Alfa');

    const colunas = {
      Data: 'data',
      Paciente: 'paciente',
      Profissional: 'profissional',
      Protocolo: 'protocolo',
      Status: 'status',
    };
    for (const [titulo, campo] of Object.entries(colunas)) {
      await user.click(screen.getByRole('button', { name: titulo }));
      await waitFor(() =>
        expect(parametros(fetchMock, EM_ANDAMENTO).sort).toMatch(new RegExp(`^${campo}:`)),
      );
    }
    expect(screen.queryByRole('button', { name: 'Duracao' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sinais Vitais Inicio' })).not.toBeInTheDocument();
  });

  it('Em Andamento pagina pela API', async () => {
    const fetchMock = api({
      rotas: {
        [EM_ANDAMENTO]: () =>
          json({ data: EM_CURSO, meta: { page: 1, pageSize: 10, total: 25, totalPages: 3 } }),
      },
    });
    const { user } = renderTela('/soroterapia?aba=em-andamento', fetchMock);
    await screen.findAllByText('Paciente Alfa');

    await user.click(screen.getByRole('button', { name: 'Ir para próxima página' }));

    await waitFor(() => expect(parametros(fetchMock, EM_ANDAMENTO)).toMatchObject({ page: '2' }));
  });

  it('Em Andamento mostra o estado vazio', async () => {
    renderTela(
      '/soroterapia?aba=em-andamento',
      api({ rotas: { [EM_ANDAMENTO]: () => pagina([]) } }),
    );

    expect(await screen.findByText('Nenhum checklist encontrado.')).toBeVisible();
  });

  it('Historico tem os chips Todos, Finalizado e Suspenso e filtra pela API', async () => {
    const { user, fetchMock } = renderTela('/soroterapia');
    await user.click(await screen.findByRole('tab', { name: 'Historico' }));

    expect(await screen.findByText('Protocolo Hidratacao')).toBeVisible();
    const chips = screen.getByRole('group', { name: 'Filtrar por status' });
    expect(
      within(chips)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Todos', 'Finalizado', 'Suspenso']);
    const finalizado = screen.getByText('45 min').closest('tr') as HTMLElement;
    expect(within(finalizado).getByText('Finalizado')).toBeVisible();

    await user.click(within(chips).getByRole('button', { name: 'Suspenso' }));
    await waitFor(() =>
      expect(parametros(fetchMock, HISTORICO)).toMatchObject({ status: 'SUSPENSO' }),
    );
    await user.click(within(chips).getByRole('button', { name: 'Todos' }));
    // "Todos" já está em cache (primeira consulta, sem status): o chip volta, sem filtro na URL.
    await waitFor(() =>
      expect(within(chips).getByRole('button', { name: 'Todos' })).toHaveAttribute(
        'aria-pressed',
        'true',
      ),
    );
    expect(within(chips).getByRole('button', { name: 'Suspenso' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(chamadasPara(fetchMock, HISTORICO)[0]?.[0]).not.toContain('status=');
  });

  it('a aba escolhida fica na URL e ao trocá-la a Fila do Dia volta sem parâmetro', async () => {
    const { user, router } = renderTela();
    await user.click(await screen.findByRole('tab', { name: 'Em Andamento' }));
    await waitFor(() => expect(router.state.location.search).toBe('?aba=em-andamento'));

    await user.click(screen.getByRole('tab', { name: 'Fila do Dia' }));
    await waitFor(() => expect(router.state.location.search).toBe(''));
  });

  it('sem a permissão de exportar, esconde o botão Exportar', async () => {
    const somenteVer = PERMISSOES.filter(
      (p) => p !== 'consultorio-assistencial.soroterapia.exportar',
    );
    renderTela(
      '/soroterapia?aba=em-andamento',
      api({ usuario: { ...USUARIO_TESTE, permissoes: somenteVer } }),
    );

    await screen.findAllByText('Paciente Alfa');
    expect(screen.queryByRole('button', { name: 'Exportar' })).not.toBeInTheDocument();
  });

  it('em inglês: título, abas, colunas, estados vazios e chips traduzidos', async () => {
    const usuario = {
      ...USUARIO_TESTE,
      preferencias: { ...PREFERENCIAS_PADRAO, idioma: 'en' as const },
    };
    const { user } = renderTela('/soroterapia', api({ usuario }));

    expect(await screen.findByRole('heading', { name: 'Serotherapy' })).toBeInTheDocument();
    expect(screen.getAllByRole('tab').map((aba) => aba.textContent)).toEqual([
      "Today's Queue",
      'Packages',
      'In Progress',
      'History',
    ]);
    expect(await screen.findByText('No serotherapy appointments for today.')).toBeVisible();

    await user.click(screen.getByRole('tab', { name: 'History' }));
    await screen.findByText('Protocolo Hidratacao');
    expect(cabecalhos()).toEqual([
      'Date',
      'Patient',
      'Professional',
      'Protocol',
      'Vital Signs at Start',
      'Status',
      'Duration',
    ]);
    expect(screen.getByPlaceholderText('Search by patient or protocol...')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Suspended' })).toBeVisible();
  });
});
