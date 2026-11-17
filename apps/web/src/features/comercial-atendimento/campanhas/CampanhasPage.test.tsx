import { PERMISSOES, type Campanha, type MensagemAutomatica } from '@torres/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { apiFalsa, json, renderApp, USUARIO_TESTE } from '@/test/render-app';

vi.setConfig({ testTimeout: 20_000 });

const API = '/api/comercial-atendimento/campanhas';
const AUTO = '/api/comercial-atendimento/mensagens-automaticas';
const C1 = '00000000-0000-4000-8000-0000000000a1';
const C2 = '00000000-0000-4000-8000-0000000000a2';
const A1 = '00000000-0000-4000-8000-0000000000b1';
const CANAL = '00000000-0000-4000-8000-0000000000c1';

function campanha(parcial: Partial<Campanha> = {}): Campanha {
  return {
    id: C1,
    nome: 'Promoção de Maio',
    tipoEnvio: 'TEXTO',
    canalId: CANAL,
    canal: 'Recepção',
    filtro: 'TODOS',
    origemClienteId: null,
    origem: null,
    diasCompra: null,
    quantidade: null,
    intervaloSegundos: 5,
    agendadaPara: '2099-12-01T12:00:00.000Z',
    mensagem: 'Olá {nome}!',
    status: 'AGENDADA',
    totalDestinatarios: 0,
    totalEnviados: 0,
    totalFalhas: 0,
    iniciadaEm: null,
    concluidaEm: null,
    canceladaEm: null,
    createdAt: '2026-11-01T12:00:00.000Z',
    ...parcial,
  };
}

function automacao(parcial: Partial<MensagemAutomatica> = {}): MensagemAutomatica {
  return {
    id: A1,
    nome: 'Aniversariantes do Dia',
    tipoEnvio: 'TEXTO',
    canalId: CANAL,
    canal: 'Recepção',
    filtro: 'ANIVERSARIANTES_DIA',
    origemClienteId: null,
    origem: null,
    diasCompra: null,
    horario: '09:00',
    diasSemana: [0, 1, 2, 3, 4, 5, 6],
    ativa: true,
    mensagem: 'Feliz aniversário {nome}!',
    totalEnviados: 66,
    ultimoEnvioEm: '2026-10-14T12:00:00.000Z',
    createdAt: '2026-10-01T12:00:00.000Z',
    ...parcial,
  };
}

const CAMPANHAS = [
  campanha(),
  campanha({
    id: C2,
    nome: 'Black Friday',
    status: 'CONCLUIDA',
    totalDestinatarios: 10,
    totalEnviados: 9,
    totalFalhas: 1,
  }),
];

const RESUMO = {
  totalCampanhas: 2,
  concluidas: 1,
  mensagensEnviadas: 7,
  destinatarios: 10,
  taxaSucesso: 77.8,
  automacoes: 1,
  automacoesAtivas: 1,
  automacoesEnviados: 66,
};

type Corpo = Record<string, unknown>;
type Escrita = { metodo: string; caminho: string; corpo: Corpo | undefined };

function api(opcoes: { campanhas?: Campanha[]; usuario?: typeof USUARIO_TESTE } = {}) {
  const escritas: Escrita[] = [];
  const escrever = (caminho: string, resposta: unknown) => (init?: RequestInit) => {
    escritas.push({
      metodo: init?.method ?? 'GET',
      caminho,
      corpo: init?.body ? (JSON.parse(String(init.body)) as Corpo) : undefined,
    });
    return json(resposta, init?.method === 'POST' ? 201 : 200);
  };
  const lista = opcoes.campanhas ?? CAMPANHAS;
  const fetchMock = apiFalsa({
    usuario: opcoes.usuario,
    rotas: {
      [API]: (init) =>
        init?.method === 'POST'
          ? escrever(API, campanha())(init)
          : json({
              data: lista,
              meta: { page: 1, pageSize: 100, total: lista.length, totalPages: 1 },
            }),
      [`${API}/resumo`]: () => json(RESUMO),
      [`${API}/destinatarios`]: () =>
        json({
          data: [{ pacienteId: C2, nome: 'Ana Teste', telefone: '(65) 9****-0000' }],
          meta: { page: 1, pageSize: 10, total: 1, totalPages: 1 },
        }),
      [`${API}/${C1}`]: escrever(`${API}/${C1}`, campanha()),
      [`${API}/${C1}/cancelar`]: escrever(`${API}/${C1}/cancelar`, campanha()),
      [AUTO]: (init) =>
        init?.method === 'POST' ? escrever(AUTO, automacao())(init) : json([automacao()]),
      [`${AUTO}/${A1}`]: escrever(`${AUTO}/${A1}`, automacao()),
      [`${AUTO}/${A1}/ativa`]: escrever(`${AUTO}/${A1}/ativa`, automacao({ ativa: false })),
      '/api/lookups/canais-whatsapp': () =>
        json({
          data: [{ id: CANAL, label: 'Recepção', descricao: null }],
          meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
        }),
      [`/api/lookups/canais-whatsapp/${CANAL}`]: () =>
        json({ id: CANAL, label: 'Recepção', descricao: null }),
    },
  });
  return { fetchMock, escritas };
}

function renderTela(opcoes?: Parameters<typeof api>[0]) {
  const { fetchMock, escritas } = api(opcoes);
  return { user: userEvent.setup(), escritas, ...renderApp('/campanhas', fetchMock) };
}

describe('Campanhas (/campanhas)', () => {
  it('mostra cabeçalho, abas e os cartões das campanhas', async () => {
    renderTela();
    expect(await screen.findByRole('heading', { name: 'Campanhas' })).toBeInTheDocument();
    expect(screen.getByText('Envios agendados em massa e mensagens automáticas.')).toBeVisible();
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual([
      'Envios Agendados',
      'Mensagens Automáticas',
      'Relatórios',
    ]);
    expect(await screen.findByText('2 campanha(s)')).toBeVisible();
    const lista = screen.getByRole('list', { name: 'Campanhas' });
    expect(within(lista).getByText('Promoção de Maio').closest('li')).toHaveTextContent('Agendada');
    expect(within(lista).getByText('Black Friday').closest('li')).toHaveTextContent(
      '9/10 enviados',
    );
  });

  it('sem campanhas mostra o estado vazio do inventário', async () => {
    renderTela({ campanhas: [] });
    expect(await screen.findByText('Nenhuma campanha')).toBeVisible();
    expect(screen.getByText('Crie sua primeira campanha de envio em massa.')).toBeVisible();
    expect(screen.getAllByRole('button', { name: 'Nova Campanha' })).toHaveLength(2);
  });

  it('Nova Campanha: campos do inventário, mensagens padrão e envio', async () => {
    const { user, escritas } = renderTela();
    await screen.findByText('2 campanha(s)');
    await user.click(screen.getByRole('button', { name: 'Nova Campanha' }));
    const modal = await screen.findByRole('dialog', { name: 'Nova Campanha' });
    for (const rotulo of [
      /Nome da Campanha/,
      /Tipo de Envio/,
      /Canal WhatsApp/,
      /Filtro de Clientes/,
      /Quantidade de Envios/,
      /Intervalo entre envios/,
      /Data do Envio/,
      /Hora do Envio/,
      /Mensagem/,
    ]) {
      expect(within(modal).getAllByText(rotulo).length).toBeGreaterThan(0);
    }
    expect(within(modal).getByText('Vazio = envia para todos')).toBeVisible();
    expect(within(modal).getByText('Variáveis: {nome}, {telefone}, {ultima_compra}')).toBeVisible();
    expect(within(modal).getByLabelText(/Intervalo entre envios/)).toHaveValue(5);

    await user.click(within(modal).getByRole('button', { name: 'Criar Campanha' }));
    expect(await within(modal).findByText('Nome da Campanha é obrigatório.')).toBeVisible();
    expect(within(modal).getByText('Canal WhatsApp é obrigatório.')).toBeVisible();
    expect(within(modal).getByText('Mensagem é obrigatória.')).toBeVisible();
    expect(escritas).toEqual([]);

    await user.type(within(modal).getByRole('textbox', { name: /Nome da Campanha/ }), 'Natal');
    await user.click(within(modal).getByRole('combobox', { name: /Canal WhatsApp/ }));
    await user.click(await screen.findByRole('option', { name: /Recepção/ }));
    await user.type(within(modal).getByRole('textbox', { name: /Mensagem/ }), 'Oi');
    await user.click(within(modal).getByRole('button', { name: 'Criar Campanha' }));

    await waitFor(() =>
      expect(escritas).toEqual([
        {
          metodo: 'POST',
          caminho: API,
          corpo: expect.objectContaining({
            nome: 'Natal',
            canalId: CANAL,
            mensagem: 'Oi',
            filtro: 'TODOS',
            intervaloSegundos: 5,
            tipoEnvio: 'TEXTO',
          }),
        },
      ]),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('Visualizar Clientes lista quem o filtro alcança', async () => {
    const { user } = renderTela();
    await screen.findByText('2 campanha(s)');
    await user.click(screen.getByRole('button', { name: 'Nova Campanha' }));
    await user.click(await screen.findByRole('button', { name: /Visualizar Clientes/ }));
    const lista = await screen.findByRole('dialog', { name: 'Clientes da campanha' });
    expect(await within(lista).findByText('Ana Teste')).toBeVisible();
    expect(within(lista).getByText('(65) 9****-0000')).toBeVisible();
  });

  it('Editar envia PATCH; Cancelar pede confirmação', async () => {
    const { user, escritas } = renderTela();
    await user.click(await screen.findByRole('button', { name: 'Ações de Promoção de Maio' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Editar' }));
    const modal = await screen.findByRole('dialog', { name: 'Editar Campanha' });
    const nome = within(modal).getByRole('textbox', { name: /Nome da Campanha/ });
    await user.clear(nome);
    await user.type(nome, 'Editada');
    await user.click(within(modal).getByRole('button', { name: 'Salvar' }));
    await waitFor(() =>
      expect(escritas.at(-1)).toMatchObject({
        metodo: 'PATCH',
        caminho: `${API}/${C1}`,
        corpo: { nome: 'Editada', canalId: CANAL },
      }),
    );

    await user.click(await screen.findByRole('button', { name: 'Ações de Promoção de Maio' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Cancelar' }));
    const dialogo = await screen.findByRole('alertdialog', { name: 'Cancelar Campanha' });
    await user.click(within(dialogo).getByRole('button', { name: 'Confirmar' }));
    await waitFor(() =>
      expect(escritas.at(-1)).toMatchObject({ caminho: `${API}/${C1}/cancelar` }),
    );

    // Concluída não tem Editar nem Cancelar.
    await user.click(screen.getByRole('button', { name: 'Ações de Black Friday' }));
    expect(await screen.findByRole('menuitem', { name: 'Excluir' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Editar' })).not.toBeInTheDocument();
  });

  it('Mensagens Automáticas: cartão, switch e validação da Nova Automação', async () => {
    const { user, escritas } = renderTela();
    await user.click(await screen.findByRole('tab', { name: 'Mensagens Automáticas' }));
    expect(await screen.findByText('1 mensagem(ns) automática(s)')).toBeVisible();
    const cartao = screen.getByText('Aniversariantes do Dia').closest('li')!;
    expect(cartao).toHaveTextContent('Aniversariantes do dia');
    expect(cartao).toHaveTextContent('09:00');
    expect(cartao).toHaveTextContent('Dom, Seg, Ter, Qua, Qui, Sex, Sáb');
    expect(cartao).toHaveTextContent('66 enviados');

    await user.click(within(cartao).getByRole('switch'));
    await waitFor(() =>
      expect(escritas.at(-1)).toEqual({
        metodo: 'PATCH',
        caminho: `${AUTO}/${A1}/ativa`,
        corpo: { ativa: false },
      }),
    );

    await user.click(screen.getByRole('button', { name: 'Nova Automação' }));
    const modal = await screen.findByRole('dialog', { name: 'Nova Automação' });
    for (const dia of ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']) {
      await user.click(within(modal).getByRole('button', { name: dia }));
    }
    await user.click(within(modal).getByRole('button', { name: 'Criar Automação' }));
    expect(await within(modal).findByText('Nome é obrigatório.')).toBeVisible();
    expect(within(modal).getByText('Horário é obrigatório.')).toBeVisible();
    expect(within(modal).getByText('Selecione ao menos um dia da semana.')).toBeVisible();
    expect(within(modal).getByText('Mensagem é obrigatória.')).toBeVisible();
  });

  it('Relatórios: cartões, histórico e resumo das automações', async () => {
    const { user } = renderTela();
    await user.click(await screen.findByRole('tab', { name: 'Relatórios' }));
    const resumo = await screen.findByTestId('resumo-campanhas');
    await waitFor(() => expect(resumo).toHaveTextContent('77,8%'));
    expect(resumo).toHaveTextContent('Total Campanhas2');
    expect(resumo).toHaveTextContent('de 10 destinatários');
    expect(resumo).toHaveTextContent('1 ativas');
    const historico = screen.getByRole('region', { name: 'Histórico de Campanhas' });
    expect(await within(historico).findByText('Black Friday')).toBeVisible();
    const automacoes = screen.getByRole('region', { name: 'Mensagens Automáticas — Resumo' });
    expect(
      within(automacoes)
        .getAllByRole('columnheader')
        .map((c) => c.textContent),
    ).toEqual([
      'Nome',
      'Tipo',
      'Filtro',
      'Status',
      'Horário',
      'Dias',
      'Total Enviados',
      'Último Envio',
    ]);
  });

  it('só com "ver" esconde criar, editar, excluir e trava o switch', async () => {
    const somenteVer = PERMISSOES.filter((p) => p === 'comercial-atendimento.campanhas.ver');
    const { user } = renderTela({ usuario: { ...USUARIO_TESTE, permissoes: somenteVer } });
    await screen.findByText('2 campanha(s)');
    expect(screen.queryByRole('button', { name: 'Nova Campanha' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Ações de/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Mensagens Automáticas' }));
    expect(await screen.findByRole('switch')).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Nova Automação' })).not.toBeInTheDocument();
  });
});
