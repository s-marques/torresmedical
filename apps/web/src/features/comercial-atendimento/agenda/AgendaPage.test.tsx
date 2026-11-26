import type { AgendaProfissional, Agendamento } from '@torres/shared';
import { PERMISSOES, PREFERENCIAS_PADRAO } from '@torres/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { matchMediaStub } from '@/test/match-media';
import { MOTIVO_ID, rotaMotivosCancelamento } from '@/test/motivos-cancelamento';
import { apiFalsa, chamadasPara, json, renderApp, USUARIO_TESTE } from '@/test/render-app';

const API = '/api/comercial-atendimento/agendamentos';
const PROFISSIONAIS = `${API}/profissionais`;
const ID_AG = '00000000-0000-4000-8000-0000000000a1';
const ID_AG_2 = '00000000-0000-4000-8000-0000000000a2';
const ID_PACIENTE = '00000000-0000-4000-8000-0000000000b1';
const ID_PROF_A = '00000000-0000-4000-8000-0000000000c1';
const ID_PROF_B = '00000000-0000-4000-8000-0000000000c2';
const ID_SALA_A = '00000000-0000-4000-8000-0000000000d1';
const ID_SALA_B = '00000000-0000-4000-8000-0000000000d2';
const SALA_SUGERIDA = `${API}/sala-sugerida`;

/** Instante ISO de um horário local de outubro/2026 (os testes não dependem do fuso da máquina). */
const em = (dia: number, hora: number, minuto = 0) =>
  new Date(2026, 9, dia, hora, minuto).toISOString();

function agendamento(parcial: Partial<Agendamento>): Agendamento {
  return {
    id: ID_AG,
    numero: 1224,
    pacienteId: ID_PACIENTE,
    pacienteNome: 'Ana Paciente Teste',
    profissionalId: ID_PROF_A,
    profissionalNome: 'Dr. Bruno Teste',
    profissionalCor: 'verde',
    salaId: ID_SALA_A,
    salaNome: 'Sala Azul',
    tipoAgendamentoId: null,
    tipoNome: 'Retorno',
    inicio: em(21, 8, 40),
    duracaoMinutos: 30,
    valor: 820,
    convenio: false,
    observacoes: null,
    status: 'REAGENDAR',
    ...parcial,
  };
}

const AGENDAMENTOS = [
  agendamento({}),
  agendamento({
    id: ID_AG_2,
    numero: 1231,
    pacienteNome: 'Carla Paciente Teste',
    profissionalId: ID_PROF_B,
    profissionalNome: 'Dra. Diana Teste',
    tipoNome: null,
    inicio: em(22, 9),
    duracaoMinutos: 60,
    valor: null,
    status: 'AGENDADO',
  }),
  agendamento({
    id: '00000000-0000-4000-8000-0000000000a3',
    numero: 1232,
    pacienteNome: 'Eva Paciente Teste',
    inicio: em(22, 9, 30),
    status: 'CONFIRMADO',
  }),
];

const PROFS: AgendaProfissional[] = [
  { id: ID_PROF_A, nome: 'Dr. Bruno Teste', especialidade: null, cor: 'verde' },
  { id: ID_PROF_B, nome: 'Dra. Diana Teste', especialidade: 'Nutrologia', cor: 'azul' },
];

function lookup(...itens: Array<[string, string]>) {
  const data = itens.map(([id, label]) => ({ id, label, descricao: null }));
  return json({ data, meta: { page: 1, pageSize: 20, total: data.length, totalPages: 1 } });
}

const corpoDe = (init?: RequestInit) => JSON.parse(String(init?.body)) as Record<string, unknown>;

function api(rotas: Parameters<typeof apiFalsa>[0] = {}) {
  return apiFalsa({
    ...rotas,
    rotas: {
      [API]: () => json({ data: AGENDAMENTOS }),
      [PROFISSIONAIS]: () => json({ data: PROFS }),
      '/api/lookups/pacientes': () => lookup([ID_PACIENTE, 'Ana Paciente Teste']),
      '/api/lookups/profissionais': () => lookup([ID_PROF_A, 'Dr. Bruno Teste']),
      '/api/lookups/tipos-agendamento': () => lookup(),
      '/api/lookups/salas': () => lookup([ID_SALA_A, 'Sala Azul'], [ID_SALA_B, 'Sala Verde']),
      [`/api/lookups/salas/${ID_SALA_A}`]: () =>
        json({ id: ID_SALA_A, label: 'Sala Azul', descricao: null }),
      [SALA_SUGERIDA]: () => json({ salaId: null, salaNome: null }),
      ...rotaMotivosCancelamento,
      ...rotas.rotas,
    },
  });
}

function renderTela(fetchMock = api()) {
  return { user: userEvent.setup(), ...renderApp('/agenda', fetchMock) };
}

const consultas = (fetchMock: ReturnType<typeof api>) =>
  chamadasPara(fetchMock, API).filter(([, init]) => !init?.method || init.method === 'GET');

beforeEach(() => {
  // Quinta-feira, 22/10/2026: a semana vai de 19/10 a 25/10.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 22, 10, 30));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Agenda: visão Semana', () => {
  it('mostra título, dias com contagem, cartões e legenda', async () => {
    const fetchMock = api();
    renderTela(fetchMock);

    expect(
      await screen.findByRole('heading', { name: '19 de out. — 25 de out. de 2026' }),
    ).toBeVisible();
    expect(await screen.findByRole('button', { name: /Ana Paciente Teste/ })).toBeVisible();
    expect(screen.getByText('1 agend.')).toBeVisible(); // quarta 21
    expect(screen.getByText('2 agend.')).toBeVisible(); // quinta 22
    expect(screen.getAllByText('0 agend.')).toHaveLength(5);
    expect(screen.getByText('Seg')).toBeVisible();
    expect(screen.getByText('Dom')).toBeVisible();

    const legenda = screen.getByRole('list', { name: 'Legenda' });
    expect(within(legenda).getByText('Agendado: 1')).toBeVisible();
    expect(within(legenda).getByText('Confirmado: 1')).toBeVisible();
    expect(within(legenda).getByText('Check-in: 0')).toBeVisible();
    expect(within(legenda).getByText('Cancelado: 0')).toBeVisible();
    expect(within(legenda).getByText('Reagendar: 1')).toBeVisible();

    const [url] = consultas(fetchMock)[0] as [string];
    expect(url).toContain('inicio=2026-10-19');
    expect(url).toContain('fim=2026-10-25');
    expect(url).not.toContain('profissionalId');
  });

  it('posiciona o cartão pelo horário e lado a lado quando há sobreposição', async () => {
    renderTela();

    const carla = await screen.findByRole('button', { name: /Carla Paciente Teste/ });
    const eva = screen.getByRole('button', { name: /Eva Paciente Teste/ });
    // 09:00-10:00 e 09:30-10:00 no mesmo dia: duas faixas de 50%.
    expect(carla.style.width).toBe('calc(50% - 2px)');
    expect(eva.style.width).toBe('calc(50% - 2px)');
    expect(carla.style.left).toBe('0%');
    expect(eva.style.left).toBe('50%');
    expect(carla).toHaveTextContent('09:00-10:00');
  });

  it('Próximo, Anterior e Hoje mudam a semana consultada', async () => {
    const fetchMock = api();
    const { user } = renderTela(fetchMock);
    await screen.findByRole('button', { name: /Ana Paciente Teste/ });

    await user.click(screen.getByRole('button', { name: 'Próximo' }));
    expect(
      await screen.findByRole('heading', { name: '26 de out. — 1 de nov. de 2026' }),
    ).toBeVisible();
    await waitFor(() =>
      expect(String(consultas(fetchMock).at(-1)?.[0])).toContain('inicio=2026-10-26'),
    );

    await user.click(screen.getByRole('button', { name: 'Anterior' }));
    await user.click(screen.getByRole('button', { name: 'Anterior' }));
    expect(
      await screen.findByRole('heading', { name: '12 de out. — 18 de out. de 2026' }),
    ).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Hoje' }));
    expect(
      await screen.findByRole('heading', { name: '19 de out. — 25 de out. de 2026' }),
    ).toBeVisible();
  });

  it('filtra por profissional no select "Todos profissionais"', async () => {
    const fetchMock = api();
    const { user } = renderTela(fetchMock);
    await screen.findByRole('button', { name: /Ana Paciente Teste/ });

    await user.click(screen.getByRole('combobox', { name: 'Profissional' }));
    await user.click(await screen.findByRole('option', { name: 'Dra. Diana Teste' }));

    await waitFor(() =>
      expect(String(consultas(fetchMock).at(-1)?.[0])).toContain(`profissionalId=${ID_PROF_B}`),
    );
  });

  it('erro ao carregar mostra a mensagem e permite tentar de novo', async () => {
    let falhar = true;
    const fetchMock = api({
      rotas: {
        [API]: () =>
          falhar
            ? json({ statusCode: 500, code: 'INTERNAL_ERROR', message: 'Erro interno' }, 500)
            : json({ data: AGENDAMENTOS }),
      },
    });
    const { user } = renderTela(fetchMock);

    expect(await screen.findByText('Não foi possível carregar a agenda.')).toBeVisible();
    falhar = false;
    await user.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByRole('button', { name: /Ana Paciente Teste/ })).toBeVisible();
  });
});

describe('Agenda no celular (issue #161)', () => {
  it('abre na visão Dia, porque a semana de 7 colunas não cabe', async () => {
    vi.stubGlobal('matchMedia', (query: string) => matchMediaStub(query, true));
    renderTela();

    expect(await screen.findByRole('heading', { name: '22 de outubro de 2026' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Dia' })).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('Agenda: visão Dia', () => {
  it('mostra uma coluna por profissional e chips para filtrar', async () => {
    const fetchMock = api();
    const { user } = renderTela(fetchMock);
    await screen.findByRole('button', { name: /Ana Paciente Teste/ });

    await user.click(screen.getByRole('button', { name: 'Dia' }));

    expect(await screen.findByRole('heading', { name: '22 de outubro de 2026' })).toBeVisible();
    await waitFor(() =>
      expect(String(consultas(fetchMock).at(-1)?.[0])).toContain(
        'inicio=2026-10-22&fim=2026-10-22',
      ),
    );
    const colunaA = await screen.findByTestId(`coluna-${ID_PROF_A}`);
    const colunaB = screen.getByTestId(`coluna-${ID_PROF_B}`);
    expect(within(colunaA).getByRole('button', { name: /Eva Paciente Teste/ })).toBeVisible();
    expect(within(colunaB).getByRole('button', { name: /Carla Paciente Teste/ })).toBeVisible();
    expect(screen.getAllByText('Quinta, 22 de out.')).toHaveLength(2);

    const chips = screen.getByRole('group', { name: 'Profissional' });
    await user.click(within(chips).getByRole('button', { name: 'Dra. Diana Teste' }));
    await waitFor(() =>
      expect(String(consultas(fetchMock).at(-1)?.[0])).toContain(`profissionalId=${ID_PROF_B}`),
    );
    expect(screen.queryByTestId(`coluna-${ID_PROF_A}`)).not.toBeInTheDocument();
  });
});

describe('Agenda: detalhe do agendamento', () => {
  it('clicar no cartão abre o modal com os dados e o pagamento pendente', async () => {
    const { user } = renderTela();

    await user.click(await screen.findByRole('button', { name: /Ana Paciente Teste/ }));

    const modal = await screen.findByRole('dialog', { name: 'Agendamento #1224' });
    expect(within(modal).getByText('Ana Paciente Teste')).toBeVisible();
    expect(within(modal).getByText('Dr. Bruno Teste')).toBeVisible();
    expect(within(modal).getByText('21/10/2026')).toBeVisible();
    expect(within(modal).getByText('08:40')).toBeVisible();
    expect(within(modal).getByText('30 min')).toBeVisible();
    expect(within(modal).getByText('Sala')).toBeVisible();
    expect(within(modal).getByText('Sala Azul')).toBeVisible();
    expect(within(modal).getByText('Reagendar')).toBeVisible();
    expect(within(modal).getByText('Retorno')).toBeVisible();
    expect(within(modal).getByText(/820,00/)).toBeVisible();
    expect(within(modal).getByText('Pendente')).toBeVisible();
    expect(within(modal).getByText('R$ 0.00 / R$ 820.00')).toBeVisible();
    expect(within(modal).getByText('Restam R$ 820.00')).toBeVisible();
  });

  it('sem valor, não mostra Valor nem Pagamento', async () => {
    const { user } = renderTela();

    await user.click(await screen.findByRole('button', { name: /Carla Paciente Teste/ }));

    const modal = await screen.findByRole('dialog', { name: 'Agendamento #1231' });
    expect(within(modal).getByText('Agendado')).toBeVisible();
    expect(within(modal).queryByText('Valor')).not.toBeInTheDocument();
    expect(within(modal).queryByText('Pagamento')).not.toBeInTheDocument();
  });
});

describe('Agenda: Novo Agendamento', () => {
  it('abre com os padrões do inventário', async () => {
    const { user } = renderTela();
    await screen.findByRole('button', { name: /Ana Paciente Teste/ });

    await user.click(screen.getByRole('button', { name: 'Novo Agendamento' }));

    const modal = await screen.findByRole('dialog', { name: 'Novo Agendamento' });
    expect(within(modal).getByLabelText('Data')).toHaveValue('2026-10-22');
    expect(within(modal).getByLabelText('Hora')).toHaveValue('10:00');
    expect(within(modal).getByLabelText('Duração (min)')).toHaveValue(30);
    expect(within(modal).getByLabelText('Convênio')).not.toBeChecked();
    expect(within(modal).getByRole('button', { name: 'Agendar' })).toBeVisible();
  });

  it('Agendar com paciente, profissional e sala vazios mostra as mensagens e não envia', async () => {
    const fetchMock = api();
    const { user } = renderTela(fetchMock);
    await user.click(await screen.findByRole('button', { name: 'Novo Agendamento' }));
    const modal = await screen.findByRole('dialog', { name: 'Novo Agendamento' });

    await user.click(within(modal).getByRole('button', { name: 'Agendar' }));

    expect(await within(modal).findByText('Selecione o paciente.')).toBeVisible();
    expect(within(modal).getByText('Selecione o profissional.')).toBeVisible();
    expect(within(modal).getByText('Sala é obrigatória.')).toBeVisible();
    expect(chamadasPara(fetchMock, API).filter(([, i]) => i?.method === 'POST')).toHaveLength(0);
  });

  it('envia o agendamento, fecha o modal e recarrega o calendário', async () => {
    let corpo: Record<string, unknown> | null = null;
    const fetchMock = api({
      rotas: {
        [API]: (init) => {
          if (init?.method !== 'POST') return json({ data: AGENDAMENTOS });
          corpo = corpoDe(init);
          return json(agendamento({ id: ID_AG_2 }), 201);
        },
      },
    });
    const { user } = renderTela(fetchMock);
    await user.click(await screen.findByRole('button', { name: 'Novo Agendamento' }));
    const modal = await screen.findByRole('dialog', { name: 'Novo Agendamento' });
    const leiturasAntes = consultas(fetchMock).length;

    await user.click(within(modal).getByRole('combobox', { name: /Paciente/ }));
    await user.click(await screen.findByRole('option', { name: /Ana Paciente Teste/ }));
    await user.click(within(modal).getByRole('combobox', { name: /Profissional/ }));
    await user.click(await screen.findByRole('option', { name: /Dr. Bruno Teste/ }));
    await user.click(within(modal).getByRole('combobox', { name: /Sala/ }));
    await user.click(await screen.findByRole('option', { name: /Sala Verde/ }));
    await user.clear(within(modal).getByLabelText('Duração (min)'));
    await user.type(within(modal).getByLabelText('Duração (min)'), '45');
    await user.click(within(modal).getByLabelText('Convênio'));
    await user.type(within(modal).getByLabelText('Observações'), 'Primeira vez');
    await user.click(within(modal).getByRole('button', { name: 'Agendar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(corpo).toMatchObject({
      pacienteId: ID_PACIENTE,
      profissionalId: ID_PROF_A,
      salaId: ID_SALA_B,
      data: '2026-10-22',
      hora: '10:00',
      duracaoMinutos: 45,
      convenio: true,
      observacoes: 'Primeira vez',
      valor: null,
      tipoAgendamentoId: null,
    });
    await waitFor(() => expect(consultas(fetchMock).length).toBeGreaterThan(leiturasAntes));
  });

  it('Fechar descarta o formulário sem enviar', async () => {
    const fetchMock = api();
    const { user } = renderTela(fetchMock);
    await user.click(await screen.findByRole('button', { name: 'Novo Agendamento' }));
    const modal = await screen.findByRole('dialog', { name: 'Novo Agendamento' });

    await user.click(within(modal).getByRole('button', { name: 'Cancelar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(chamadasPara(fetchMock, API).filter(([, i]) => i?.method === 'POST')).toHaveLength(0);
  });

  it('sem a permissão criar, o botão não aparece', async () => {
    const somenteVer = PERMISSOES.filter((p) => p !== 'comercial-atendimento.agenda.criar');
    renderTela(api({ usuario: { ...USUARIO_TESTE, permissoes: somenteVer } }));

    await screen.findByRole('heading', { name: /19 de out\./ });
    expect(screen.queryByRole('button', { name: 'Novo Agendamento' })).not.toBeInTheDocument();
  });
});

describe('Agenda: sala no agendamento (issue #136)', () => {
  const ID_SALA_C = '00000000-0000-4000-8000-0000000000d3';
  const SUGESTAO = 'Sala sugerida pelo contrato do profissional.';

  it('o cartão do calendário mostra a sala', async () => {
    renderTela();

    const cartao = await screen.findByRole('button', { name: /Ana Paciente Teste/ });

    expect(cartao).toHaveTextContent('Retorno • Dr. • Sala Azul • 30min');
  });

  it('agendamento antigo, sem sala, aparece como "Sem sala" no detalhe', async () => {
    const { user } = renderTela(
      api({
        rotas: {
          [API]: () => json({ data: [agendamento({ salaId: null, salaNome: null })] }),
        },
      }),
    );

    await user.click(await screen.findByRole('button', { name: /Ana Paciente Teste/ }));

    const modal = await screen.findByRole('dialog', { name: 'Agendamento #1224' });
    expect(within(modal).getByText('Sem sala')).toBeVisible();
  });

  describe('Novo Agendamento', () => {
    async function abrirNovo(fetchMock = api()) {
      const { user } = renderTela(fetchMock);
      await user.click(await screen.findByRole('button', { name: 'Novo Agendamento' }));
      const modal = await screen.findByRole('dialog', { name: 'Novo Agendamento' });
      return { user, modal, fetchMock };
    }

    async function escolherProfissional(
      user: ReturnType<typeof userEvent.setup>,
      modal: HTMLElement,
    ) {
      await user.click(within(modal).getByRole('combobox', { name: /Profissional/ }));
      await user.click(await screen.findByRole('option', { name: /Dr. Bruno Teste/ }));
    }

    it('preenche a sala do contrato do profissional e avisa que é uma sugestão', async () => {
      const fetchMock = api({
        rotas: {
          [SALA_SUGERIDA]: () => json({ salaId: ID_SALA_A, salaNome: 'Sala Azul' }),
        },
      });
      const { user, modal } = await abrirNovo(fetchMock);

      // Sem profissional não há o que sugerir.
      expect(chamadasPara(fetchMock, SALA_SUGERIDA)).toHaveLength(0);
      await escolherProfissional(user, modal);

      expect(await within(modal).findByText(SUGESTAO)).toBeVisible();
      await waitFor(() =>
        expect(within(modal).getByRole('combobox', { name: /Sala/ })).toHaveTextContent(
          'Sala Azul',
        ),
      );
      const [url] = chamadasPara(fetchMock, SALA_SUGERIDA)[0] as [string];
      expect(url).toContain(`profissionalId=${ID_PROF_A}`);
      expect(url).toContain('data=2026-10-22');
      expect(url).toContain('hora=10%3A00');
    });

    it('a sala sugerida pode ser trocada e a escolha manual não é sobrescrita', async () => {
      const fetchMock = api({
        rotas: {
          [SALA_SUGERIDA]: (_init, url) =>
            url.includes('hora=14')
              ? json({ salaId: ID_SALA_C, salaNome: 'Sala Roxa' })
              : json({ salaId: ID_SALA_A, salaNome: 'Sala Azul' }),
          [`/api/lookups/salas/${ID_SALA_C}`]: () =>
            json({ id: ID_SALA_C, label: 'Sala Roxa', descricao: null }),
        },
      });
      const { user, modal } = await abrirNovo(fetchMock);
      await escolherProfissional(user, modal);
      expect(await within(modal).findByText(SUGESTAO)).toBeVisible();

      await user.click(within(modal).getByRole('combobox', { name: /Sala/ }));
      await user.click(await screen.findByRole('option', { name: /Sala Verde/ }));
      expect(within(modal).queryByText(SUGESTAO)).not.toBeInTheDocument();
      await user.clear(within(modal).getByLabelText('Hora'));
      await user.type(within(modal).getByLabelText('Hora'), '14:00');

      await waitFor(() =>
        expect(String(chamadasPara(fetchMock, SALA_SUGERIDA).at(-1)?.[0])).toContain('hora=14'),
      );
      expect(within(modal).getByRole('combobox', { name: /Sala/ })).toHaveTextContent('Sala Verde');
    });

    it('conflito (409) fica no topo do formulário, com o horário, e o modal continua aberto', async () => {
      const mensagem = 'A sala Sala Azul já tem agendamento em 22/10/2026, das 10:00 às 10:30.';
      const fetchMock = api({
        rotas: {
          [API]: (init) =>
            init?.method === 'POST'
              ? json({ statusCode: 409, code: 'AGENDA_SALA_CONFLITO', message: mensagem }, 409)
              : json({ data: AGENDAMENTOS }),
        },
      });
      const { user, modal } = await abrirNovo(fetchMock);
      await user.click(within(modal).getByRole('combobox', { name: /Paciente/ }));
      await user.click(await screen.findByRole('option', { name: /Ana Paciente Teste/ }));
      await escolherProfissional(user, modal);
      await user.click(within(modal).getByRole('combobox', { name: /Sala/ }));
      await user.click(await screen.findByRole('option', { name: /Sala Azul/ }));

      await user.click(within(modal).getByRole('button', { name: 'Agendar' }));

      expect(await within(modal).findByText(mensagem)).toBeVisible();
      expect(screen.getByRole('dialog', { name: 'Novo Agendamento' })).toBeVisible();
    });
  });

  describe('Editar Agendamento', () => {
    const ROTA_AG = `${API}/${ID_AG}`;

    async function abrirEdicao(fetchMock = api()) {
      const { user } = renderTela(fetchMock);
      await user.click(await screen.findByRole('button', { name: /Ana Paciente Teste/ }));
      const detalhe = await screen.findByRole('dialog', { name: 'Agendamento #1224' });
      await user.click(within(detalhe).getByRole('button', { name: 'Editar' }));
      const modal = await screen.findByRole('dialog', { name: 'Editar Agendamento #1224' });
      return { user, modal, fetchMock };
    }

    it('abre com a sala, a data, a hora e a duração atuais e substitui o detalhe', async () => {
      const { modal } = await abrirEdicao();

      expect(within(modal).getByRole('combobox', { name: /Sala/ })).toHaveTextContent('Sala Azul');
      expect(within(modal).getByLabelText('Data')).toHaveValue('2026-10-21');
      expect(within(modal).getByLabelText('Hora')).toHaveValue('08:40');
      expect(within(modal).getByLabelText('Duração (min)')).toHaveValue(30);
      expect(screen.queryByRole('dialog', { name: 'Agendamento #1224' })).not.toBeInTheDocument();
    });

    it('envia sala, data, hora e duração, fecha e recarrega o calendário', async () => {
      let corpo: Record<string, unknown> | null = null;
      const fetchMock = api({
        rotas: {
          [ROTA_AG]: (init) => {
            corpo = corpoDe(init);
            return json(agendamento({ salaId: ID_SALA_B, salaNome: 'Sala Verde' }));
          },
        },
      });
      const { user, modal } = await abrirEdicao(fetchMock);
      const leiturasAntes = consultas(fetchMock).length;

      await user.click(within(modal).getByRole('combobox', { name: /Sala/ }));
      await user.click(await screen.findByRole('option', { name: /Sala Verde/ }));
      await user.clear(within(modal).getByLabelText('Duração (min)'));
      await user.type(within(modal).getByLabelText('Duração (min)'), '60');
      await user.click(within(modal).getByRole('button', { name: 'Salvar' }));

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(corpo).toEqual({
        salaId: ID_SALA_B,
        data: '2026-10-21',
        hora: '08:40',
        duracaoMinutos: 60,
      });
      expect(chamadasPara(fetchMock, ROTA_AG)[0]?.[1]?.method).toBe('PATCH');
      await waitFor(() => expect(consultas(fetchMock).length).toBeGreaterThan(leiturasAntes));
    });

    it('conflito (409) aparece no formulário e nada fecha', async () => {
      const mensagem = 'Dr. Bruno Teste já tem agendamento em 21/10/2026, das 09:00 às 09:30.';
      const fetchMock = api({
        rotas: {
          [ROTA_AG]: () =>
            json({ statusCode: 409, code: 'AGENDA_PROFISSIONAL_CONFLITO', message: mensagem }, 409),
        },
      });
      const { user, modal } = await abrirEdicao(fetchMock);

      await user.click(within(modal).getByRole('button', { name: 'Salvar' }));

      expect(await within(modal).findByText(mensagem)).toBeVisible();
      expect(screen.getByRole('dialog', { name: 'Editar Agendamento #1224' })).toBeVisible();
    });

    it('agendamento antigo, sem sala: avisa e exige a sala antes de salvar', async () => {
      const fetchMock = api({
        rotas: {
          [API]: () => json({ data: [agendamento({ salaId: null, salaNome: null })] }),
        },
      });
      const { user, modal } = await abrirEdicao(fetchMock);

      expect(
        within(modal).getByText(
          'Este agendamento é anterior ao cadastro de salas. Escolha a sala para salvar.',
        ),
      ).toBeVisible();
      await user.click(within(modal).getByRole('button', { name: 'Salvar' }));

      expect(await within(modal).findByText('Sala é obrigatória.')).toBeVisible();
      expect(chamadasPara(fetchMock, ROTA_AG)).toHaveLength(0);
    });

    it('Cancelar fecha sem enviar', async () => {
      const { user, modal, fetchMock } = await abrirEdicao();

      await user.click(within(modal).getByRole('button', { name: 'Cancelar' }));

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(chamadasPara(fetchMock, ROTA_AG)).toHaveLength(0);
    });

    it('sem a permissão editar, o detalhe não tem o botão Editar', async () => {
      const semEditar = PERMISSOES.filter((p) => p !== 'comercial-atendimento.agenda.editar');
      const { user } = renderTela(api({ usuario: { ...USUARIO_TESTE, permissoes: semEditar } }));

      await user.click(await screen.findByRole('button', { name: /Ana Paciente Teste/ }));

      const detalhe = await screen.findByRole('dialog', { name: 'Agendamento #1224' });
      expect(within(detalhe).queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument();
    });
  });

  describe('Cancelar agendamento (issue #162)', () => {
    const ROTA_CANCELAR = `${API}/${ID_AG}/cancelar`;

    async function abrirCancelamento(fetchMock = api()) {
      const { user } = renderTela(fetchMock);
      await user.click(await screen.findByRole('button', { name: /Ana Paciente Teste/ }));
      const detalhe = await screen.findByRole('dialog', { name: 'Agendamento #1224' });
      await user.click(within(detalhe).getByRole('button', { name: 'Cancelar agendamento' }));
      const modal = await screen.findByRole('dialog', { name: 'Cancelar agendamento #1224' });
      return { user, modal, fetchMock };
    }

    it('pede o motivo da lista, liga ao novo agendamento do paciente e envia', async () => {
      let corpo: Record<string, unknown> | null = null;
      const fetchMock = api({
        rotas: {
          [ROTA_CANCELAR]: (init) => {
            corpo = corpoDe(init);
            return json({ ...AGENDAMENTOS[0], status: 'CANCELADO' });
          },
        },
      });
      const { user, modal } = await abrirCancelamento(fetchMock);
      expect(within(modal).getByText(/Ana Paciente Teste com Dr. Bruno Teste/)).toBeVisible();

      await user.click(within(modal).getByRole('button', { name: 'Cancelar agendamento' }));
      expect(await within(modal).findByText('Motivo é obrigatório.')).toBeVisible();
      expect(corpo).toBeNull();

      await user.click(within(modal).getByRole('combobox', { name: /Motivo/ }));
      await user.click(await screen.findByRole('option', { name: 'Paciente desistiu' }));
      await user.click(within(modal).getByRole('combobox', { name: /Reagendou/ }));
      const opcoes = await screen.findAllByRole('option');
      expect(opcoes.map((o) => o.textContent)).toEqual(
        expect.arrayContaining(['#1231 - 22/10/2026 às 09:00', '#1232 - 22/10/2026 às 09:30']),
      );
      expect(opcoes.map((o) => o.textContent)).not.toContain('#1224 - 21/10/2026 às 09:00');
      await user.click(await screen.findByRole('option', { name: /#1231/ }));
      await user.click(within(modal).getByRole('button', { name: 'Cancelar agendamento' }));

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(corpo).toEqual({ motivoId: MOTIVO_ID, reagendouParaId: ID_AG_2 });
    });

    it('sem reagendamento, envia só o motivo e a observação', async () => {
      let corpo: Record<string, unknown> | null = null;
      const fetchMock = api({
        rotas: {
          [ROTA_CANCELAR]: (init) => {
            corpo = corpoDe(init);
            return json({ ...AGENDAMENTOS[0], status: 'CANCELADO' });
          },
        },
      });
      const { user, modal } = await abrirCancelamento(fetchMock);

      await user.click(within(modal).getByRole('combobox', { name: /Motivo/ }));
      await user.click(await screen.findByRole('option', { name: 'Paciente desistiu' }));
      await user.type(within(modal).getByLabelText('Observação'), 'Viagem');
      await user.click(within(modal).getByRole('button', { name: 'Cancelar agendamento' }));

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(corpo).toEqual({ motivoId: MOTIVO_ID, observacao: 'Viagem' });
    });

    it('o erro do servidor (409) aparece no modal e não fecha', async () => {
      const fetchMock = api({
        rotas: {
          [ROTA_CANCELAR]: () =>
            json(
              {
                statusCode: 409,
                code: 'AGENDAMENTO_NAO_CANCELAVEL',
                message:
                  'Só é possível cancelar um agendamento agendado, confirmado ou a reagendar.',
              },
              409,
            ),
        },
      });
      const { user, modal } = await abrirCancelamento(fetchMock);

      await user.click(within(modal).getByRole('combobox', { name: /Motivo/ }));
      await user.click(await screen.findByRole('option', { name: 'Paciente desistiu' }));
      await user.click(within(modal).getByRole('button', { name: 'Cancelar agendamento' }));

      expect(await within(modal).findByText(/Só é possível cancelar um agendamento/)).toBeVisible();
      expect(screen.getByRole('dialog', { name: 'Cancelar agendamento #1224' })).toBeVisible();
    });

    it.each(['CANCELADO', 'ATENDIDO', 'FALTOU'] as const)(
      'agendamento %s não tem o botão Cancelar',
      async (status) => {
        const { user } = renderTela(
          api({ rotas: { [API]: () => json({ data: [agendamento({ status })] }) } }),
        );

        await user.click(await screen.findByRole('button', { name: /Ana Paciente Teste/ }));

        const detalhe = await screen.findByRole('dialog', { name: 'Agendamento #1224' });
        expect(
          within(detalhe).queryByRole('button', { name: 'Cancelar agendamento' }),
        ).not.toBeInTheDocument();
      },
    );

    it('sem a permissão editar, o detalhe não tem o botão Cancelar', async () => {
      const semEditar = PERMISSOES.filter((p) => p !== 'comercial-atendimento.agenda.editar');
      const { user } = renderTela(api({ usuario: { ...USUARIO_TESTE, permissoes: semEditar } }));

      await user.click(await screen.findByRole('button', { name: /Ana Paciente Teste/ }));

      const detalhe = await screen.findByRole('dialog', { name: 'Agendamento #1224' });
      expect(
        within(detalhe).queryByRole('button', { name: 'Cancelar agendamento' }),
      ).not.toBeInTheDocument();
    });

    it('em inglês, o botão e o modal usam os textos traduzidos', async () => {
      const { user } = renderTela(
        api({
          usuario: { ...USUARIO_TESTE, preferencias: { ...PREFERENCIAS_PADRAO, idioma: 'en' } },
        }),
      );

      await user.click(await screen.findByRole('button', { name: /Ana Paciente Teste/ }));
      const detalhe = await screen.findByRole('dialog', { name: 'Agendamento #1224' });
      await user.click(within(detalhe).getByRole('button', { name: 'Cancel appointment' }));

      const modal = await screen.findByRole('dialog', { name: 'Cancel appointment #1224' });
      expect(within(modal).getByRole('combobox', { name: /Reason/ })).toBeVisible();
      expect(within(modal).getByRole('combobox', { name: /Rescheduled/ })).toBeVisible();
    });
  });

  describe('em inglês', () => {
    it('detalhe, edição e erro de conflito usam os textos traduzidos', async () => {
      const fetchMock = api({
        usuario: { ...USUARIO_TESTE, preferencias: { ...PREFERENCIAS_PADRAO, idioma: 'en' } },
        rotas: {
          [`${API}/${ID_AG}`]: () =>
            json(
              {
                statusCode: 409,
                code: 'AGENDA_SALA_CONFLITO',
                message: 'A sala Sala Azul já tem agendamento em 21/10/2026, das 09:00 às 09:30.',
              },
              409,
            ),
        },
      });
      const { user } = renderTela(fetchMock);

      await user.click(await screen.findByRole('button', { name: /Ana Paciente Teste/ }));
      const detalhe = await screen.findByRole('dialog', { name: 'Agendamento #1224' });
      expect(within(detalhe).getByText('Room')).toBeVisible();
      await user.click(within(detalhe).getByRole('button', { name: 'Edit' }));

      const modal = await screen.findByRole('dialog', { name: 'Edit Appointment #1224' });
      expect(within(modal).getByRole('combobox', { name: /Room/ })).toBeVisible();
      expect(within(modal).getByLabelText('Date')).toBeVisible();
      expect(within(modal).getByLabelText('Time')).toBeVisible();
      expect(within(modal).getByLabelText('Duration (min)')).toBeVisible();
      await user.click(within(modal).getByRole('button', { name: 'Save' }));
      expect(
        await within(modal).findByText('The room already has an appointment at this time'),
      ).toBeVisible();
    }, 15000);
  });
});
