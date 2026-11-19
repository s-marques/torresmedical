import { PREFERENCIAS_PADRAO, type MeuPerfil, type Preferencias } from '@torres/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  apiFalsa,
  chamadasPara,
  json,
  renderApp,
  USUARIO_TESTE,
  type FetchFalso,
} from '@/test/render-app';

vi.setConfig({ testTimeout: 20_000 });

const API_PERFIL = '/api/configuracoes-gestao/configuracoes/perfil';
const API_PREFERENCIAS = '/api/configuracoes-gestao/configuracoes/preferencias';

function perfil(parcial: Partial<MeuPerfil> = {}): MeuPerfil {
  return {
    id: USUARIO_TESTE.id,
    nome: 'Pessoa de Teste',
    email: 'pessoa@example.com',
    telefone: '65999998888',
    cargo: 'Administrador',
    avatarArquivoId: null,
    updatedAt: '2026-11-18T12:00:00.000Z',
    ...parcial,
  };
}

/** API com o perfil e as preferências gravadas em memória (PUT/PATCH devolvem o novo estado). */
function apiConfiguracoes(usuario = USUARIO_TESTE) {
  let atual = perfil();
  let preferencias: Preferencias = { ...usuario.preferencias };
  return apiFalsa({
    usuario,
    rotas: {
      [API_PERFIL]: (init) => {
        if (init?.method === 'PUT') atual = { ...atual, ...JSON.parse(String(init.body)) };
        return json(atual);
      },
      [API_PREFERENCIAS]: (init) => {
        preferencias = { ...preferencias, ...JSON.parse(String(init?.body)) };
        return json(preferencias);
      },
    },
  });
}

function renderTela(fetchMock: FetchFalso = apiConfiguracoes()) {
  return { user: userEvent.setup(), ...renderApp('/settings', fetchMock) };
}

function corpos(fetchMock: FetchFalso, caminho: string, metodo: string) {
  return chamadasPara(fetchMock, caminho)
    .filter(([, init]) => init?.method === metodo)
    .map(([, init]) => JSON.parse(String(init?.body)));
}

describe('Configurações (/settings)', () => {
  it('mostra título, descrição, as três abas e o perfil carregado', async () => {
    renderTela();

    expect(await screen.findByRole('heading', { name: 'Configurações', level: 1 })).toBeVisible();
    expect(screen.getByText('Gerencie suas configurações de conta e preferências.')).toBeVisible();
    for (const aba of ['Perfil', 'Preferências', 'Aparência']) {
      expect(screen.getByRole('tab', { name: aba })).toBeInTheDocument();
    }
    expect(await screen.findByRole('heading', { name: 'Meu Perfil' })).toBeVisible();
    expect(screen.getByText('Atualize suas informações pessoais')).toBeVisible();
    expect(screen.getByLabelText(/^Nome/)).toHaveValue('Pessoa de Teste');
    expect(screen.getByLabelText(/^E-mail/)).toHaveValue('pessoa@example.com');
    expect(screen.getByLabelText(/^Cargo/)).toHaveValue('Administrador');
    expect(screen.getByText('Enviar avatar')).toBeInTheDocument();
    expect(screen.getByText('JPG, PNG ou GIF. Máximo 2 MB.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Salvar Alterações' })).toBeEnabled();
  });

  it('"Salvar Alterações" grava, mostra a mensagem padrão e atualiza o nome no cabeçalho', async () => {
    const { user, fetchMock } = renderTela();
    const nome = await screen.findByLabelText(/^Nome/);

    await user.clear(nome);
    await user.type(nome, 'Nome Novo da Silva');
    await user.clear(screen.getByLabelText(/^Cargo/));
    await user.click(screen.getByRole('button', { name: 'Salvar Alterações' }));

    expect(await screen.findByText('Perfil atualizado.')).toBeInTheDocument();
    expect(corpos(fetchMock, API_PERFIL, 'PUT')).toEqual([
      {
        nome: 'Nome Novo da Silva',
        email: 'pessoa@example.com',
        telefone: '65999998888',
        cargo: null,
      },
    ]);
    await user.click(screen.getByRole('button', { name: 'Menu do usuário' }));
    expect(await screen.findByRole('menu')).toHaveTextContent('Nome Novo da Silva');
  });

  it('valida os obrigatórios com a mensagem padrão, sem chamar a API', async () => {
    const { user, fetchMock } = renderTela();
    await user.clear(await screen.findByLabelText(/^Nome/));
    await user.clear(screen.getByLabelText(/^E-mail/));

    await user.click(screen.getByRole('button', { name: 'Salvar Alterações' }));

    expect(await screen.findByText('Nome é obrigatório.')).toBeInTheDocument();
    expect(screen.getByText('E-mail é obrigatório.')).toBeInTheDocument();
    expect(corpos(fetchMock, API_PERFIL, 'PUT')).toHaveLength(0);
  });

  it('mostra no campo o e-mail já usado por outro usuário (409)', async () => {
    const fetchMock = apiFalsa({
      rotas: {
        [API_PERFIL]: (init) =>
          init?.method === 'PUT'
            ? json(
                {
                  statusCode: 409,
                  code: 'DUPLICATE',
                  message: 'Já existe um usuário com este email',
                  details: [{ field: 'email', message: 'Já existe um usuário com este email' }],
                },
                409,
              )
            : json(perfil()),
      },
    });
    const { user } = renderTela(fetchMock);
    await screen.findByLabelText(/^Nome/);

    await user.click(screen.getByRole('button', { name: 'Salvar Alterações' }));

    expect(await screen.findAllByText('Já existe um usuário com este email')).not.toHaveLength(0);
    expect(screen.getByLabelText(/^E-mail/)).toHaveValue('pessoa@example.com');
  });

  it('aba Preferências: interruptores do usuário, gravados ao alternar', async () => {
    const { user, fetchMock } = renderTela();
    await user.click(await screen.findByRole('tab', { name: 'Preferências' }));

    expect(await screen.findByRole('switch', { name: 'Notificações de agenda' })).toBeChecked();
    expect(screen.getByRole('switch', { name: 'Novidades do sistema' })).not.toBeChecked();
    expect(screen.getByRole('switch', { name: 'Alertas de segurança' })).toBeChecked();
    expect(screen.getByRole('switch', { name: 'Notificações push' })).toBeChecked();
    const resumo = screen.getByRole('switch', { name: 'Resumo semanal' });
    expect(resumo).not.toBeChecked();
    expect(resumo).toHaveAccessibleDescription('Receber um resumo semanal do desempenho');

    await user.click(resumo);

    await waitFor(() => expect(resumo).toBeChecked());
    expect(corpos(fetchMock, API_PREFERENCIAS, 'PATCH')).toEqual([{ resumoSemanal: true }]);
  });

  it('aba Preferências: volta o interruptor quando a API recusa', async () => {
    const fetchMock = apiFalsa({
      rotas: {
        [API_PERFIL]: () => json(perfil()),
        [API_PREFERENCIAS]: () =>
          json({ statusCode: 500, code: 'INTERNAL_ERROR', message: 'Erro interno' }, 500),
      },
    });
    const { user } = renderTela(fetchMock);
    await user.click(await screen.findByRole('tab', { name: 'Preferências' }));
    const push = await screen.findByRole('switch', { name: 'Notificações push' });

    await user.click(push);

    await waitFor(() => expect(push).toBeChecked());
  });

  it('aba Aparência: aplica e grava cor, densidade, tema e idioma', async () => {
    const { user, fetchMock } = renderTela();
    await user.click(await screen.findByRole('tab', { name: 'Aparência' }));

    const cores = await screen.findByRole('radiogroup', { name: 'Esquema de Cores' });
    expect(within(cores).getByRole('radio', { name: 'Esmeralda' })).toBeChecked();
    expect(
      within(cores)
        .getAllByRole('radio')
        .map((r) => r.textContent),
    ).toEqual(['Esmeralda', 'Azul', 'Violeta', 'Rosa', 'Laranja', 'Ardósia']);

    await user.click(within(cores).getByRole('radio', { name: 'Azul' }));
    await waitFor(() => expect(document.documentElement.dataset.cor).toBe('azul'));
    expect(within(cores).getByRole('radio', { name: 'Azul' })).toBeChecked();

    const densidade = screen.getByRole('radiogroup', { name: 'Densidade' });
    expect(within(densidade).getByRole('radio', { name: 'Confortável' })).toBeChecked();
    await user.click(within(densidade).getByRole('radio', { name: 'Compacto' }));
    await waitFor(() => expect(document.documentElement.dataset.densidade).toBe('compacto'));

    const tema = screen.getByRole('radiogroup', { name: 'Tema' });
    expect(within(tema).getByRole('radio', { name: 'Sistema' })).toBeChecked();
    await user.click(within(tema).getByRole('radio', { name: 'Escuro' }));
    await waitFor(() => expect(document.documentElement).toHaveClass('dark'));

    const idioma = screen.getByRole('radiogroup', { name: 'Idioma' });
    expect(
      within(idioma)
        .getAllByRole('radio')
        .map((r) => r.textContent),
    ).toEqual(['Português', 'English', 'Español']);
    await user.click(within(idioma).getByRole('radio', { name: 'Español' }));
    expect(await screen.findByRole('heading', { name: 'Configuración', level: 1 })).toBeVisible();
    expect(screen.getByRole('tab', { name: 'Apariencia' })).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('es');

    expect(corpos(fetchMock, API_PREFERENCIAS, 'PATCH')).toEqual([
      { esquemaCor: 'azul' },
      { densidade: 'compacto' },
      { tema: 'escuro' },
      { idioma: 'es' },
    ]);
  });

  it('em inglês, a tela e o menu aparecem traduzidos', async () => {
    const usuario = {
      ...USUARIO_TESTE,
      preferencias: { ...PREFERENCIAS_PADRAO, idioma: 'en' as const },
    };
    renderTela(apiConfiguracoes(usuario));

    expect(await screen.findByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
    expect(screen.getByRole('tab', { name: 'Preferences' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Save Changes' })).toBeInTheDocument();
    const linksMenu = screen.getAllByRole('link', { name: 'Settings' });
    expect(linksMenu.some((link) => link.getAttribute('aria-current') === 'page')).toBe(true);
    expect(screen.getByRole('button', { name: 'SETTINGS / MANAGEMENT' })).toBeInTheDocument();
  });

  it('só com permissão de ver: campos, interruptores e opções ficam bloqueados', async () => {
    const usuario = {
      ...USUARIO_TESTE,
      permissoes: ['configuracoes-gestao.configuracoes.ver' as const],
    };
    const { user } = renderTela(apiConfiguracoes(usuario));

    expect(await screen.findByLabelText(/^Nome/)).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Salvar Alterações' })).not.toBeInTheDocument();
    expect(screen.queryByText('Enviar avatar')).not.toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Preferências' }));
    expect(await screen.findByRole('switch', { name: 'Resumo semanal' })).toBeDisabled();

    await user.click(screen.getByRole('tab', { name: 'Aparência' }));
    expect(await screen.findByRole('radio', { name: 'Azul' })).toBeDisabled();
  });
});
