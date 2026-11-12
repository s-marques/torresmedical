import {
  PERMISSOES,
  type ConversaWhatsapp,
  type ConversaWhatsappDetalhe,
  type MensagemWhatsapp,
} from '@torres/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  apiFalsa,
  chamadasPara,
  json,
  renderApp,
  USUARIO_TESTE,
  type FetchFalso,
} from '@/test/render-app';

// Vários modais e consultas por teste: o padrão de 5 s estoura com cobertura no CI.
vi.setConfig({ testTimeout: 20_000 });

const CONVERSAS = '/api/comercial-atendimento/conversas-whatsapp';
const ID = '00000000-0000-4000-8000-0000000000d1';
const CANAL_ID = '00000000-0000-4000-8000-0000000000c1';
const PACIENTE_ID = '00000000-0000-4000-8000-0000000000a1';
const USUARIO_ID = '00000000-0000-4000-8000-0000000000e1';
const TAG_1 = '00000000-0000-4000-8000-0000000000f1';
const TAG_2 = '00000000-0000-4000-8000-0000000000f2';
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const HOJE = new Date().toISOString();
const ANTES = '2026-09-25T15:00:00.000Z';

function detalhe(parcial: Partial<ConversaWhatsappDetalhe> = {}): ConversaWhatsappDetalhe {
  return {
    id: ID,
    status: 'EM_ATENDIMENTO',
    naoLidas: 0,
    ultimaMensagemEm: HOJE,
    createdAt: ANTES,
    contato: {
      id: '00000000-0000-4000-8000-0000000000b1',
      nome: 'Ana Teste',
      telefone: '5565900001234',
      email: 'ana@example.com',
      observacoes: 'Convênio de teste',
      pacienteId: PACIENTE_ID,
    },
    canal: { id: CANAL_ID, nome: 'Recepção' },
    atendente: { id: USUARIO_ID, nome: 'Atendente Teste' },
    anuncio: null,
    tags: [],
    ...parcial,
  };
}

function mensagem(parcial: Partial<MensagemWhatsapp> & { id: string }): MensagemWhatsapp {
  return {
    autor: 'CLIENTE',
    autorNome: null,
    status: 'ENVIADA',
    tipo: 'TEXTO',
    conteudo: 'Mensagem de teste',
    duracaoSegundos: null,
    enviadaEm: HOJE,
    citacao: null,
    ...parcial,
  };
}

const MENSAGENS: MensagemWhatsapp[] = [
  mensagem({ id: uuid(1), conteudo: 'Pergunta antiga', enviadaEm: ANTES }),
  mensagem({
    id: uuid(2),
    autor: 'ASSISTENTE_VIRTUAL',
    conteudo: 'Resposta automática',
    status: 'ENTREGUE',
    enviadaEm: ANTES,
  }),
  mensagem({ id: uuid(3), conteudo: 'Pergunta de hoje' }),
  mensagem({
    id: uuid(4),
    autor: 'ATENDENTE',
    autorNome: 'Atendente Teste',
    conteudo: 'Resposta do atendente',
    status: 'LIDA',
    citacao: { autor: 'CLIENTE', autorNome: null, conteudo: 'Pergunta de hoje' },
  }),
  mensagem({ id: uuid(5), autor: 'CELULAR', conteudo: 'Enviada do celular', status: 'ENVIADA' }),
  mensagem({
    id: uuid(6),
    autor: 'CELULAR',
    tipo: 'AUDIO',
    duracaoSegundos: 47,
    conteudo: '',
    status: 'ENTREGUE',
  }),
  mensagem({
    id: uuid(7),
    autor: 'ATENDENTE',
    autorNome: 'Atendente Teste',
    conteudo: 'Falhou',
    status: 'FALHA',
  }),
  mensagem({
    id: uuid(8),
    autor: 'ATENDENTE',
    autorNome: 'Atendente Teste',
    conteudo: 'Aguardando fila',
    status: 'PENDENTE',
  }),
];

function pagina<T>(data: T[], page = 1, totalPages = 1) {
  return json({ data, meta: { page, pageSize: 30, total: data.length, totalPages } });
}

function itemDaLista(status: ConversaWhatsapp['status']): ConversaWhatsapp {
  return {
    id: ID,
    status,
    naoLidas: 0,
    ultimaMensagem: 'Mensagem de teste',
    ultimaMensagemEm: HOJE,
    contato: {
      id: '00000000-0000-4000-8000-0000000000b1',
      nome: 'Ana Teste',
      telefone: '5565900001234',
    },
    canal: { id: CANAL_ID, nome: 'Recepção' },
    createdAt: ANTES,
  };
}

type Rotas = NonNullable<Parameters<typeof apiFalsa>[0]>['rotas'];

interface Opcoes {
  conversa?: Partial<ConversaWhatsappDetalhe>;
  mensagens?: MensagemWhatsapp[];
  rotas?: Rotas;
  usuario?: typeof USUARIO_TESTE;
}

function api({ conversa, mensagens = MENSAGENS, rotas, usuario }: Opcoes = {}) {
  const atual = detalhe(conversa);
  return apiFalsa({
    ...(usuario && { usuario }),
    rotas: {
      '/api/lookups/canais-whatsapp': () =>
        json({
          data: [{ id: CANAL_ID, label: 'Recepção', descricao: '5565900000010' }],
          meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
        }),
      [CONVERSAS]: () => pagina([itemDaLista(atual.status)]),
      [`${CONVERSAS}/contadores`]: () =>
        json({ BOT: 0, AGUARDANDO: 1, EM_ATENDIMENTO: 1, FINALIZADA: 1 }),
      [`${CONVERSAS}/${ID}`]: () => json(atual),
      // A API devolve as mais recentes primeiro; a tela inverte.
      [`${CONVERSAS}/${ID}/mensagens`]: () => pagina([...mensagens].reverse()),
      '/api/comercial-atendimento/tags-atendimento': () =>
        pagina([
          { id: TAG_1, nome: 'Retorno', cor: '#3b82f6', createdAt: ANTES, updatedAt: ANTES },
          { id: TAG_2, nome: 'Prioridade', cor: '#ef4444', createdAt: ANTES, updatedAt: ANTES },
        ]),
      '/api/lookups/usuarios': () =>
        json({
          data: [{ id: USUARIO_ID, label: 'Outro Atendente', descricao: 'Recepção' }],
          meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
        }),
      ...rotas,
    },
  });
}

async function abrir(
  fetchMock: FetchFalso = api(),
  status: ConversaWhatsapp['status'] = 'EM_ATENDIMENTO',
) {
  const user = userEvent.setup();
  const view = renderApp('/atendimento', fetchMock);
  // A lista abre em "Aguardando"; escolhe o chip do status da conversa.
  const rotulos = {
    BOT: 'Bot',
    AGUARDANDO: 'Aguardando',
    EM_ATENDIMENTO: 'Em Atendimento',
    FINALIZADA: 'Finalizada',
  };
  // A página abre por import dinâmico: na primeira renderização do arquivo, 1 s não basta.
  const chip = await screen.findByRole(
    'button',
    { name: new RegExp(`^${rotulos[status]}`) },
    { timeout: 10_000 },
  );
  await user.click(chip);
  await user.click(await screen.findByRole('button', { name: /Ana Teste/ }));
  await screen.findByRole('region', { name: 'Conversa aberta' });
  return { user, ...view };
}

function corpoDe(fetchMock: FetchFalso, caminho: string, metodo: string) {
  const chamada = chamadasPara(fetchMock, caminho).find(([, init]) => init?.method === metodo);
  return chamada?.[1]?.body
    ? (JSON.parse(String(chamada[1].body)) as Record<string, unknown>)
    : undefined;
}

const foiChamado = (fetchMock: FetchFalso, caminho: string, metodo: string) =>
  chamadasPara(fetchMock, caminho).some(([, init]) => init?.method === metodo);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Painel da conversa (/atendimento)', () => {
  it('Em Atendimento: cabeçalho, mensagens por autor e status, rodapé e painel direito', async () => {
    await abrir();

    const painel = screen.getByRole('region', { name: 'Conversa aberta' });
    expect(within(painel).getByRole('heading', { name: 'Ana Teste' })).toBeVisible();
    expect(within(painel).getByText('(65) 90000-1234')).toBeVisible();
    expect(within(painel).getByText('Recepção')).toBeVisible();
    expect(within(painel).getByText('Em Atendimento')).toBeVisible();
    expect(within(painel).getByRole('button', { name: 'Transferir' })).toBeVisible();
    expect(within(painel).getByRole('button', { name: 'Encerrar' })).toBeVisible();
    expect(within(painel).queryByRole('button', { name: 'Assumir' })).not.toBeInTheDocument();

    const linha = await within(painel).findByLabelText('Mensagens');
    expect(within(linha).getByText('25/09/2026')).toBeVisible();
    expect(within(linha).getByText('Hoje')).toBeVisible();
    expect(within(linha).getByText('Assistente Virtual')).toBeVisible();
    // Duas mensagens do celular no fixture: o texto e o áudio.
    expect(within(linha).getAllByText('Enviado pelo celular')).toHaveLength(2);
    expect(within(linha).getAllByText('Atendente Teste').length).toBeGreaterThan(0);
    // Citação do balão respondido, áudio com duração e os estados de envio.
    const resposta = within(linha).getByText('Resposta do atendente').closest('article');
    expect(resposta).not.toBeNull();
    const citacao = within(resposta as HTMLElement).getByRole('blockquote');
    expect(within(citacao).getByText('Cliente')).toBeVisible();
    expect(within(citacao).getByText('Pergunta de hoje')).toBeVisible();
    expect(within(linha).getByText('Áudio · 0:47')).toBeVisible();
    expect(within(linha).getByText('Não enviada')).toBeVisible();
    expect(within(linha).getByRole('img', { name: 'Pendente' })).toBeVisible();
    expect(within(linha).getByRole('img', { name: 'Lida' })).toBeVisible();
    // Entregue: a resposta do assistente e o áudio do fixture.
    expect(within(linha).getAllByRole('img', { name: 'Entregue' })).toHaveLength(2);

    expect(within(painel).getByRole('textbox', { name: 'Mensagem' })).toBeEnabled();
    expect(within(painel).getByPlaceholderText('Digite uma mensagem…')).toBeVisible();
    for (const anexo of ['Imagem', 'Áudio', 'Documento', 'Vídeo']) {
      expect(within(painel).getByRole('button', { name: anexo })).toBeDisabled();
    }

    const detalhes = screen.getByRole('complementary', { name: 'Detalhes da conversa' });
    expect(within(detalhes).getByText('ana@example.com')).toBeVisible();
    expect(within(detalhes).getByText('Nenhuma tag')).toBeVisible();
    expect(within(detalhes).getByText('Convênio de teste')).toBeVisible();
    expect(within(detalhes).getByRole('link', { name: 'Ver prontuário' })).toHaveAttribute(
      'href',
      '/prontuarios',
    );
    expect(within(detalhes).getByRole('link', { name: 'Ver agendamentos' })).toHaveAttribute(
      'href',
      '/agenda',
    );
    expect(within(detalhes).getByRole('link', { name: 'Realizar agendamento' })).toHaveAttribute(
      'href',
      '/agenda',
    );
    expect(within(detalhes).getByRole('link', { name: 'Editar dados' })).toHaveAttribute(
      'href',
      '/clientes',
    );
    // "Incluir no CRM" espera as telas de Negócios e Pipeline.
    expect(within(detalhes).queryByText('Incluir no CRM')).not.toBeInTheDocument();
  });

  it('Aguardando: aviso, campo desabilitado e Assumir chama a API', async () => {
    const fetchMock = api({
      conversa: { status: 'AGUARDANDO', atendente: null },
      rotas: { [`${CONVERSAS}/${ID}/assumir`]: () => json(detalhe({ status: 'EM_ATENDIMENTO' })) },
    });
    const { user } = await abrir(fetchMock, 'AGUARDANDO');

    const painel = screen.getByRole('region', { name: 'Conversa aberta' });
    expect(
      within(painel).getByText(
        'Conversa aguardando atendimento. Clique em "Assumir" para enviar mensagens.',
      ),
    ).toBeVisible();
    const campo = within(painel).getByRole('textbox', { name: 'Mensagem' });
    expect(campo).toBeDisabled();
    expect(campo).toHaveAttribute('placeholder', 'Assuma a conversa para enviar mensagens');
    expect(within(painel).queryByRole('button', { name: 'Transferir' })).not.toBeInTheDocument();

    await user.click(within(painel).getByRole('button', { name: 'Assumir' }));

    await waitFor(() =>
      expect(foiChamado(fetchMock, `${CONVERSAS}/${ID}/assumir`, 'POST')).toBe(true),
    );
    expect(await screen.findByText('Conversa assumida.')).toBeVisible();
  });

  it('Finalizada: só o aviso, sem Assumir, Transferir nem Encerrar', async () => {
    await abrir(api({ conversa: { status: 'FINALIZADA' } }), 'FINALIZADA');

    const painel = screen.getByRole('region', { name: 'Conversa aberta' });
    expect(within(painel).getByText('Conversa finalizada.')).toBeVisible();
    for (const nome of ['Assumir', 'Transferir', 'Encerrar']) {
      expect(within(painel).queryByRole('button', { name: nome })).not.toBeInTheDocument();
    }
    expect(within(painel).getByRole('textbox', { name: 'Mensagem' })).toBeDisabled();
  });

  describe('enviar mensagem', () => {
    it('envia o texto, limpa o campo e recarrega as mensagens', async () => {
      const novo = mensagem({
        id: uuid(9),
        autor: 'ATENDENTE',
        autorNome: 'Atendente Teste',
        status: 'PENDENTE',
        conteudo: 'Olá!',
      });
      const fetchMock = api({
        rotas: {
          [`${CONVERSAS}/${ID}/mensagens`]: (init) =>
            init?.method === 'POST' ? json(novo, 201) : pagina([...MENSAGENS].reverse()),
        },
      });
      const { user } = await abrir(fetchMock);

      const campo = screen.getByRole('textbox', { name: 'Mensagem' });
      await user.type(campo, 'Olá!');
      await user.click(screen.getByRole('button', { name: 'Enviar mensagem' }));

      await waitFor(() =>
        expect(corpoDe(fetchMock, `${CONVERSAS}/${ID}/mensagens`, 'POST')).toEqual({
          conteudo: 'Olá!',
        }),
      );
      await waitFor(() => expect(campo).toHaveValue(''));
    });

    it('vazio mostra "Mensagem é obrigatória." e não envia', async () => {
      const fetchMock = api();
      const { user } = await abrir(fetchMock);

      await user.click(screen.getByRole('button', { name: 'Enviar mensagem' }));

      expect(await screen.findByText('Mensagem é obrigatória.')).toBeVisible();
      expect(foiChamado(fetchMock, `${CONVERSAS}/${ID}/mensagens`, 'POST')).toBe(false);
    });

    it('mostra o erro do servidor no formulário', async () => {
      const { user } = await abrir(
        api({
          rotas: {
            [`${CONVERSAS}/${ID}/mensagens`]: (init) =>
              init?.method === 'POST'
                ? json(
                    {
                      statusCode: 409,
                      code: 'CONVERSA_FORA_DE_ATENDIMENTO',
                      message: 'Assuma a conversa para enviar mensagens.',
                    },
                    409,
                  )
                : pagina([...MENSAGENS].reverse()),
          },
        }),
      );

      await user.type(screen.getByRole('textbox', { name: 'Mensagem' }), 'Oi');
      await user.click(screen.getByRole('button', { name: 'Enviar mensagem' }));

      expect(await screen.findByText('Assuma a conversa para enviar mensagens.')).toBeVisible();
    });

    it('sem a permissão criar, o campo fica desabilitado', async () => {
      const semCriar = {
        ...USUARIO_TESTE,
        permissoes: PERMISSOES.filter((p) => p !== 'comercial-atendimento.whatsapp.criar'),
      };
      await abrir(api({ usuario: semCriar }));

      expect(screen.getByRole('textbox', { name: 'Mensagem' })).toBeDisabled();
    });
  });

  it('Encerrar pede confirmação e chama a API; Cancelar não encerra', async () => {
    const fetchMock = api({
      rotas: { [`${CONVERSAS}/${ID}/encerrar`]: () => json(detalhe({ status: 'FINALIZADA' })) },
    });
    const { user } = await abrir(fetchMock);

    await user.click(screen.getByRole('button', { name: 'Encerrar' }));
    let confirmacao = await screen.findByRole('alertdialog', { name: 'Encerrar conversa?' });
    await user.click(within(confirmacao).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(foiChamado(fetchMock, `${CONVERSAS}/${ID}/encerrar`, 'POST')).toBe(false);

    await user.click(screen.getByRole('button', { name: 'Encerrar' }));
    confirmacao = await screen.findByRole('alertdialog', { name: 'Encerrar conversa?' });
    await user.click(within(confirmacao).getByRole('button', { name: 'Encerrar' }));

    await waitFor(() =>
      expect(foiChamado(fetchMock, `${CONVERSAS}/${ID}/encerrar`, 'POST')).toBe(true),
    );
  });

  describe('Transferir', () => {
    it('exige o usuário e envia o escolhido', async () => {
      const fetchMock = api({
        rotas: { [`${CONVERSAS}/${ID}/transferir`]: () => json(detalhe()) },
      });
      const { user } = await abrir(fetchMock);

      await user.click(screen.getByRole('button', { name: 'Transferir' }));
      const modal = await screen.findByRole('dialog', { name: 'Transferir conversa' });
      await user.click(within(modal).getByRole('button', { name: 'Transferir' }));
      expect(await within(modal).findByText('Usuário é obrigatório.')).toBeVisible();
      expect(foiChamado(fetchMock, `${CONVERSAS}/${ID}/transferir`, 'POST')).toBe(false);

      await user.click(within(modal).getByRole('combobox', { name: /Transferir para/ }));
      await user.click(await screen.findByRole('option', { name: /Outro Atendente/ }));
      await user.click(within(modal).getByRole('button', { name: 'Transferir' }));

      await waitFor(() =>
        expect(corpoDe(fetchMock, `${CONVERSAS}/${ID}/transferir`, 'POST')).toEqual({
          usuarioId: USUARIO_ID,
        }),
      );
      await waitFor(() =>
        expect(
          screen.queryByRole('dialog', { name: 'Transferir conversa' }),
        ).not.toBeInTheDocument(),
      );
    });
  });

  describe('tags da conversa', () => {
    it('o ícone aplica e remove tags; o × do chip remove', async () => {
      const fetchMock = api({
        conversa: { tags: [{ id: TAG_2, nome: 'Prioridade', cor: '#ef4444' }] },
        rotas: {
          [`${CONVERSAS}/${ID}/tags/${TAG_1}`]: () => json(detalhe()),
          [`${CONVERSAS}/${ID}/tags/${TAG_2}`]: () => json(detalhe()),
        },
      });
      const { user } = await abrir(fetchMock);

      const detalhes = screen.getByRole('complementary', { name: 'Detalhes da conversa' });
      const aplicadas = within(detalhes).getByRole('list', { name: 'Tags aplicadas' });
      expect(within(aplicadas).getByText('Prioridade')).toBeVisible();

      await user.click(screen.getByRole('button', { name: 'Tags da conversa' }));
      const lista = await screen.findByRole('list', { name: 'Tags disponíveis' });
      expect(within(lista).getByRole('button', { name: /Prioridade/ })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      await user.click(within(lista).getByRole('button', { name: /Retorno/ }));
      await waitFor(() =>
        expect(foiChamado(fetchMock, `${CONVERSAS}/${ID}/tags/${TAG_1}`, 'PUT')).toBe(true),
      );

      // O botão fica desabilitado enquanto a alteração anterior termina de recarregar a tela.
      const prioridade = within(lista).getByRole('button', { name: /Prioridade/ });
      await waitFor(() => expect(prioridade).toBeEnabled());
      await user.click(prioridade);
      await waitFor(() =>
        expect(foiChamado(fetchMock, `${CONVERSAS}/${ID}/tags/${TAG_2}`, 'DELETE')).toBe(true),
      );
    });

    it('o × do chip remove a tag', async () => {
      const fetchMock = api({
        conversa: { tags: [{ id: TAG_2, nome: 'Prioridade', cor: '#ef4444' }] },
        rotas: { [`${CONVERSAS}/${ID}/tags/${TAG_2}`]: () => json(detalhe()) },
      });
      const { user } = await abrir(fetchMock);

      await user.click(screen.getByRole('button', { name: 'Remover a tag Prioridade' }));

      await waitFor(() =>
        expect(foiChamado(fetchMock, `${CONVERSAS}/${ID}/tags/${TAG_2}`, 'DELETE')).toBe(true),
      );
    });

    it('sem a permissão editar, não há Assumir, Transferir, Encerrar, ícone de tag nem ×', async () => {
      const semEditar = {
        ...USUARIO_TESTE,
        permissoes: PERMISSOES.filter((p) => p !== 'comercial-atendimento.whatsapp.editar'),
      };
      await abrir(
        api({
          usuario: semEditar,
          conversa: { tags: [{ id: TAG_2, nome: 'Prioridade', cor: '#ef4444' }] },
        }),
      );

      const painel = screen.getByRole('region', { name: 'Conversa aberta' });
      for (const nome of [
        'Assumir',
        'Transferir',
        'Encerrar',
        'Tags da conversa',
        'Remover a tag Prioridade',
      ]) {
        expect(screen.queryByRole('button', { name: nome })).not.toBeInTheDocument();
      }
      expect(
        within(painel).getByRole('button', { name: 'Mostrar ou ocultar os detalhes' }),
      ).toBeVisible();
    });
  });

  it('sem paciente vinculado: editar dados e ações rápidas desabilitados, sem observações', async () => {
    await abrir(
      api({
        conversa: {
          contato: {
            id: '00000000-0000-4000-8000-0000000000b1',
            nome: null,
            telefone: '5565900001234',
            email: null,
            observacoes: null,
            pacienteId: null,
          },
        },
      }),
    );

    const detalhes = screen.getByRole('complementary', { name: 'Detalhes da conversa' });
    expect(within(detalhes).getByRole('button', { name: 'Editar dados' })).toBeDisabled();
    for (const rotulo of ['Ver prontuário', 'Ver agendamentos', 'Realizar agendamento']) {
      expect(within(detalhes).getByRole('button', { name: rotulo })).toBeDisabled();
    }
    expect(within(detalhes).queryByRole('link')).not.toBeInTheDocument();
    expect(within(detalhes).getByText('Nenhuma observação registrada.')).toBeVisible();
    // Sem nome, o telefone formatado identifica o contato.
    expect(screen.getByRole('heading', { name: '(65) 90000-1234' })).toBeVisible();
  });

  describe('origem do anúncio', () => {
    it('mostra "Veio de anúncio · Facebook", o título e o link http(s)', async () => {
      await abrir(
        api({
          conversa: {
            anuncio: {
              origem: 'Facebook',
              titulo: 'Anúncio de teste',
              url: 'https://example.com/a',
            },
          },
        }),
      );

      const painel = screen.getByRole('region', { name: 'Conversa aberta' });
      expect(within(painel).getByText('Veio de anúncio · Facebook')).toBeVisible();
      expect(within(painel).getByText('Anúncio de teste')).toBeVisible();
      expect(within(painel).getByRole('link', { name: 'Abrir o anúncio' })).toHaveAttribute(
        'href',
        'https://example.com/a',
      );
    });

    it('link que não é http(s) não vira ligação', async () => {
      await abrir(
        api({
          conversa: { anuncio: { origem: 'Instagram', titulo: null, url: 'javascript:alert(1)' } },
        }),
      );

      const painel = screen.getByRole('region', { name: 'Conversa aberta' });
      expect(within(painel).getByText('Veio de anúncio · Instagram')).toBeVisible();
      expect(
        within(painel).queryByRole('link', { name: 'Abrir o anúncio' }),
      ).not.toBeInTheDocument();
    });
  });

  it('carrega as mensagens anteriores sob demanda', async () => {
    const recentes = [mensagem({ id: uuid(12), conteudo: 'Mensagem recente' })];
    const antigas = [mensagem({ id: uuid(11), conteudo: 'Mensagem antiga', enviadaEm: ANTES })];
    const fetchMock = api({
      rotas: {
        [`${CONVERSAS}/${ID}/mensagens`]: () => {
          const paginas = chamadasPara(fetchMock, `${CONVERSAS}/${ID}/mensagens`).length;
          return paginas === 1 ? pagina(recentes, 1, 2) : pagina(antigas, 2, 2);
        },
      },
    });
    const { user } = await abrir(fetchMock);

    const botao = await screen.findByRole('button', { name: 'Carregar mensagens anteriores' });
    expect(screen.queryByText('Mensagem antiga')).not.toBeInTheDocument();
    await user.click(botao);

    expect(await screen.findByText('Mensagem antiga')).toBeVisible();
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Carregar mensagens anteriores' }),
      ).not.toBeInTheDocument(),
    );
    const paginas = chamadasPara(fetchMock, `${CONVERSAS}/${ID}/mensagens`).map(([url]) =>
      new URL(url, 'http://x').searchParams.get('page'),
    );
    expect(paginas).toContain('2');
  });

  it('conversa sem mensagens e erro ao carregar a conversa', async () => {
    await abrir(api({ mensagens: [] }));
    expect(await screen.findByText('Nenhuma mensagem nesta conversa.')).toBeVisible();
  });

  it('o ícone de painel oculta e mostra os detalhes', async () => {
    const { user } = await abrir();

    await user.click(screen.getByRole('button', { name: 'Mostrar ou ocultar os detalhes' }));
    expect(
      screen.queryByRole('complementary', { name: 'Detalhes da conversa' }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Mostrar ou ocultar os detalhes' }));
    expect(screen.getByRole('complementary', { name: 'Detalhes da conversa' })).toBeVisible();
  });

  it('erro ao carregar a conversa mostra o aviso', async () => {
    await abrir(
      api({
        rotas: {
          [`${CONVERSAS}/${ID}`]: () =>
            json({ statusCode: 400, code: 'X', message: 'Falhou' }, 400),
        },
      }),
    ).catch(() => undefined);

    expect(await screen.findByText('Não foi possível carregar a conversa.')).toBeVisible();
  });
});
