import { PERMISSOES, type Evolucao, type EvolucaoVozAgendamento } from '@torres/shared';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { hojeISO } from '@/lib/datas';
import { apiFalsa, chamadasPara, json, renderApp, USUARIO_TESTE } from '@/test/render-app';

vi.setConfig({ testTimeout: 20_000 });

const API = '/api/consultorio-assistencial/evolucao-voz';
const ID_ANA = '00000000-0000-4000-8000-0000000000c1';
const ID_BRUNO = '00000000-0000-4000-8000-0000000000c2';
const ID_PROFISSIONAL = '00000000-0000-4000-8000-0000000000a1';

function agendamento(id: string, extra: Partial<EvolucaoVozAgendamento> = {}) {
  return {
    id,
    numero: 1422,
    inicio: `${hojeISO()}T11:00:00.000Z`,
    pacienteId: '00000000-0000-4000-8000-0000000000b1',
    pacienteNome: 'Ana Fictícia',
    profissionalId: ID_PROFISSIONAL,
    profissionalNome: 'Dra. Fictícia',
    procedimento: 'Consulta',
    status: 'CONFIRMADO',
    pago: false,
    ...extra,
  } satisfies EvolucaoVozAgendamento;
}

const ANA = agendamento(ID_ANA);
const BRUNO = agendamento(ID_BRUNO, {
  numero: 1423,
  pacienteNome: 'Bruno Fictício',
  procedimento: 'Procedimento',
  status: 'AGENDADO',
});

function pagina<T>(data: T[]) {
  return json({ data, meta: { page: 1, pageSize: 100, total: data.length, totalPages: 1 } });
}

const queryDe = (fetchMock: ReturnType<typeof apiFalsa>, caminho = API) => {
  const ultima = chamadasPara(fetchMock, caminho).at(-1)?.[0] ?? '';
  return Object.fromEntries(new URLSearchParams(ultima.split('?')[1] ?? ''));
};

function api({ permissoes = [...PERMISSOES] as string[] } = {}) {
  const historico: Evolucao[] = [];
  return apiFalsa({
    usuario: { ...USUARIO_TESTE, permissoes: permissoes as typeof USUARIO_TESTE.permissoes },
    rotas: {
      [API]: () => pagina([ANA, BRUNO]),
      [`${API}/${ID_ANA}`]: () => json(ANA),
      [`${API}/${ID_ANA}/evolucoes`]: (init) => {
        if (init?.method === 'POST') {
          const corpo = JSON.parse(String(init.body)) as { texto: string };
          const nova: Evolucao = {
            id: '00000000-0000-4000-8000-0000000000e1',
            atendimentoId: '00000000-0000-4000-8000-0000000000d1',
            tipo: 'EVOLUCAO',
            texto: corpo.texto,
            profissionalNome: 'Dra. Fictícia',
            createdAt: `${hojeISO()}T11:10:00.000Z`,
          };
          historico.unshift(nova);
          return json(nova, 201);
        }
        return pagina(historico);
      },
      '/api/lookups/profissionais': () =>
        json({
          data: [{ id: ID_PROFISSIONAL, label: 'Dra. Fictícia', descricao: null }],
          meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
        }),
    },
  });
}

/** Reconhecimento de voz falso: o teste "fala" chamando `falar`. */
class ReconhecimentoFalso {
  static ultimo: ReconhecimentoFalso | null = null;
  lang = '';
  continuous = false;
  interimResults = false;
  onresult: ((evento: unknown) => void) | null = null;
  onerror: ((evento: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  start = vi.fn();
  stop = vi.fn(() => this.onend?.());
  abort = vi.fn();

  constructor() {
    ReconhecimentoFalso.ultimo = this;
  }

  falar(transcript: string, isFinal = true) {
    act(() =>
      this.onresult?.({
        resultIndex: 0,
        results: { length: 1, 0: Object.assign([{ transcript }], { isFinal }) },
      }),
    );
  }
}

function comMicrofone() {
  vi.stubGlobal('webkitSpeechRecognition', ReconhecimentoFalso);
}

afterEach(() => {
  vi.unstubAllGlobals();
  ReconhecimentoFalso.ultimo = null;
});

function renderTela(caminho = '/evolucoes', fetchMock = api()) {
  return { user: userEvent.setup(), ...renderApp(caminho, fetchMock) };
}

async function abrirSessao() {
  comMicrofone();
  const tela = renderTela(`/evolucoes?agendamento=${ID_ANA}`);
  expect(await screen.findByText('Dra. Fictícia — Agendamento #1422')).toBeVisible();
  return tela;
}

describe('Evolução por Voz (/evolucoes)', () => {
  it('lista os agendamentos de hoje com profissional, procedimento e status', async () => {
    const { fetchMock } = renderTela();

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Evolução por Voz' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Grave a consulta, transcreva em tempo real e gere resumo com IA.'),
    ).toBeVisible();
    expect(screen.getByText('Agendamentos de Hoje')).toBeVisible();

    const linha = await screen.findByRole('button', { name: 'Gravar evolução de Ana Fictícia' });
    expect(within(linha).getByText('Dra. Fictícia — Consulta')).toBeVisible();
    expect(within(linha).getByText('Confirmado')).toBeVisible();
    expect(
      within(screen.getByRole('button', { name: 'Gravar evolução de Bruno Fictício' })).getByText(
        'Agendado',
      ),
    ).toBeVisible();
    expect(queryDe(fetchMock)).toMatchObject({ data: hojeISO(), pageSize: '100' });
  });

  it('"Buscar paciente" mostra Paciente e Profissional e filtra a lista', async () => {
    const { user, fetchMock } = renderTela();
    await screen.findByRole('button', { name: 'Gravar evolução de Ana Fictícia' });
    expect(screen.queryByLabelText('Paciente')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Buscar paciente' }));
    expect(screen.getByLabelText('Profissional')).toBeVisible();
    await user.type(screen.getByLabelText('Paciente'), 'bru');

    await waitFor(() => expect(queryDe(fetchMock).search).toBe('bru'));
  });

  it('abre a sessão do agendamento e "Trocar paciente" volta para a lista', async () => {
    comMicrofone();
    const { user } = renderTela();

    await user.click(
      await screen.findByRole('button', { name: 'Gravar evolução de Ana Fictícia' }),
    );
    expect(await screen.findByText('Dra. Fictícia — Agendamento #1422')).toBeVisible();
    expect(screen.getByText('Ana Fictícia')).toBeVisible();
    expect(screen.getByLabelText('Tempo de gravação')).toHaveTextContent('00:00');
    expect(screen.getByLabelText('Transcrição')).toHaveAttribute(
      'placeholder',
      'Inicie a gravação para transcrever a consulta...',
    );
    expect(screen.getByRole('button', { name: 'Salvar Evolução' })).toBeDisabled();
    expect(
      await screen.findByText('Nenhuma evolução registrada para este paciente.'),
    ).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Trocar paciente' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(await screen.findByText('Agendamentos de Hoje')).toBeVisible();
  });

  it('grava em pt-BR, mostra o trecho parcial e acrescenta os trechos finais', async () => {
    const { user } = await abrirSessao();

    await user.click(screen.getByRole('button', { name: 'Iniciar Gravação' }));
    const rec = ReconhecimentoFalso.ultimo as ReconhecimentoFalso;
    expect(rec.start).toHaveBeenCalled();
    expect(rec).toMatchObject({ lang: 'pt-BR', continuous: true, interimResults: true });
    expect(screen.getByText('Gravando')).toBeVisible();

    rec.falar('paciente relata', false);
    expect(screen.getByText('paciente relata…')).toBeVisible();
    rec.falar('Paciente relata melhora.');
    rec.falar(' Sem dor. ');
    expect(screen.getByLabelText('Transcrição')).toHaveValue('Paciente relata melhora. Sem dor.');
    expect(screen.queryByText('paciente relata…')).not.toBeInTheDocument();

    // O navegador encerra depois de um silêncio: a gravação reinicia sozinha.
    act(() => rec.onend?.());
    expect(rec.start).toHaveBeenCalledTimes(2);

    await user.click(screen.getByRole('button', { name: 'Parar Gravação' }));
    expect(rec.stop).toHaveBeenCalled();
    expect(rec.start).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('button', { name: 'Iniciar Gravação' })).toBeVisible();
  });

  it('"Salvar Evolução" envia a transcrição, limpa o campo e atualiza o histórico', async () => {
    const { user, fetchMock } = await abrirSessao();

    await user.type(screen.getByLabelText('Transcrição'), 'Paciente estável.');
    await user.click(screen.getByRole('button', { name: 'Salvar Evolução' }));

    await waitFor(() =>
      expect(
        chamadasPara(fetchMock, `${API}/${ID_ANA}/evolucoes`).some(
          ([, init]) => init?.method === 'POST',
        ),
      ).toBe(true),
    );
    const post = chamadasPara(fetchMock, `${API}/${ID_ANA}/evolucoes`).find(
      ([, init]) => init?.method === 'POST',
    );
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({ texto: 'Paciente estável.' });
    expect(await screen.findByText('Evolução salva.')).toBeVisible();
    await waitFor(() => expect(screen.getByLabelText('Transcrição')).toHaveValue(''));
    const historico = await screen.findByRole('list', { name: 'Evoluções do paciente' });
    expect(within(historico).getByText('Paciente estável.')).toBeVisible();
    expect(within(historico).getByText('Evolução/Anotação')).toBeVisible();
  });

  it('"Limpar gravação" pede confirmação quando há texto', async () => {
    const { user } = await abrirSessao();
    await user.type(screen.getByLabelText('Transcrição'), 'Rascunho');

    await user.click(screen.getByRole('button', { name: 'Limpar gravação' }));
    const dialogo = await screen.findByRole('alertdialog', { name: 'Descartar a transcrição?' });
    await user.click(within(dialogo).getByRole('button', { name: 'Cancelar' }));
    expect(screen.getByLabelText('Transcrição')).toHaveValue('Rascunho');

    await user.click(screen.getByRole('button', { name: 'Limpar gravação' }));
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Descartar' }),
    );
    await waitFor(() => expect(screen.getByLabelText('Transcrição')).toHaveValue(''));
  });

  it('"Trocar paciente" com texto pede confirmação antes de sair', async () => {
    const { user } = await abrirSessao();
    await user.type(screen.getByLabelText('Transcrição'), 'Rascunho');

    await user.click(screen.getByRole('button', { name: 'Trocar paciente' }));
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Descartar' }),
    );
    expect(await screen.findByText('Agendamentos de Hoje')).toBeVisible();
  });

  it('avisa quando o microfone é bloqueado', async () => {
    const { user } = await abrirSessao();
    await user.click(screen.getByRole('button', { name: 'Iniciar Gravação' }));

    act(() => ReconhecimentoFalso.ultimo?.onerror?.({ error: 'not-allowed' }));

    expect(screen.getByText('Permita o acesso ao microfone para gravar a consulta.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Iniciar Gravação' })).toBeVisible();
  });

  it('navegador sem reconhecimento de voz: gravação indisponível, texto editável', async () => {
    renderTela(`/evolucoes?agendamento=${ID_ANA}`);

    expect(
      await screen.findByText(
        'Seu navegador não permite transcrição por voz. Use o Google Chrome ou o Microsoft Edge.',
      ),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Iniciar Gravação' })).toBeDisabled();
    expect(screen.getByLabelText('Transcrição')).toBeEnabled();
  });

  it('sem permissão de criar, mostra só o histórico', async () => {
    renderTela(
      `/evolucoes?agendamento=${ID_ANA}`,
      api({ permissoes: ['consultorio-assistencial.evolucao-voz.ver'] }),
    );

    expect(await screen.findByText('Você não tem permissão para gravar evoluções.')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Iniciar Gravação' })).not.toBeInTheDocument();
    expect(screen.getByText('Histórico')).toBeVisible();
  });
});
