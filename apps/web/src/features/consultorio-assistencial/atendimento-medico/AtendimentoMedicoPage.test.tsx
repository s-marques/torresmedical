import {
  PERMISSOES,
  type AtendimentoEmCurso,
  type AtendimentoMedicoItem,
  type Evolucao,
  type PacienteDadosAtendimento,
} from '@torres/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { horaLocal, somarDias } from '@/features/comercial-atendimento/agenda/agenda-datas';
import { hojeISO } from '@/lib/datas';
import { apiFalsa, chamadasPara, json, renderApp, USUARIO_TESTE } from '@/test/render-app';

vi.setConfig({ testTimeout: 20_000 });

const API = '/api/consultorio-assistencial/atendimento-medico';
// Dia fixo diferente de hoje: o "Hoje" precisa gerar uma consulta nova.
const DIA = '2026-10-14';
const ID_CONFIRMADO = '00000000-0000-4000-8000-0000000000c1';
const ID_CANCELADO = '00000000-0000-4000-8000-0000000000c2';
const ID_EM_ATENDIMENTO = '00000000-0000-4000-8000-0000000000c3';
const ID_PACIENTE = '00000000-0000-4000-8000-0000000000b1';
const ID_PROFISSIONAL = '00000000-0000-4000-8000-0000000000a1';
const ID_ATENDIMENTO = '00000000-0000-4000-8000-0000000000d1';

function item(
  id: string,
  inicio: string,
  extra: Partial<AtendimentoMedicoItem> = {},
): AtendimentoMedicoItem {
  return {
    id,
    inicio,
    pacienteId: ID_PACIENTE,
    pacienteNome: 'Paciente Fictício',
    profissionalId: ID_PROFISSIONAL,
    profissionalNome: 'Dra. Fictícia',
    procedimento: null,
    status: 'AGENDADO',
    pago: false,
    ...extra,
  };
}

const CONFIRMADO = item(ID_CONFIRMADO, `${DIA}T11:00:00.000Z`, {
  pacienteNome: 'Ana Fictícia',
  procedimento: 'Procedimento',
  status: 'CONFIRMADO',
});
const CANCELADO = item(ID_CANCELADO, `${DIA}T12:00:00.000Z`, {
  pacienteNome: 'Bruno Fictício',
  status: 'CANCELADO',
});
const EM_ATENDIMENTO = item(ID_EM_ATENDIMENTO, `${DIA}T13:00:00.000Z`, {
  pacienteNome: 'Carla Fictícia',
  status: 'EM_ATENDIMENTO',
  pago: true,
});

const ATENDIMENTO: AtendimentoEmCurso = {
  id: ID_ATENDIMENTO,
  agendamentoId: ID_CONFIRMADO,
  status: 'EM_ANDAMENTO',
  iniciadoEm: `${DIA}T11:05:00.000Z`,
  finalizadoEm: null,
};

const EVOLUCAO: Evolucao = {
  id: '00000000-0000-4000-8000-0000000000e1',
  atendimentoId: ID_ATENDIMENTO,
  tipo: 'DIAGNOSTICO',
  texto: 'Texto fictício da evolução',
  profissionalNome: 'Dra. Fictícia',
  createdAt: `${DIA}T11:10:00.000Z`,
};

const DADOS: PacienteDadosAtendimento = {
  id: ID_PACIENTE,
  nome: 'Ana Fictícia',
  documento: '00000000191',
  rg: null,
  dataNascimento: '1980-05-10',
  sexo: 'FEMININO',
  telefone: '11900000000',
  email: 'ana@example.com',
  endereco: 'Rua Fictícia, 10',
  cidade: 'Cidade Teste',
  uf: 'MT',
  observacoes: 'Observação fictícia',
};

function pagina<T>(data: T[], pageSize = 100) {
  return json({ data, meta: { page: 1, pageSize, total: data.length, totalPages: 1 } });
}

const corpoDe = (init?: RequestInit) => JSON.parse(String(init?.body)) as Record<string, unknown>;
const ehPost = (init?: RequestInit) => init?.method === 'POST';

function queryDe(fetchMock: ReturnType<typeof apiFalsa>, caminho = API) {
  const ultima = chamadasPara(fetchMock, caminho).at(-1)?.[0] ?? '';
  return Object.fromEntries(new URLSearchParams(ultima.split('?')[1] ?? ''));
}

/** API falsa com estado: o "Atender" passa a devolver o atendimento no detalhe. */
function api({ evolucoes = [] as Evolucao[], permissoes = [...PERMISSOES] as string[] } = {}) {
  let atendimento: AtendimentoEmCurso | null = null;
  const historico = [...evolucoes];
  return apiFalsa({
    usuario: { ...USUARIO_TESTE, permissoes: permissoes as typeof USUARIO_TESTE.permissoes },
    rotas: {
      [API]: () => pagina([CONFIRMADO, CANCELADO, EM_ATENDIMENTO]),
      [`${API}/${ID_CONFIRMADO}`]: () =>
        json({
          agendamento: atendimento ? { ...CONFIRMADO, status: 'EM_ATENDIMENTO' } : CONFIRMADO,
          atendimento,
        }),
      [`${API}/${ID_CONFIRMADO}/iniciar`]: () => {
        atendimento = ATENDIMENTO;
        return json(ATENDIMENTO, 201);
      },
      [`${API}/${ID_CONFIRMADO}/evolucoes`]: (init) => {
        if (ehPost(init)) {
          const nova = {
            ...EVOLUCAO,
            ...corpoDe(init),
            id: '00000000-0000-4000-8000-0000000000e2',
          };
          historico.unshift(nova as Evolucao);
          return json(nova, 201);
        }
        return pagina(historico);
      },
      [`${API}/${ID_CONFIRMADO}/paciente`]: () => json(DADOS),
      '/api/lookups/profissionais': () =>
        json({
          data: [{ id: ID_PROFISSIONAL, label: 'Dra. Fictícia', descricao: null }],
          meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
        }),
    },
  });
}

function renderTela(caminho = `/atendimento-medico?data=${DIA}`, fetchMock = api()) {
  return { user: userEvent.setup(), ...renderApp(caminho, fetchMock) };
}

async function linhaDe(nome: string) {
  const celula = await screen.findByText(nome);
  return celula.closest('tr') as HTMLElement;
}

describe('Atendimento Médico (/atendimento-medico)', () => {
  it('lista os agendamentos do dia com hora, status, pagamento e contador', async () => {
    const { fetchMock } = renderTela();

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Atendimento Médico' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Gerencie os atendimentos do dia. Clique em um agendamento para iniciar.'),
    ).toBeVisible();

    const linha = await linhaDe('Ana Fictícia');
    expect(within(linha).getByText(horaLocal(CONFIRMADO.inicio))).toBeVisible();
    expect(within(linha).getByText('Dra. Fictícia')).toBeVisible();
    expect(within(linha).getByText('Procedimento')).toBeVisible();
    expect(within(linha).getByText('Confirmado')).toBeVisible();
    expect(within(linha).getByText('Não Pago')).toBeVisible();
    expect(within(await linhaDe('Carla Fictícia')).getByText('Pago')).toBeVisible();

    const cabecalhos = screen.getAllByRole('columnheader').map((th) => th.textContent);
    expect(cabecalhos).toEqual([
      'Hora',
      'Paciente',
      'Profissional',
      'Procedimento',
      'Status',
      'Pgto',
      'Ações',
    ]);
    expect(screen.getByText(/14\/10\/2026 -/).textContent).toMatch(/3\s*atendimento\(s\)/);
    expect(queryDe(fetchMock)).toMatchObject({ data: DIA, pageSize: '100' });
  });

  it('cancelado: sem pagamento e "Atender" desabilitado', async () => {
    renderTela();
    const linha = await linhaDe('Bruno Fictício');
    expect(within(linha).getByText('Cancelado')).toBeVisible();
    expect(within(linha).queryByText('Não Pago')).not.toBeInTheDocument();
    expect(within(linha).getByRole('button', { name: 'Atender Bruno Fictício' })).toBeDisabled();
  });

  it('navega pelos dias: anterior, próximo, data e "Hoje"', async () => {
    const { user, fetchMock } = renderTela();
    await linhaDe('Ana Fictícia');

    await user.click(screen.getByRole('button', { name: 'Próximo dia' }));
    await waitFor(() => expect(queryDe(fetchMock).data).toBe(somarDias(DIA, 1)));

    await user.click(screen.getByRole('button', { name: 'Dia anterior' }));
    await user.click(screen.getByRole('button', { name: 'Dia anterior' }));
    await waitFor(() => expect(queryDe(fetchMock).data).toBe(somarDias(DIA, -1)));

    await user.click(screen.getByRole('button', { name: 'Hoje' }));
    await waitFor(() => expect(queryDe(fetchMock).data).toBe(hojeISO()));
    expect(screen.getByLabelText('Data')).toHaveValue(hojeISO());
  });

  it('envia o filtro de status e de profissional da URL', async () => {
    const { fetchMock } = renderTela(
      `/atendimento-medico?data=${DIA}&status=AGUARDANDO&profissionalId=${ID_PROFISSIONAL}`,
    );
    await linhaDe('Ana Fictícia');
    expect(queryDe(fetchMock)).toMatchObject({
      data: DIA,
      status: 'AGUARDANDO',
      profissionalId: ID_PROFISSIONAL,
    });
  });

  it('"Atender" inicia o atendimento e abre o detalhe com a evolução', async () => {
    const { user, fetchMock } = renderTela();

    await user.click(
      within(await linhaDe('Ana Fictícia')).getByRole('button', { name: 'Atender Ana Fictícia' }),
    );

    expect(chamadasPara(fetchMock, `${API}/${ID_CONFIRMADO}/iniciar`)).toHaveLength(1);
    expect(await screen.findByRole('heading', { level: 2, name: 'Ana Fictícia' })).toBeVisible();
    expect(screen.getByText(/Procedimento - .* \| Dr\(a\)\. Dra\. Fictícia/)).toBeVisible();
    expect(await screen.findByText('Nova Evolução')).toBeVisible();
    expect(screen.getByText('Em Atendimento')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Iniciar Atendimento' })).not.toBeInTheDocument();
  });

  it('em atendimento: "Atender" só abre o detalhe, sem iniciar de novo', async () => {
    const { user, fetchMock } = renderTela();
    await user.click(
      within(await linhaDe('Carla Fictícia')).getByRole('button', {
        name: 'Atender Carla Fictícia',
      }),
    );
    await waitFor(() =>
      expect(chamadasPara(fetchMock, `${API}/${ID_EM_ATENDIMENTO}`).length).toBeGreaterThan(0),
    );
    expect(chamadasPara(fetchMock, `${API}/${ID_EM_ATENDIMENTO}/iniciar`)).toHaveLength(0);
  });

  it('clique na linha abre o detalhe sem iniciar; "Iniciar Atendimento" inicia', async () => {
    const { user, fetchMock } = renderTela();

    await user.click(await screen.findByText('Ana Fictícia'));
    expect(await screen.findByText('Inicie o atendimento primeiro')).toBeVisible();
    expect(chamadasPara(fetchMock, `${API}/${ID_CONFIRMADO}/iniciar`)).toHaveLength(0);

    await user.click(screen.getByRole('button', { name: 'Iniciar Atendimento' }));
    expect(await screen.findByText('Nova Evolução')).toBeVisible();
    expect(chamadasPara(fetchMock, `${API}/${ID_CONFIRMADO}/iniciar`)).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: 'Voltar' }));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Atendimento Médico' }),
    ).toBeVisible();
  });

  it('evolução: valida o texto, salva com o tipo e mostra no histórico', async () => {
    const { user, fetchMock } = renderTela(`/atendimento-medico?agendamento=${ID_CONFIRMADO}`);
    await user.click(await screen.findByRole('button', { name: 'Iniciar Atendimento' }));
    expect(await screen.findByText('Nenhuma evolução registrada')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Salvar Evolução' }));
    expect(await screen.findByText('Evolução é obrigatória.')).toBeVisible();

    await user.click(screen.getByRole('combobox', { name: 'Tipo' }));
    await user.click(await screen.findByRole('option', { name: 'Diagnóstico' }));
    await user.type(screen.getByRole('textbox', { name: /Evolução/ }), 'Hipótese fictícia');
    expect(screen.getByText('17 caracteres')).toBeVisible();
    await user.keyboard('{Control>}{Enter}{/Control}');

    await waitFor(() => {
      const post = chamadasPara(fetchMock, `${API}/${ID_CONFIRMADO}/evolucoes`).find(([, init]) =>
        ehPost(init),
      );
      expect(corpoDe(post?.[1])).toEqual({ tipo: 'DIAGNOSTICO', texto: 'Hipótese fictícia' });
    });
    const lista = await screen.findByRole('list', { name: 'Evoluções' });
    expect(within(lista).getByText('Hipótese fictícia')).toBeVisible();
    expect(within(lista).getByText('Diagnóstico')).toBeVisible();
  });

  it('"Receitas" e "Solic. Exames" abrem a lista vazia', async () => {
    const { user } = renderTela(`/atendimento-medico?agendamento=${ID_CONFIRMADO}`);
    await user.click(await screen.findByRole('button', { name: 'Iniciar Atendimento' }));

    await user.click(await screen.findByRole('button', { name: 'Receitas' }));
    expect(await screen.findByText('Nenhuma receita cadastrada.')).toBeVisible();
    await user.keyboard('{Escape}');

    await user.click(screen.getByRole('button', { name: 'Solic. Exames' }));
    expect(await screen.findByText('Nenhuma solicitação de exame cadastrada.')).toBeVisible();
  });

  it('aba Dados mostra informações pessoais, contato e observações', async () => {
    const { user } = renderTela(`/atendimento-medico?agendamento=${ID_CONFIRMADO}`);

    await user.click(await screen.findByRole('tab', { name: 'Dados' }));
    expect(await screen.findByText('Informações Pessoais')).toBeVisible();
    expect(screen.getByText('000.000.001-91')).toBeVisible();
    expect(screen.getByText('Feminino')).toBeVisible();
    expect(screen.getByText('ana@example.com')).toBeVisible();
    expect(screen.getByText('Rua Fictícia, 10')).toBeVisible();
    expect(screen.getByText('Cidade Teste/MT')).toBeVisible();
    expect(screen.getByText('Observação fictícia')).toBeVisible();
  });

  it('sem permissão de criar: não mostra "Atender" para iniciar nem "Iniciar Atendimento"', async () => {
    const fetchMock = api({
      evolucoes: [EVOLUCAO],
      permissoes: ['consultorio-assistencial.atendimento-medico.ver'],
    });
    renderTela(`/atendimento-medico?data=${DIA}`, fetchMock);

    const linha = await linhaDe('Ana Fictícia');
    expect(within(linha).queryByRole('button', { name: /Atender/ })).not.toBeInTheDocument();
    expect(
      within(await linhaDe('Carla Fictícia')).getByRole('button', { name: /Atender/ }),
    ).toBeEnabled();

    await userEvent.setup().click(screen.getByText('Ana Fictícia'));
    expect(await screen.findByText('Inicie o atendimento primeiro')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Iniciar Atendimento' })).not.toBeInTheDocument();
  });
});
