import { PREFERENCIAS_PADRAO } from '@torres/shared';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { apiFalsa, chamadasPara, json, renderApp, USUARIO_TESTE } from '../../test/render-app';

const URL_PREFERENCIAS = '/api/configuracoes-gestao/configuracoes/preferencias';

/** O layout aparece depois de a sessão ser retomada. */
async function layoutPronto() {
  await screen.findByRole('button', { name: 'Menu do usuário' });
}

describe('AppLayout: cabeçalho', () => {
  it('mostra a API online quando /api/health responde', async () => {
    const { fetchMock } = renderApp('/');

    expect(await screen.findByText('API: online')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/health', expect.anything());
  });

  it('mostra a API indisponível, sem toast, quando /api/health falha', async () => {
    renderApp(
      '/',
      apiFalsa({
        rotas: {
          '/api/health': () => {
            throw new Error('falha de rede');
          },
        },
      }),
    );

    expect(await screen.findByText('API: indisponível')).toBeInTheDocument();
    expect(screen.queryByText('Falha de conexão. Tente novamente')).not.toBeInTheDocument();
  });

  it('troca o tema para escuro e volta para claro, gravando na preferência do usuário', async () => {
    let gravadas = { ...PREFERENCIAS_PADRAO };
    const fetchMock = apiFalsa({
      rotas: {
        [URL_PREFERENCIAS]: (init) => {
          gravadas = { ...gravadas, ...JSON.parse(String(init?.body)) };
          return json(gravadas);
        },
      },
    });
    renderApp('/', fetchMock);
    await layoutPronto();

    await userEvent.click(screen.getByRole('button', { name: 'Tema' }));
    await userEvent.click(await screen.findByRole('menuitemradio', { name: 'Escuro' }));
    await waitFor(() => expect(document.documentElement).toHaveClass('dark'));
    expect(localStorage.getItem('torres-theme')).toBe('dark');

    await userEvent.click(screen.getByRole('button', { name: 'Tema' }));
    await userEvent.click(await screen.findByRole('menuitemradio', { name: 'Claro' }));
    await waitFor(() => expect(document.documentElement).not.toHaveClass('dark'));
    expect(localStorage.getItem('torres-theme')).toBe('light');

    const corpos = chamadasPara(fetchMock, URL_PREFERENCIAS).map(([, init]) =>
      JSON.parse(String(init?.body)),
    );
    expect(corpos).toEqual([{ tema: 'escuro' }, { tema: 'claro' }]);
  });

  it('sem permissão de editar Configurações, o tema vale só no navegador', async () => {
    const usuario = { ...USUARIO_TESTE, permissoes: ['painel.painel.ver' as const] };
    const fetchMock = apiFalsa({ usuario });
    renderApp('/', fetchMock);
    await layoutPronto();

    await userEvent.click(screen.getByRole('button', { name: 'Tema' }));
    await userEvent.click(await screen.findByRole('menuitemradio', { name: 'Escuro' }));

    expect(document.documentElement).toHaveClass('dark');
    expect(chamadasPara(fetchMock, URL_PREFERENCIAS)).toHaveLength(0);
  });

  it('aplica o tema, a cor, a densidade e o idioma da sessão', async () => {
    const usuario = {
      ...USUARIO_TESTE,
      preferencias: {
        ...PREFERENCIAS_PADRAO,
        tema: 'escuro' as const,
        esquemaCor: 'azul' as const,
        densidade: 'compacto' as const,
        idioma: 'en' as const,
      },
    };
    renderApp('/', apiFalsa({ usuario }));

    expect(await screen.findByRole('button', { name: 'User menu' })).toBeInTheDocument();
    expect(document.documentElement).toHaveClass('dark');
    expect(document.documentElement.dataset.cor).toBe('azul');
    expect(document.documentElement.dataset.densidade).toBe('compacto');
    expect(document.documentElement.lang).toBe('en');
    expect(screen.getByRole('button', { name: 'SETTINGS / MANAGEMENT' })).toBeInTheDocument();
  });

  it('mostra as notificações vazias', async () => {
    renderApp('/');
    await layoutPronto();

    await userEvent.click(screen.getByRole('button', { name: 'Notificações' }));

    expect(await screen.findByText('Nenhuma notificação')).toBeInTheDocument();
  });

  it('sai pelo menu do usuário e vai para o login', async () => {
    const { router, fetchMock } = renderApp('/');
    await layoutPronto();

    await userEvent.click(screen.getByRole('button', { name: 'Menu do usuário' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Sair' }));

    expect(await screen.findByRole('button', { name: 'Entrar' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');
    expect(chamadasPara(fetchMock, '/api/auth/logout')).toHaveLength(1);
  });
});

describe('AppLayout: busca de telas (⌘K)', () => {
  it('abre pelo botão Buscar, filtra pelo nome e navega para a tela', async () => {
    const { router } = renderApp('/');
    await layoutPronto();

    await userEvent.click(screen.getByRole('button', { name: 'Buscar telas' }));
    const dialogo = await screen.findByRole('dialog', { name: 'Buscar tela' });
    await userEvent.type(within(dialogo).getByRole('combobox'), 'contas a pagar');
    await userEvent.click(within(dialogo).getByRole('option', { name: 'Contas a Pagar' }));

    expect(router.state.location.pathname).toBe('/pagar');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('abre e fecha com Ctrl+K', async () => {
    renderApp('/');
    await layoutPronto();

    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    expect(await screen.findByRole('dialog', { name: 'Buscar tela' })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('avisa quando nenhuma tela corresponde à busca', async () => {
    renderApp('/');
    await layoutPronto();

    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    await userEvent.type(await screen.findByRole('combobox'), 'xyzxyz');

    expect(screen.getByText('Nenhuma tela encontrada.')).toBeInTheDocument();
  });
});
