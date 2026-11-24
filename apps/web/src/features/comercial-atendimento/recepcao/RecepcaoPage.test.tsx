import { PERMISSOES, PREFERENCIAS_PADRAO, type RecepcaoItem } from '@torres/shared';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiFalsa, chamadasPara, json, renderApp, USUARIO_TESTE } from '@/test/render-app';

vi.setConfig({ testTimeout: 20_000 });

const API = '/api/comercial-atendimento/recepcao';
const SALA = '00000000-0000-4000-8000-0000000000b1';
const PROFISSIONAL = '00000000-0000-4000-8000-0000000000a1';
const id = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;
const aMinutos = (minutos: number) => new Date(Date.now() - minutos * 60_000).toISOString();

function item(n: number, extra: Partial<RecepcaoItem> = {}): RecepcaoItem {
  return {
    id: id(n),
    inicio: `2026-11-24T1${n}:00:00.000Z`,
    pacienteNome: `Paciente Fictício ${n}`,
    profissionalId: PROFISSIONAL,
    profissionalNome: 'Dra. Ana Fictícia',
    salaNome: 'Sala 1',
    status: 'CONFIRMADO',
    chegadaEm: null,
    entradaEm: null,
    finalizadoEm: null,
    ...extra,
  };
}

const CHEGOU = item(2, { status: 'CHECK_IN', chegadaEm: aMinutos(12.5) });
const AGUARDANDO = item(3, { status: 'AGUARDANDO', chegadaEm: aMinutos(30.5) });
const EM_ATENDIMENTO = item(4, {
  status: 'EM_ATENDIMENTO',
  chegadaEm: aMinutos(50),
  entradaEm: aMinutos(40),
});

const pagina = (data: RecepcaoItem[]) =>
  json({ data, meta: { page: 1, pageSize: 100, total: data.length, totalPages: 1 } });
const params = (url: string) => Object.fromEntries(new URL(url, 'http://x').searchParams);

function renderTela(
  opcoes: {
    permissoes?: readonly string[];
    lista?: () => RecepcaoItem[];
    fila?: () => RecepcaoItem[];
    idioma?: 'en' | 'es';
    rota?: string;
    patch?: (init?: RequestInit) => Response;
  } = {},
) {
  const lista = opcoes.lista ?? (() => [item(1), CHEGOU, EM_ATENDIMENTO]);
  const fila = opcoes.fila ?? (() => [AGUARDANDO, CHEGOU]);
  const fetchMock = apiFalsa({
    usuario: {
      ...USUARIO_TESTE,
      permissoes: [...(opcoes.permissoes ?? PERMISSOES)] as typeof USUARIO_TESTE.permissoes,
      preferencias: { ...PREFERENCIAS_PADRAO, ...(opcoes.idioma ? { idioma: opcoes.idioma } : {}) },
    },
    rotas: {
      [API]: () => pagina(lista()),
      [`${API}/fila`]: () => json({ data: fila() }),
      [`${API}/${id(1)}/status`]: (init) =>
        opcoes.patch?.(init) ?? json(item(1, { status: 'CHECK_IN', chegadaEm: aMinutos(0) })),
      '/api/lookups/profissionais': () =>
        json({
          data: [{ id: PROFISSIONAL, label: 'Dra. Ana Fictícia', descricao: null }],
          meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
        }),
      '/api/lookups/salas': () =>
        json({
          data: [{ id: SALA, label: 'Sala 1', descricao: null }],
          meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
        }),
    },
  });
  return {
    user: userEvent.setup(),
    ...renderApp(opcoes.rota ?? '/recepcao', fetchMock),
  };
}

/** Linha do grid do paciente (a fila de espera repete o nome, mas fora de uma `tr`). */
const linha = (paciente: string) =>
  screen
    .getAllByText(paciente)
    .map((el) => el.closest('tr'))
    .find((tr): tr is HTMLTableRowElement => tr !== null) as HTMLElement;

afterEach(() => vi.useRealTimers());

describe('Recepção (/recepcao)', () => {
  it('mostra "Atendimentos de hoje" com horário, paciente, profissional, sala e status', async () => {
    renderTela();

    expect(await screen.findByRole('heading', { name: 'Recepção' })).toBeVisible();
    for (const coluna of ['Horário', 'Paciente', 'Profissional', 'Sala', 'Status', 'Espera']) {
      expect(screen.getByRole('columnheader', { name: new RegExp(coluna) })).toBeVisible();
    }
    const primeira = await screen.findByText('Paciente Fictício 1');
    const celulas = within(primeira.closest('tr') as HTMLElement);
    expect(celulas.getByText('Dra. Ana Fictícia')).toBeVisible();
    expect(celulas.getByText('Sala 1')).toBeVisible();
    expect(celulas.getByText('Confirmado', { selector: '[data-tom]' })).toBeVisible();
    expect(
      within(linha('Paciente Fictício 2')).getByText('Chegou', { selector: '[data-tom]' }),
    ).toBeVisible();
    expect(
      within(linha('Paciente Fictício 4')).getByText('Em atendimento', { selector: '[data-tom]' }),
    ).toBeVisible();
  });

  it('não pede nem mostra conteúdo clínico', async () => {
    const { fetchMock } = renderTela();
    await screen.findByText('Paciente Fictício 1');

    const chamadas = fetchMock.mock.calls.map(([url]) => url);
    expect(chamadas.filter((url) => /prontuari|evolucao|anamnese|receita/i.test(url))).toEqual([]);
    for (const clinico of [/evolu/i, /anamnese/i, /receita/i, /prontu/i]) {
      expect(screen.queryByText(clinico)).toBeNull();
    }
  });

  it('fila de espera: por ordem, com a espera em andamento', async () => {
    renderTela();

    const itens = await screen.findAllByTestId('item-fila');
    expect(itens).toHaveLength(2);
    expect(itens[0]).toHaveTextContent('Paciente Fictício 3');
    expect(within(itens[0] as HTMLElement).getByTestId('espera-fila')).toHaveTextContent(
      'Espera: 30 min',
    );
    expect(within(itens[1] as HTMLElement).getByTestId('espera-fila')).toHaveTextContent(
      'Espera: 12 min',
    );
    // A coluna Espera do grid usa o mesmo cálculo.
    expect(within(linha('Paciente Fictício 2')).getByText('12 min')).toBeVisible();
    // Quem já entrou: espera fixa entre a chegada e a entrada.
    expect(within(linha('Paciente Fictício 4')).getByText('10 min')).toBeVisible();
  });

  it('fila vazia mostra a mensagem', async () => {
    renderTela({ fila: () => [] });
    expect(await screen.findByText('Ninguém aguardando no momento.')).toBeVisible();
  });

  it('"Chegou" grava o status pela API e refaz a lista e a fila', async () => {
    const { user, fetchMock } = renderTela();
    await screen.findByText('Paciente Fictício 1');
    const antesLista = chamadasPara(fetchMock, API).length;
    const antesFila = chamadasPara(fetchMock, `${API}/fila`).length;

    await user.click(screen.getByRole('button', { name: 'Chegou: Paciente Fictício 1' }));

    await waitFor(() => {
      const patch = chamadasPara(fetchMock, `${API}/${id(1)}/status`).find(
        ([, init]) => init?.method === 'PATCH',
      );
      expect(JSON.parse(String(patch?.[1]?.body))).toEqual({ status: 'CHECK_IN' });
    });
    await waitFor(() => expect(chamadasPara(fetchMock, API).length).toBeGreaterThan(antesLista));
    expect(chamadasPara(fetchMock, `${API}/fila`).length).toBeGreaterThan(antesFila);
  });

  it('"Cancelou" pede confirmação antes de gravar', async () => {
    const { user, fetchMock } = renderTela();
    await screen.findByText('Paciente Fictício 1');

    await user.click(screen.getByRole('button', { name: 'Cancelou: Paciente Fictício 1' }));

    const dialogo = await screen.findByRole('alertdialog');
    expect(within(dialogo).getByText('Cancelar atendimento?')).toBeVisible();
    expect(chamadasPara(fetchMock, `${API}/${id(1)}/status`)).toHaveLength(0);

    await user.click(within(dialogo).getByRole('button', { name: 'Cancelar atendimento' }));

    await waitFor(() => {
      const patch = chamadasPara(fetchMock, `${API}/${id(1)}/status`)[0];
      expect(JSON.parse(String(patch?.[1]?.body))).toEqual({ status: 'CANCELADO' });
    });
  });

  it('atendimento em curso é do médico: botões desabilitados; o status atual também', async () => {
    renderTela();
    await screen.findByText('Paciente Fictício 1');

    for (const status of [
      'Chegou',
      'Aguardando',
      'Faltou',
      'Cancelou',
      'Reagendou',
      'Confirmado',
    ]) {
      expect(screen.getByRole('button', { name: `${status}: Paciente Fictício 4` })).toBeDisabled();
    }
    expect(screen.getByRole('button', { name: 'Chegou: Paciente Fictício 2' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Aguardando: Paciente Fictício 2' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: /Em atendimento: Paciente Fictício/ })).toBeNull();
  });

  it('sem permissão de editar, só acompanha: sem botões de status', async () => {
    renderTela({ permissoes: ['comercial-atendimento.recepcao.ver'] });
    await screen.findByText('Paciente Fictício 1');

    expect(screen.queryByRole('button', { name: /Chegou:/ })).toBeNull();
    expect(screen.queryByRole('columnheader', { name: 'Ações' })).toBeNull();
  });

  it('filtros por profissional e sala vão na consulta', async () => {
    const { fetchMock } = renderTela({
      rota: `/recepcao?profissionalId=${PROFISSIONAL}&salaId=${SALA}&status=CHECK_IN`,
    });
    await screen.findByText('Paciente Fictício 1');

    const consulta = params(chamadasPara(fetchMock, API).at(-1)?.[0] as string);
    expect(consulta).toMatchObject({
      profissionalId: PROFISSIONAL,
      salaId: SALA,
      status: 'CHECK_IN',
    });
  });

  it('atualiza sozinha: agendamento novo aparece sem recarregar a página', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let dados = [item(1)];
    renderTela({ lista: () => dados });
    await screen.findByText('Paciente Fictício 1');
    expect(screen.queryByText('Paciente Fictício 5')).toBeNull();

    dados = [item(1), item(5)];
    await act(() => vi.advanceTimersByTimeAsync(16_000));

    expect(await screen.findByText('Paciente Fictício 5')).toBeVisible();
  });

  it('em inglês, traduz a tela e o vocabulário dos status', async () => {
    renderTela({ idioma: 'en' });

    expect(await screen.findByRole('heading', { name: 'Reception' })).toBeVisible();
    expect(await screen.findByText('Waiting queue')).toBeVisible();
    expect(
      within(linha('Paciente Fictício 2')).getByText('Arrived', { selector: '[data-tom]' }),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Arrived: Paciente Fictício 1' })).toBeVisible();
  });

  it('em espanhol, traduz o título e a fila', async () => {
    renderTela({ idioma: 'es' });

    expect(await screen.findByRole('heading', { name: 'Recepción' })).toBeVisible();
    expect(await screen.findByText('Fila de espera')).toBeVisible();
  });
});
