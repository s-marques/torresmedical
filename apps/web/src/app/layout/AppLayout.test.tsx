import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { apiFalsa, chamadasPara, renderApp } from '../../test/render-app';

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

  it('troca o tema para escuro e volta para claro pelo menu de tema', async () => {
    renderApp('/');
    await layoutPronto();

    await userEvent.click(screen.getByRole('button', { name: 'Tema' }));
    await userEvent.click(await screen.findByRole('menuitemradio', { name: 'Escuro' }));
    expect(document.documentElement).toHaveClass('dark');
    expect(localStorage.getItem('torres-theme')).toBe('dark');

    await userEvent.click(screen.getByRole('button', { name: 'Tema' }));
    await userEvent.click(await screen.findByRole('menuitemradio', { name: 'Claro' }));
    expect(document.documentElement).not.toHaveClass('dark');
    expect(localStorage.getItem('torres-theme')).toBe('light');
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
