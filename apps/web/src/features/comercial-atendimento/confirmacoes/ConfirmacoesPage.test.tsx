import {
  CONFIRMACAO_CONFIG_PADRAO,
  PERMISSOES,
  type Confirmacao,
  type ConfirmacaoConfig,
  type ConfirmacaoHistorico,
  type ConfirmacaoModelo,
} from '@torres/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { apiFalsa, chamadasPara, json, renderApp, USUARIO_TESTE } from '@/test/render-app';
import { hojeIso } from './formatar';

vi.setConfig({ testTimeout: 20_000 });

const API = '/api/comercial-atendimento/confirmacoes';
const C1 = '00000000-0000-4000-8000-0000000000f1';
const C2 = '00000000-0000-4000-8000-0000000000f2';
const M1 = '00000000-0000-4000-8000-0000000000a1';
const TIPO = '00000000-0000-4000-8000-0000000000b1';

function confirmacao(parcial: Partial<Confirmacao> = {}): Confirmacao {
  return {
    id: C1,
    numero: 10,
    enviadoEm: null,
    inicio: '2026-11-18T23:00:00.000Z',
    tipo: 'Consulta',
    paciente: 'Ana Fictícia',
    telefone: '65900000001',
    profissional: 'Dr. Fictício',
    envios: [],
    status: 'PENDENTE',
    ...parcial,
  };
}

const CONFIRMACOES = [
  confirmacao(),
  confirmacao({
    id: C2,
    numero: 11,
    paciente: 'Bia Fictícia',
    tipo: null,
    enviadoEm: '2026-11-17T13:15:00.000Z',
    envios: [{ etapa: 'MSG1', status: 'ENVIADO', enviadoEm: '2026-11-17T13:15:00.000Z' }],
    status: 'CONFIRMADO',
  }),
];

const HISTORICO: ConfirmacaoHistorico[] = [
  {
    id: C1,
    agendamentoNumero: 767,
    etapa: 'MSG1',
    status: 'FALHA',
    erro: 'SEM_CANAL',
    ocorridoEm: '2026-11-17T11:15:00.000Z',
  },
  {
    id: C2,
    agendamentoNumero: 768,
    etapa: 'MSG2',
    status: 'ENVIADO',
    erro: null,
    ocorridoEm: '2026-11-17T15:00:00.000Z',
  },
];

const CONFIG: ConfirmacaoConfig = { ...CONFIRMACAO_CONFIG_PADRAO, atualizadoEm: null };
const MODELO: ConfirmacaoModelo = {
  id: M1,
  tipoAgendamentoId: TIPO,
  tipo: 'Consulta',
  msg1: 'Olá {nome}, sua consulta',
  msg2: 'Ainda não confirmou',
  msg3: 'Última tentativa',
  lembreteConfirmado: 'Bom dia',
  lembreteNaoConfirmado: 'Você tem consulta hoje',
};

const RESUMO = { pendentes: 7, msg1: 3, msg2: 2, msg3: 1 };

function pagina<T>(data: T[]) {
  return json({ data, meta: { page: 1, pageSize: 10, total: data.length, totalPages: 1 } });
}

type Corpo = Record<string, unknown>;
type Escrita = { metodo: string; caminho: string; corpo: Corpo | undefined };
const params = (url: string) => Object.fromEntries(new URL(url, 'http://x').searchParams);

function api(opcoes: Parameters<typeof apiFalsa>[0] = {}, modelos: ConfirmacaoModelo[] = [MODELO]) {
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
      [API]: () => pagina(CONFIRMACOES),
      [`${API}/resumo`]: () => json(RESUMO),
      [`${API}/historico`]: () => pagina(HISTORICO),
      [`${API}/configuracao`]: (init) =>
        init?.method === 'PUT' ? escrever(`${API}/configuracao`, CONFIG)(init) : json(CONFIG),
      [`${API}/modelos`]: (init) =>
        init?.method === 'POST' ? escrever(`${API}/modelos`, MODELO)(init) : json(modelos),
      [`${API}/modelos/${M1}`]: escrever(`${API}/modelos/${M1}`, MODELO),
      [`${API}/${C1}/enviar`]: escrever(`${API}/${C1}/enviar`, confirmacao()),
      [`${API}/${C1}/confirmar`]: escrever(`${API}/${C1}/confirmar`, confirmacao()),
      [`${API}/${C1}/cancelar`]: escrever(`${API}/${C1}/cancelar`, confirmacao()),
      '/api/lookups/tipos-agendamento': () =>
        json({
          data: [{ id: TIPO, label: 'Consulta' }],
          meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
        }),
      [`/api/lookups/tipos-agendamento/${TIPO}`]: () => json({ id: TIPO, label: 'Consulta' }),
      ...opcoes.rotas,
    },
  });
  return { fetchMock, escritas };
}

function renderTela(opcoes?: Parameters<typeof api>[0], modelos?: ConfirmacaoModelo[]) {
  const { fetchMock, escritas } = api(opcoes, modelos);
  return {
    user: userEvent.setup(),
    escritas,
    ...renderApp('/confirmacoes', fetchMock),
    fetchMock,
  };
}

describe('Confirmações (/confirmacoes)', () => {
  it('mostra título, filtro de data, cartões e as três abas', async () => {
    renderTela();

    expect(await screen.findByRole('heading', { name: 'Confirmacoes de Agenda' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Atualizar' })).toBeVisible();
    expect(screen.getByLabelText('Data de envio:')).toHaveValue(hojeIso());
    expect(screen.getByRole('button', { name: 'Hoje' })).toBeVisible();

    const resumo = screen.getByTestId('resumo-confirmacoes');
    await waitFor(() => expect(within(resumo).getByText('7')).toBeVisible());
    for (const [rotulo, valor] of [
      ['Pendentes', '7'],
      ['MSG1 Enviada', '3'],
      ['MSG2 Enviada', '2'],
      ['MSG3 Enviada', '1'],
    ] as const) {
      expect(within(resumo).getByText(rotulo).closest('div.rounded-lg')).toHaveTextContent(
        `${rotulo}${valor}`,
      );
    }
    for (const aba of ['Pendentes', 'Historico', 'Modelos e Config']) {
      expect(screen.getByRole('tab', { name: aba })).toBeVisible();
    }
  });

  it('Pendentes: colunas, busca, Colunas, Exportar e dados da linha', async () => {
    renderTela();
    await screen.findByText('Ana Fictícia');

    const cabecalhos = within(await screen.findByRole('table')).getAllByRole('columnheader');
    expect(cabecalhos.map((c) => c.textContent)).toEqual([
      'Enviado em',
      'Agendamento',
      'Paciente',
      'Profissional',
      'Confirmações Enviadas',
      'Status',
      'Acoes',
    ]);
    expect(screen.getByPlaceholderText('Buscar paciente...')).toBeVisible();
    expect(screen.getByRole('button', { name: /Colunas/ })).toBeVisible();
    expect(screen.getByRole('button', { name: /Exportar/ })).toBeVisible();

    const pendente = screen.getByText('Ana Fictícia').closest('tr')!;
    expect(pendente).toHaveTextContent('Não enviado');
    expect(pendente).toHaveTextContent('Consulta');
    expect(pendente).toHaveTextContent('65900000001');
    expect(pendente).toHaveTextContent('Pendente');
    const confirmada = screen.getByText('Bia Fictícia').closest('tr')!;
    expect(confirmada).toHaveTextContent('Confirmado');
    expect(confirmada).toHaveTextContent('M1:');
    expect(screen.getByText('2 linha(s) no total.')).toBeVisible();
  });

  it('manda a data de envio, o texto da busca e a ordenação para a API', async () => {
    const { user, fetchMock } = renderTela();
    await screen.findByText('Ana Fictícia');
    expect(params(chamadasPara(fetchMock, API).at(-1)?.[0] ?? '')).toMatchObject({
      page: '1',
      pageSize: '10',
      dataEnvio: hojeIso(),
    });

    const data = screen.getByLabelText('Data de envio:');
    await user.clear(data);
    await user.type(data, '2026-10-15');
    await waitFor(() =>
      expect(params(chamadasPara(fetchMock, API).at(-1)?.[0] ?? '')).toMatchObject({
        dataEnvio: '2026-10-15',
      }),
    );
    await waitFor(() =>
      expect(params(chamadasPara(fetchMock, `${API}/resumo`).at(-1)?.[0] ?? '')).toEqual({
        dataEnvio: '2026-10-15',
      }),
    );

    await user.click(screen.getByRole('button', { name: 'Paciente' }));
    await waitFor(() =>
      expect(params(chamadasPara(fetchMock, API).at(-1)?.[0] ?? '')).toMatchObject({
        sort: 'paciente:asc',
      }),
    );

    await user.click(screen.getByRole('button', { name: 'Hoje' }));
    expect(screen.getByLabelText('Data de envio:')).toHaveValue(hojeIso());
  });

  it('Atualizar recarrega a listagem e os cartões', async () => {
    const { user, fetchMock } = renderTela();
    await screen.findByText('Ana Fictícia');
    const antes = chamadasPara(fetchMock, API).length;
    await user.click(screen.getByRole('button', { name: 'Atualizar' }));
    await waitFor(() => expect(chamadasPara(fetchMock, API).length).toBeGreaterThan(antes));
  });

  it('Enviar confirmacao: chama a API direto, sem diálogo', async () => {
    const { user, escritas } = renderTela();
    const linha = (await screen.findByText('Ana Fictícia')).closest('tr')!;
    await user.click(within(linha).getByRole('button', { name: 'Enviar confirmacao' }));
    await waitFor(() =>
      expect(escritas).toContainEqual({
        metodo: 'POST',
        caminho: `${API}/${C1}/enviar`,
        corpo: undefined,
      }),
    );
  });

  it('Confirmar abre o diálogo e só grava ao confirmar', async () => {
    const { user, escritas } = renderTela();
    const linha = (await screen.findByText('Ana Fictícia')).closest('tr')!;
    await user.click(within(linha).getByRole('button', { name: 'Confirmar' }));

    const dialogo = await screen.findByRole('alertdialog', { name: 'Confirmar Agendamento' });
    expect(dialogo).toHaveTextContent('Confirmar o agendamento de Ana Fictícia em 18/11/2026');
    expect(escritas).toEqual([]);
    await user.click(within(dialogo).getByRole('button', { name: 'Confirmar' }));
    await waitFor(() =>
      expect(escritas).toEqual([
        { metodo: 'POST', caminho: `${API}/${C1}/confirmar`, corpo: undefined },
      ]),
    );
  });

  it('Cancelar: "Cancelar" do diálogo só fecha; o vermelho grava', async () => {
    const { user, escritas } = renderTela();
    const linha = (await screen.findByText('Ana Fictícia')).closest('tr')!;
    await user.click(within(linha).getByRole('button', { name: 'Cancelar' }));

    let dialogo = await screen.findByRole('alertdialog', { name: 'Cancelar Agendamento' });
    expect(dialogo).toHaveTextContent('Cancelar o agendamento de Ana Fictícia em 18/11/2026');
    const [fechar, confirmar] = within(dialogo).getAllByRole('button', { name: 'Cancelar' });
    await user.click(fechar!);
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(escritas).toEqual([]);

    await user.click(within(linha).getByRole('button', { name: 'Cancelar' }));
    dialogo = await screen.findByRole('alertdialog', { name: 'Cancelar Agendamento' });
    const botoes = within(dialogo).getAllByRole('button', { name: 'Cancelar' });
    await user.click(botoes[1] ?? confirmar!);
    await waitFor(() =>
      expect(escritas).toEqual([
        { metodo: 'POST', caminho: `${API}/${C1}/cancelar`, corpo: undefined },
      ]),
    );
  });

  it('ações da linha desabilitadas para confirmado; some sem permissão de editar', async () => {
    renderTela();
    const confirmada = (await screen.findByText('Bia Fictícia')).closest('tr')!;
    expect(within(confirmada).getByRole('button', { name: 'Enviar confirmacao' })).toBeDisabled();
    expect(within(confirmada).getByRole('button', { name: 'Confirmar' })).toBeDisabled();
    expect(within(confirmada).getByRole('button', { name: 'Cancelar' })).toBeEnabled();
  });

  it('sem permissão de editar não mostra as ações da linha', async () => {
    renderTela({
      usuario: {
        ...USUARIO_TESTE,
        permissoes: PERMISSOES.filter((p) => p !== 'comercial-atendimento.confirmacoes.editar'),
      },
    });
    const linha = (await screen.findByText('Ana Fictícia')).closest('tr')!;
    expect(within(linha).queryByRole('button', { name: 'Confirmar' })).not.toBeInTheDocument();
  });

  it('Histórico: lista os envios com o resultado', async () => {
    const { user } = renderTela();
    await user.click(await screen.findByRole('tab', { name: 'Historico' }));
    expect(await screen.findByText('Historico de Confirmacoes')).toBeVisible();
    const falha = (await screen.findByText('Agendamento #767')).closest('tr')!;
    expect(falha).toHaveTextContent('whatsapp - falha_canal');
    expect(falha).toHaveTextContent('MSG1');
    const ok = screen.getByText('Agendamento #768').closest('tr')!;
    expect(ok).toHaveTextContent('whatsapp - enviado');
  });

  it('Modelos e Config: mostra a configuração e salva', async () => {
    const { user, escritas } = renderTela();
    await user.click(await screen.findByRole('tab', { name: 'Modelos e Config' }));

    expect(await screen.findByText('Configuração Geral')).toBeVisible();
    expect(await screen.findByLabelText('MSG 1')).toHaveValue('08:00');
    expect(screen.getByLabelText('Lembrete (dia)')).toHaveValue('07:00');
    expect(screen.getByLabelText('Não Confirmou')).toHaveValue('09:00');
    expect(screen.getByLabelText(/Mensagem ao Criar Agendamento/)).toHaveValue(
      CONFIRMACAO_CONFIG_PADRAO.mensagemCriacao,
    );

    await user.click(screen.getByRole('button', { name: 'Salvar Configuração' }));
    await waitFor(() => expect(escritas).toHaveLength(1));
    expect(escritas[0]).toMatchObject({
      metodo: 'PUT',
      caminho: `${API}/configuracao`,
      corpo: { ativo: true, antecedenciaDias: 1, horarioMsg1: '08:00' },
    });
  });

  it('Modelos e Config: valida os textos obrigatórios da configuração', async () => {
    const { user, escritas } = renderTela();
    await user.click(await screen.findByRole('tab', { name: 'Modelos e Config' }));
    const campo = await screen.findByLabelText(/Resposta a quem CONFIRMA/);
    await user.clear(campo);
    await user.click(screen.getByRole('button', { name: 'Salvar Configuração' }));
    expect(await screen.findByText('A resposta a quem confirma é obrigatório.')).toBeVisible();
    expect(escritas).toEqual([]);
  });

  it('Modelos por tipo: lista, cria, edita e exclui com confirmação', async () => {
    const { user, escritas } = renderTela();
    await user.click(await screen.findByRole('tab', { name: 'Modelos e Config' }));

    const cartao = await screen.findByRole('article', { name: 'Modelo Consulta' });
    expect(cartao).toHaveTextContent('Olá {nome}, sua consulta');
    expect(cartao).toHaveTextContent('Lembrete (não confirmou)');

    // Novo Modelo: formulário vazio mostra as mensagens obrigatórias.
    await user.click(screen.getByRole('button', { name: 'Novo Modelo' }));
    const modal = await screen.findByRole('dialog', { name: 'Novo Modelo' });
    await user.click(within(modal).getByRole('button', { name: 'Criar Modelo' }));
    expect(await within(modal).findByText('A MSG1 é obrigatório.')).toBeVisible();
    expect(escritas).toEqual([]);
    await user.click(within(modal).getByRole('button', { name: 'Cancelar' }));

    // Editar.
    await user.click(within(cartao).getByRole('button', { name: 'Editar' }));
    const edicao = await screen.findByRole('dialog', { name: 'Editar Modelo' });
    const msg1 = within(edicao).getByLabelText(/^MSG1/);
    await user.clear(msg1);
    await user.type(msg1, 'Novo texto');
    await user.click(within(edicao).getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(escritas).toHaveLength(1));
    expect(escritas[0]).toMatchObject({
      metodo: 'PATCH',
      caminho: `${API}/modelos/${M1}`,
      corpo: { tipoAgendamentoId: TIPO, msg1: 'Novo texto' },
    });

    // Excluir.
    await user.click(within(cartao).getByRole('button', { name: 'Excluir' }));
    const dialogo = await screen.findByRole('alertdialog', { name: 'Excluir Modelo' });
    await user.click(within(dialogo).getByRole('button', { name: 'Excluir' }));
    await waitFor(() => expect(escritas.at(-1)).toMatchObject({ metodo: 'DELETE' }));
  });

  it('Modelos por tipo: sem modelos mostra o estado vazio', async () => {
    const { user } = renderTela(undefined, []);
    await user.click(await screen.findByRole('tab', { name: 'Modelos e Config' }));
    expect(await screen.findByText('Nenhum modelo cadastrado.')).toBeVisible();
  });
});
