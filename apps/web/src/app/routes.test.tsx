import { MENU, TELAS } from '@torres/shared';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderApp } from '../test/render-app';

const paginas = vi.hoisted(() => ({ PAGINAS: {} as Record<string, () => ReactNode> }));
vi.mock('./paginas', () => paginas);

describe('rotas', () => {
  it.each(TELAS.map((tela) => [tela.rota, tela] as const))(
    '%s abre a tela correspondente em construção',
    async (_rota, tela) => {
      renderApp(tela.rota);

      const modulo = MENU.find((m) => m.id === tela.modulo);
      expect(await screen.findByRole('heading', { level: 1, name: tela.nome })).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Em construção' })).toBeInTheDocument();
      expect(within(screen.getByRole('main')).getByText(modulo?.nome ?? '')).toBeInTheDocument();
    },
  );

  it('mostra a página 404 dentro do layout para rota desconhecida', async () => {
    renderApp('/rota-que-nao-existe');

    expect(
      await screen.findByRole('heading', { name: 'Página não encontrada' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'PAINEL' })).toBeInTheDocument();
  });

  it('volta ao Painel pelo link da 404', async () => {
    const { router } = renderApp('/nao-existe');

    await userEvent.click(await screen.findByRole('link', { name: 'Voltar ao Painel' }));

    expect(router.state.location.pathname).toBe('/');
    expect(await screen.findByRole('heading', { level: 1, name: 'Painel' })).toBeInTheDocument();
  });

  it('abre o login fora do layout, sem o menu', async () => {
    renderApp('/login');

    expect(await screen.findByRole('button', { name: 'Entrar' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'PAINEL' })).not.toBeInTheDocument();
  });

  it('abre a página registrada da tela no lugar do placeholder', async () => {
    paginas.PAGINAS['financeiro.caixas'] = () => <h1>Caixas de verdade</h1>;

    renderApp('/caixas');

    expect(await screen.findByRole('heading', { name: 'Caixas de verdade' })).toBeInTheDocument();
    expect(screen.queryByText('Em construção')).not.toBeInTheDocument();
    delete paginas.PAGINAS['financeiro.caixas'];
  });

  it('mostra o erro da página no error boundary, mantendo o menu', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    paginas.PAGINAS['financeiro.caixas'] = () => {
      throw new Error('falha na tela');
    };

    renderApp('/caixas');

    expect(await screen.findByRole('heading', { name: 'Algo deu errado' })).toBeInTheDocument();
    expect(screen.queryByText('falha na tela')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'PAINEL' })).toBeInTheDocument();
    delete paginas.PAGINAS['financeiro.caixas'];
  });
});
