import { PERMISSOES, type ConversaWhatsapp, type TagAtendimento } from '@torres/shared';
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
import { periodoInicialAnuncios } from './formatar';

// Vários modais por teste: o padrão de 5 s estoura com cobertura no CI.
vi.setConfig({ testTimeout: 20_000 });

const CONVERSAS = '/api/comercial-atendimento/conversas-whatsapp';
const CONTADORES = `${CONVERSAS}/contadores`;
const TAGS = '/api/comercial-atendimento/tags-atendimento';
const CANAL_1 = '00000000-0000-4000-8000-0000000000c1';
const CANAL_2 = '00000000-0000-4000-8000-0000000000c2';
const PACIENTE_ID = '00000000-0000-4000-8000-0000000000a1';
const TAG_ID = '00000000-0000-4000-8000-0000000000f1';

function conversa(parcial: Partial<ConversaWhatsapp> & { id: string }): ConversaWhatsapp {
  return {
    status: 'AGUARDANDO',
    naoLidas: 0,
    ultimaMensagem: 'Bom dia',
    ultimaMensagemEm: '2026-10-01T12:00:00.000Z',
    contato: {
      id: '00000000-0000-4000-8000-0000000000b1',
      nome: 'Ana Teste',
      telefone: '5565900000001',
    },
    canal: { id: CANAL_1, nome: 'Recepção' },
    createdAt: '2026-10-01T12:00:00.000Z',
    ...parcial,
  };
}

const ANA = conversa({ id: '00000000-0000-4000-8000-0000000000d1', naoLidas: 12 });
const SEM_NOME = conversa({
  id: '00000000-0000-4000-8000-0000000000d2',
  status: 'FINALIZADA',
  ultimaMensagem: 'Obrigado',
  contato: { id: '00000000-0000-4000-8000-0000000000b2', nome: null, telefone: '5565900000002' },
  canal: { id: CANAL_2, nome: 'Gerência' },
});

function pagina<T>(data: T[], page = 1, totalPages = 1) {
  return json({ data, meta: { page, pageSize: 30, total: data.length, totalPages } });
}

type Rotas = NonNullable<Parameters<typeof apiFalsa>[0]>['rotas'];

function api(rotas: Rotas = {}, usuario = USUARIO_TESTE) {
  return apiFalsa({
    usuario,
    rotas: {
      '/api/lookups/canais-whatsapp': () =>
        json({
          data: [
            { id: CANAL_1, label: 'Recepção', descricao: '5565900000010' },
            { id: CANAL_2, label: 'Gerência', descricao: '5565900000020' },
          ],
          meta: { page: 1, pageSize: 20, total: 2, totalPages: 1 },
        }),
      '/api/lookups/pacientes': () =>
        json({
          data: [{ id: PACIENTE_ID, label: 'Bruno Paciente', descricao: null }],
          meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
        }),
      [CONVERSAS]: () => pagina([ANA, SEM_NOME]),
      [CONTADORES]: () => json({ BOT: 0, AGUARDANDO: 96, EM_ATENDIMENTO: 309, FINALIZADA: 973 }),
      [TAGS]: () => pagina<TagAtendimento>([]),
      ...rotas,
    },
  });
}

function renderTela(fetchMock: FetchFalso = api()) {
  return { user: userEvent.setup(), ...renderApp('/atendimento', fetchMock) };
}

function query(fetchMock: FetchFalso, caminho: string) {
  return chamadasPara(fetchMock, caminho).map(([url]) =>
    Object.fromEntries(new URL(url, 'http://x').searchParams),
  );
}

const corpoDe = (init?: RequestInit) => JSON.parse(String(init?.body)) as Record<string, unknown>;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('WhatsApp (/atendimento)', () => {
  it('mostra título, ações, chips de canal e de status e a lista de conversas', async () => {
    const { fetchMock } = renderTela();

    expect(await screen.findByRole('heading', { level: 1, name: 'Atendimento' })).toBeVisible();
    expect(screen.getByText('Gerencie conversas do WhatsApp em tempo real.')).toBeVisible();
    expect(screen.getByRole('button', { name: /Anúncios/ })).toBeVisible();
    expect(screen.getByRole('button', { name: /Gerenciar Tags/ })).toBeVisible();

    const canais = screen.getByRole('group', { name: 'Canal:' });
    expect(within(canais).getByRole('button', { name: 'Todos' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(
      await within(canais).findByRole('button', { name: 'Recepção (5565900000010)' }),
    ).toBeVisible();

    const status = screen.getByRole('group', { name: 'Filtrar por status' });
    await waitFor(() =>
      expect(
        within(status)
          .getAllByRole('button')
          .map((b) => b.textContent),
      ).toEqual(['Bot', 'Aguardando96', 'Em Atendimento309', 'Alertas', 'Finalizada973']),
    );
    expect(within(status).getByRole('button', { name: /Aguardando/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    const lista = await screen.findByRole('list', { name: 'Conversas' });
    const itens = within(lista).getAllByRole('listitem');
    expect(itens).toHaveLength(2);
    expect(itens[0]).toHaveTextContent('Ana Teste');
    expect(itens[0]).toHaveTextContent('Recepção');
    expect(itens[0]).toHaveTextContent('Bom dia');
    expect(itens[0]).toHaveTextContent('Aguardando');
    expect(within(itens[0] as HTMLElement).getByLabelText('12 não lidas')).toHaveTextContent('9+');
    // Sem nome, mostra o telefone.
    expect(itens[1]).toHaveTextContent('5565900000002');
    expect(itens[1]).toHaveTextContent('Finalizada');

    expect(screen.getByText('Selecione uma conversa')).toBeVisible();
    expect(query(fetchMock, CONVERSAS)[0]).toEqual({
      status: 'aguardando',
      page: '1',
      pageSize: '30',
    });
  });

  it('filtra por canal e por status; "Alertas" fica vazio sem consultar a API', async () => {
    const { user, fetchMock } = renderTela();
    await screen.findByRole('list', { name: 'Conversas' });

    await user.click(await screen.findByRole('button', { name: 'Gerência (5565900000020)' }));
    await waitFor(() =>
      expect(query(fetchMock, CONVERSAS).at(-1)).toMatchObject({
        canalId: CANAL_2,
        status: 'aguardando',
      }),
    );
    expect(query(fetchMock, CONTADORES).at(-1)).toEqual({ canalId: CANAL_2 });

    await user.click(screen.getByRole('button', { name: /Em Atendimento/ }));
    await waitFor(() =>
      expect(query(fetchMock, CONVERSAS).at(-1)).toMatchObject({ status: 'em-atendimento' }),
    );

    const antes = chamadasPara(fetchMock, CONVERSAS).length;
    await user.click(screen.getByRole('button', { name: 'Alertas' }));
    expect(await screen.findByText('Nenhuma conversa encontrada')).toBeVisible();
    expect(chamadasPara(fetchMock, CONVERSAS)).toHaveLength(antes);
  });

  it('carrega a próxima página ao chegar ao fim da lista', async () => {
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(private readonly callback: IntersectionObserverCallback) {}
        observe() {
          this.callback(
            [{ isIntersecting: true } as IntersectionObserverEntry],
            this as unknown as IntersectionObserver,
          );
        }
        disconnect() {}
      },
    );
    const fetchMock = api({
      [CONVERSAS]: () => {
        const paginas = chamadasPara(fetchMock, CONVERSAS).length;
        return paginas === 1 ? pagina([ANA], 1, 2) : pagina([SEM_NOME], 2, 2);
      },
    });
    renderTela(fetchMock);

    const lista = await screen.findByRole('list', { name: 'Conversas' });
    await waitFor(() => expect(within(lista).getAllByRole('listitem')).toHaveLength(2));
    expect(query(fetchMock, CONVERSAS).map((q) => q.page)).toEqual(['1', '2']);
  });

  it('mostra erro quando a lista não carrega', async () => {
    renderTela(
      api({
        [CONVERSAS]: () => json({ statusCode: 400, code: 'X', message: 'Falhou' }, 400),
      }),
    );

    expect(await screen.findByText('Não foi possível carregar as conversas.')).toBeVisible();
  });

  it('Buscar conversas: pede 2 caracteres, busca e seleciona o resultado', async () => {
    const { user, fetchMock } = renderTela();

    await user.click(await screen.findByRole('button', { name: 'Buscar conversas...' }));
    const modal = await screen.findByRole('dialog', { name: 'Buscar Conversas' });
    expect(within(modal).getByText('Digite pelo menos 2 caracteres')).toBeVisible();

    await user.type(within(modal).getByRole('textbox', { name: 'Buscar conversas' }), 'a');
    expect(within(modal).getByText('Digite pelo menos 2 caracteres')).toBeVisible();
    await user.type(within(modal).getByRole('textbox', { name: 'Buscar conversas' }), 'n');

    const resultados = await within(modal).findByRole('list', { name: 'Resultados da busca' });
    expect(query(fetchMock, CONVERSAS).at(-1)).toEqual({ search: 'an', pageSize: '50' });

    await user.click(within(resultados).getByRole('button', { name: /Ana Teste/ }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const lista = screen.getByRole('list', { name: 'Conversas' });
    expect(within(lista).getByRole('button', { name: /Ana Teste/ })).toHaveAttribute(
      'aria-current',
      'true',
    );
  });

  it('Buscar conversas: sem resultado', async () => {
    const { user } = renderTela(api({ [CONVERSAS]: () => pagina([]) }));

    await user.click(await screen.findByRole('button', { name: 'Buscar conversas...' }));
    const modal = await screen.findByRole('dialog', { name: 'Buscar Conversas' });
    await user.type(within(modal).getByRole('textbox'), 'zz');

    expect(await within(modal).findByText('Nenhuma conversa encontrada')).toBeVisible();
  });

  describe('Nova conversa', () => {
    async function abrir(user: ReturnType<typeof userEvent.setup>) {
      await user.click(await screen.findByRole('button', { name: 'Nova' }));
      return screen.findByRole('region', { name: 'Nova conversa' });
    }

    async function preencher(user: ReturnType<typeof userEvent.setup>, form: HTMLElement) {
      await user.click(within(form).getByRole('combobox', { name: /Paciente/ }));
      await user.click(await screen.findByRole('option', { name: /Bruno Paciente/ }));
      await user.click(await within(form).findByRole('button', { name: 'Gerência' }));
    }

    it('só habilita "Iniciar conversa" com paciente e canal; envia e fecha', async () => {
      const fetchMock = api({
        [CONVERSAS]: (init) =>
          init?.method === 'POST'
            ? json(conversa({ id: '00000000-0000-4000-8000-0000000000d9' }), 201)
            : pagina([ANA]),
      });
      const { user } = renderTela(fetchMock);

      const form = await abrir(user);
      const iniciar = within(form).getByRole('button', { name: 'Iniciar conversa' });
      expect(iniciar).toBeDisabled();

      await preencher(user, form);
      await waitFor(() => expect(iniciar).toBeEnabled());
      await user.click(iniciar);

      await waitFor(() =>
        expect(screen.queryByRole('region', { name: 'Nova conversa' })).not.toBeInTheDocument(),
      );
      const post = chamadasPara(fetchMock, CONVERSAS).find(([, init]) => init?.method === 'POST');
      expect(corpoDe(post?.[1])).toEqual({ pacienteId: PACIENTE_ID, canalId: CANAL_2 });
      expect(await screen.findByText('Conversa iniciada.')).toBeVisible();
    });

    it('mostra o erro do servidor no formulário (conversa em andamento)', async () => {
      const { user } = renderTela(
        api({
          [CONVERSAS]: (init) =>
            init?.method === 'POST'
              ? json(
                  {
                    statusCode: 409,
                    code: 'CONVERSA_EM_ANDAMENTO',
                    message: 'Já existe uma conversa em andamento com este paciente neste canal.',
                  },
                  409,
                )
              : pagina([ANA]),
        }),
      );

      const form = await abrir(user);
      await preencher(user, form);
      await user.click(within(form).getByRole('button', { name: 'Iniciar conversa' }));

      expect(
        await within(form).findByText(
          'Já existe uma conversa em andamento com este paciente neste canal.',
        ),
      ).toBeVisible();
    });

    it('"Cancelar" fecha o formulário', async () => {
      const { user } = renderTela();

      const form = await abrir(user);
      await user.click(within(form).getByRole('button', { name: 'Cancelar' }));

      expect(screen.queryByRole('region', { name: 'Nova conversa' })).not.toBeInTheDocument();
    });

    it('sem a permissão criar, o botão Nova não aparece', async () => {
      const semCriar = {
        ...USUARIO_TESTE,
        permissoes: PERMISSOES.filter((p) => p !== 'comercial-atendimento.whatsapp.criar'),
      };
      renderTela(api({}, semCriar));

      await screen.findByRole('list', { name: 'Conversas' });
      expect(screen.queryByRole('button', { name: 'Nova' })).not.toBeInTheDocument();
    });
  });

  describe('Gerenciar Tags', () => {
    const TAG: TagAtendimento = {
      id: TAG_ID,
      nome: 'Retorno',
      cor: '#3b82f6',
      createdAt: '2026-10-01T12:00:00.000Z',
      updatedAt: '2026-10-01T12:00:00.000Z',
    };

    it('lista vazia, valida o nome e cria com a cor', async () => {
      const fetchMock = api({
        [TAGS]: (init) => (init?.method === 'POST' ? json(TAG, 201) : pagina<TagAtendimento>([])),
      });
      const { user } = renderTela(fetchMock);

      await user.click(await screen.findByRole('button', { name: /Gerenciar Tags/ }));
      const modal = await screen.findByRole('dialog', { name: 'Gerenciar Tags' });
      expect(await within(modal).findByText('Nenhuma tag criada.')).toBeVisible();

      await user.click(within(modal).getByRole('button', { name: 'Adicionar tag' }));
      expect(await within(modal).findByText('Nome da tag é obrigatório.')).toBeVisible();

      await user.type(within(modal).getByRole('textbox', { name: /Nome da tag/ }), 'Retorno');
      await user.click(within(modal).getByRole('button', { name: 'Adicionar tag' }));

      await waitFor(() =>
        expect(chamadasPara(fetchMock, TAGS).some(([, init]) => init?.method === 'POST')).toBe(
          true,
        ),
      );
      const post = chamadasPara(fetchMock, TAGS).find(([, init]) => init?.method === 'POST');
      expect(corpoDe(post?.[1])).toEqual({ nome: 'Retorno', cor: '#6b7280' });
      await waitFor(() =>
        expect(within(modal).getByRole('textbox', { name: /Nome da tag/ })).toHaveValue(''),
      );
    });

    it('exclui com confirmação', async () => {
      const fetchMock = api({
        [TAGS]: () => pagina([TAG]),
        [`${TAGS}/${TAG_ID}`]: () => json(TAG),
      });
      const { user } = renderTela(fetchMock);

      await user.click(await screen.findByRole('button', { name: /Gerenciar Tags/ }));
      const modal = await screen.findByRole('dialog', { name: 'Gerenciar Tags' });
      await user.click(await within(modal).findByRole('button', { name: 'Excluir a tag Retorno' }));

      const confirmacao = await screen.findByRole('alertdialog', { name: 'Excluir tag?' });
      expect(confirmacao).toHaveTextContent('A tag "Retorno" deixa de aparecer nas conversas.');
      await user.click(within(confirmacao).getByRole('button', { name: 'Excluir' }));

      await waitFor(() =>
        expect(chamadasPara(fetchMock, `${TAGS}/${TAG_ID}`)[0]?.[1]?.method).toBe('DELETE'),
      );
    });
  });

  it('Anúncios: período dos últimos 30 dias e lista vazia até a integração', async () => {
    const { user } = renderTela();

    await user.click(await screen.findByRole('button', { name: /Anúncios/ }));
    const modal = await screen.findByRole('dialog', { name: 'Contatos vindos de anúncio' });
    const { de, ate } = periodoInicialAnuncios();
    expect(within(modal).getByLabelText('De')).toHaveValue(de);
    expect(within(modal).getByLabelText('Até')).toHaveValue(ate);
    expect(within(modal).getByText('Nenhum contato vindo de anúncio.')).toBeVisible();
  });
});

describe('periodoInicialAnuncios', () => {
  it('30 dias antes até hoje', () => {
    expect(periodoInicialAnuncios(new Date(2026, 9, 15))).toEqual({
      de: '2026-09-15',
      ate: '2026-10-15',
    });
  });
});
