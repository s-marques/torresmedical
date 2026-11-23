import type { AgendaMatriz, AgendaMatrizCelula } from '@torres/shared';
import { PREFERENCIAS_PADRAO } from '@torres/shared';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFalsa, chamadasPara, json, renderApp, USUARIO_TESTE } from '@/test/render-app';

vi.setConfig({ testTimeout: 30_000 });

const API = '/api/comercial-atendimento/agenda-matriz';
const SALA_1 = '00000000-0000-4000-8000-0000000000d1';
const SALA_2 = '00000000-0000-4000-8000-0000000000d2';
const PROF = '00000000-0000-4000-8000-0000000000c1';
const ITEM = '00000000-0000-4000-8000-0000000000e1';
const DIA = '2026-10-22';

const COLUNAS_TURNO = [
  { chave: 'MANHA', inicio: '00:00', fim: '12:00', turno: 'MANHA' },
  { chave: 'TARDE', inicio: '12:00', fim: '18:00', turno: 'TARDE' },
  { chave: 'NOITE', inicio: '18:00', fim: '24:00', turno: 'NOITE' },
] as const;

const DIAS_SEMANA = [
  '2026-10-19',
  '2026-10-20',
  '2026-10-21',
  '2026-10-22',
  '2026-10-23',
  '2026-10-24',
  '2026-10-25',
];

function celula(parcial: Partial<AgendaMatrizCelula>): AgendaMatrizCelula {
  return { data: DIA, coluna: 'MANHA', status: 'DISPONIVEL', semUso: false, itens: [], ...parcial };
}

function contrato(oculto = false) {
  return {
    tipo: 'CONTRATO' as const,
    id: ITEM,
    inicio: '08:00',
    fim: '12:00',
    nome: oculto ? null : 'Dra. Ana Teste',
    valorMensal: oculto ? null : 1500,
    bloqueioTipo: null,
    agendamentoStatus: null,
    oculto,
  };
}

const SEMANA: AgendaMatriz = {
  visao: 'semana',
  inicio: '2026-10-19',
  fim: '2026-10-25',
  dias: DIAS_SEMANA,
  colunas: [...COLUNAS_TURNO],
  salas: [
    {
      salaId: SALA_1,
      salaNome: 'Sala 1',
      celulas: [
        celula({ status: 'CONTRATADO', semUso: true, itens: [contrato()] }),
        celula({ coluna: 'TARDE', status: 'MANUTENCAO' }),
        celula({ coluna: 'NOITE', status: 'AGENDADO' }),
      ],
    },
    {
      salaId: SALA_2,
      salaNome: 'Sala 2',
      celulas: [celula({ status: 'CONTRATADO', semUso: true, itens: [contrato(true)] })],
    },
  ],
};

const DIA_HORAS: AgendaMatriz = {
  visao: 'dia',
  inicio: DIA,
  fim: DIA,
  dias: [DIA],
  colunas: [
    { chave: '07:00', inicio: '07:00', fim: '08:00', turno: 'MANHA' },
    { chave: '08:00', inicio: '08:00', fim: '09:00', turno: 'MANHA' },
  ],
  salas: [
    {
      salaId: SALA_1,
      salaNome: 'Sala 1',
      celulas: [
        celula({ coluna: '07:00' }),
        celula({ coluna: '08:00', status: 'CONTRATADO', semUso: true, itens: [contrato()] }),
      ],
    },
  ],
};

function api(resposta: () => Response = () => json(SEMANA)) {
  return apiFalsa({ rotas: { [API]: resposta } });
}

const consultas = (f: ReturnType<typeof api>) =>
  chamadasPara(f, API).map(([url]) => new URL(url, 'http://x').searchParams);

function renderTela(caminho = '/agenda?modo=matriz', fetchMock = api()) {
  return { user: userEvent.setup(), ...renderApp(caminho, fetchMock) };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 22, 10, 30));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Agenda matricial', () => {
  it('abre pelo modo Matriz: salas nas linhas, dias nas colunas e período no título', async () => {
    const fetchMock = api();
    renderTela('/agenda?modo=matriz', fetchMock);

    expect(await screen.findByRole('rowheader', { name: 'Sala 1' })).toBeVisible();
    expect(screen.getByRole('rowheader', { name: 'Sala 2' })).toBeVisible();
    expect(screen.getByRole('heading', { name: '19/10/2026 - 25/10/2026' })).toBeVisible();
    expect(screen.getAllByRole('columnheader')).toHaveLength(8);
    expect(consultas(fetchMock)[0]?.get('visao')).toBe('semana');
    expect(consultas(fetchMock)[0]?.get('data')).toBe(DIA);
  });

  it('a legenda traz cada status e o contratado sem uso', async () => {
    renderTela();
    const legenda = await screen.findByRole('list', { name: 'Legenda' });
    for (const rotulo of [
      'Disponível',
      'Contratado',
      'Agendado',
      'Bloqueio',
      'Manutenção',
      'Reserva',
      'Cortesia',
      'Uso avulso',
      'Contratado sem uso',
    ]) {
      expect(within(legenda).getByText(rotulo)).toBeVisible();
    }
  });

  it('destaca o período contratado sem agendamento e descreve a célula', async () => {
    renderTela();
    const sem = await screen.findByRole('button', {
      name: 'Sala 1, 22/10/2026, Manhã: Contratado, Contratado sem uso',
    });
    expect(sem.className).toContain('outline-orange-500');
    const agendado = screen.getByRole('button', {
      name: 'Sala 1, 22/10/2026, Noite: Agendado',
    });
    expect(agendado.className).not.toContain('outline-orange-500');
    expect(
      screen.getByRole('button', { name: 'Sala 1, 22/10/2026, Tarde: Manutenção' }),
    ).toBeVisible();
  });

  it('visão Dia: colunas por hora e consulta com a visão', async () => {
    const fetchMock = api(() => json(DIA_HORAS));
    const { user, router } = renderTela('/agenda?modo=matriz', fetchMock);
    await screen.findByRole('rowheader', { name: 'Sala 1' });

    await user.click(screen.getByRole('button', { name: 'Dia' }));

    expect(await screen.findByRole('columnheader', { name: '07:00' })).toBeVisible();
    expect(router.state.location.search).toContain('visao=dia');
    expect(consultas(fetchMock).at(-1)?.get('visao')).toBe('dia');
    expect(screen.getByRole('heading', { name: '22/10/2026' })).toBeVisible();
  });

  it('visão Semana sai da URL e navegar muda a data', async () => {
    const fetchMock = api();
    const { user, router } = renderTela('/agenda?modo=matriz&visao=dia', fetchMock);
    await screen.findByRole('rowheader', { name: 'Sala 1' });

    await user.click(screen.getByRole('button', { name: 'Semana' }));
    expect(router.state.location.search).not.toContain('visao');

    await user.click(screen.getByRole('button', { name: 'Próximo' }));
    expect(router.state.location.search).toContain('data=2026-10-29');
    expect(consultas(fetchMock).at(-1)?.get('data')).toBe('2026-10-29');

    await user.click(screen.getByRole('button', { name: 'Hoje' }));
    expect(router.state.location.search).not.toContain('data=');
  });

  it('os filtros da URL vão para a API e o parâmetro inválido é descartado', async () => {
    const fetchMock = api();
    renderTela(
      `/agenda?modo=matriz&profissionalId=${PROF}&salaId=${SALA_1}&turno=TARDE&situacao=SEM_USO&visao=ano`,
      fetchMock,
    );
    await screen.findByRole('rowheader', { name: 'Sala 1' });

    const consulta = consultas(fetchMock)[0];
    expect(consulta?.get('profissionalId')).toBe(PROF);
    expect(consulta?.get('salaId')).toBe(SALA_1);
    expect(consulta?.get('turno')).toBe('TARDE');
    expect(consulta?.get('situacao')).toBe('SEM_USO');
    expect(consulta?.get('visao')).toBe('semana');
  });

  it('escolher turno e situação grava na URL e consulta de novo', async () => {
    const fetchMock = api();
    const { user, router } = renderTela('/agenda?modo=matriz', fetchMock);
    await screen.findByRole('rowheader', { name: 'Sala 1' });

    await user.click(screen.getByRole('combobox', { name: 'Turno' }));
    await user.click(await screen.findByRole('option', { name: 'Tarde' }));
    await user.click(screen.getByRole('combobox', { name: 'Situação' }));
    await user.click(await screen.findByRole('option', { name: 'Contratado sem uso' }));

    expect(router.state.location.search).toContain('turno=TARDE');
    expect(router.state.location.search).toContain('situacao=SEM_USO');
    const ultima = consultas(fetchMock).at(-1);
    expect(ultima?.get('turno')).toBe('TARDE');
    expect(ultima?.get('situacao')).toBe('SEM_USO');
  });

  it('o detalhe mostra o contrato e o valor; para o restrito, "Ocupado" sem nome', async () => {
    const { user } = renderTela();
    await user.click(
      await screen.findByRole('button', { name: /Sala 1, 22\/10\/2026, Manhã: Contratado/ }),
    );
    const modal = await screen.findByRole('dialog', { name: /Sala 1/ });
    expect(within(modal).getByText('Dra. Ana Teste')).toBeVisible();
    expect(within(modal).getByText('Contrato')).toBeVisible();
    expect(within(modal).getByText(/Valor mensal do contrato: R\$\s1\.500,00/)).toBeVisible();
    expect(within(modal).getByText('08:00 - 12:00')).toBeVisible();
    expect(
      within(modal).getByText('Período contratado sem nenhum agendamento na sala.'),
    ).toBeVisible();
    await user.click(within(modal).getAllByRole('button', { name: 'Fechar' })[0]!);

    await user.click(
      screen.getByRole('button', { name: /Sala 2, 22\/10\/2026, Manhã: Contratado/ }),
    );
    const oculto = await screen.findByRole('dialog', { name: /Sala 2/ });
    expect(within(oculto).getByText('Ocupado')).toBeVisible();
    expect(within(oculto).queryByText(/Valor mensal/)).toBeNull();
  });

  it('agendar num horário livre abre o Novo Agendamento com sala, dia e hora', async () => {
    const fetchMock = api(() => json(DIA_HORAS));
    const { user } = renderTela('/agenda?modo=matriz&visao=dia', fetchMock);

    await user.click(
      await screen.findByRole('button', { name: /Sala 1, 22\/10\/2026, 07:00: Disponível/ }),
    );
    const detalhe = await screen.findByRole('dialog', { name: /Sala 1/ });
    expect(within(detalhe).getByText(/Horário livre/)).toBeVisible();
    await user.click(within(detalhe).getByRole('button', { name: 'Agendar neste horário' }));

    const modal = await screen.findByRole('dialog', { name: 'Novo Agendamento' });
    expect(within(modal).getByLabelText('Data')).toHaveValue(DIA);
    expect(within(modal).getByLabelText('Hora')).toHaveValue('07:00');
  });

  it('na visão por turno o agendamento sugere a hora de início do turno', async () => {
    const { user } = renderTela();
    await user.click(
      await screen.findByRole('button', { name: /Sala 1, 22\/10\/2026, Manhã: Contratado/ }),
    );
    await user.click(await screen.findByRole('button', { name: 'Agendar neste horário' }));
    const modal = await screen.findByRole('dialog', { name: 'Novo Agendamento' });
    expect(within(modal).getByLabelText('Hora')).toHaveValue('08:00');
  });

  it('horário bloqueado não oferece agendar', async () => {
    const { user } = renderTela();
    await user.click(
      await screen.findByRole('button', { name: /Sala 1, 22\/10\/2026, Tarde: Manutenção/ }),
    );
    await screen.findByRole('dialog', { name: /Sala 1/ });
    expect(screen.queryByRole('button', { name: 'Agendar neste horário' })).toBeNull();
  });

  it('sem permissão de criar, o detalhe não mostra Agendar', async () => {
    const fetchMock = apiFalsa({
      usuario: {
        ...USUARIO_TESTE,
        permissoes: ['comercial-atendimento.agenda.ver'],
      },
      rotas: { [API]: () => json(SEMANA) },
    });
    const { user } = renderTela('/agenda?modo=matriz', fetchMock);
    await user.click(
      await screen.findByRole('button', { name: /Sala 1, 22\/10\/2026, Manhã: Contratado/ }),
    );
    await screen.findByRole('dialog', { name: /Sala 1/ });
    expect(screen.queryByRole('button', { name: 'Agendar neste horário' })).toBeNull();
  });

  it('sem salas mostra o estado vazio; erro permite tentar de novo', async () => {
    const vazio = api(() => json({ ...SEMANA, salas: [] }));
    const { unmount } = renderTela('/agenda?modo=matriz', vazio);
    expect(await screen.findByText('Nenhuma sala encontrada.')).toBeVisible();
    unmount();

    let falhar = true;
    const fetchMock = api(() =>
      falhar ? json({ statusCode: 500, code: 'ERRO', message: 'x' }, 500) : json(SEMANA),
    );
    const { user } = renderTela('/agenda?modo=matriz', fetchMock);
    expect(await screen.findByText('Não foi possível carregar a agenda matricial.')).toBeVisible();
    falhar = false;
    await user.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByRole('rowheader', { name: 'Sala 1' })).toBeVisible();
  });

  it('alterna entre Calendário e Matriz', async () => {
    const fetchMock = apiFalsa({
      rotas: {
        [API]: () => json(SEMANA),
        '/api/comercial-atendimento/agendamentos': () => json({ data: [] }),
        '/api/comercial-atendimento/agendamentos/profissionais': () => json({ data: [] }),
      },
    });
    const { user, router } = renderTela('/agenda', fetchMock);
    await user.click(await screen.findByRole('button', { name: 'Matriz' }));
    expect(await screen.findByRole('rowheader', { name: 'Sala 1' })).toBeVisible();
    expect(router.state.location.search).toBe('?modo=matriz');

    await user.click(screen.getByRole('button', { name: 'Calendário' }));
    expect(await screen.findByRole('button', { name: 'Novo Agendamento' })).toBeVisible();
    expect(router.state.location.search).toBe('');
  });

  it('em inglês, os textos da matriz são traduzidos', async () => {
    const fetchMock = apiFalsa({
      usuario: {
        ...USUARIO_TESTE,
        preferencias: { ...PREFERENCIAS_PADRAO, idioma: 'en' as const },
      },
      rotas: { [API]: () => json(SEMANA) },
    });
    renderTela('/agenda?modo=matriz', fetchMock);
    expect(await screen.findByRole('button', { name: 'Matrix' })).toBeVisible();
    await screen.findByRole('rowheader', { name: 'Sala 1' });
    expect(screen.getByRole('button', { name: 'Previous' })).toBeVisible();
    expect(screen.getByRole('list', { name: 'Legend' })).toBeVisible();
    expect(
      screen.getByRole('button', {
        name: /Sala 1, .*Morning: Contracted, Contracted, unused/,
      }),
    ).toBeVisible();
  });
});
