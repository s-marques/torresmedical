import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../test/render-app';

const paginas = vi.hoisted(() => ({ PAGINAS: {} as Record<string, () => never> }));
vi.mock('../paginas', () => paginas);

describe('PageErrorPage', () => {
  it('oferece tentar novamente e voltar ao Painel', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    paginas.PAGINAS['financeiro.caixas'] = () => {
      throw new Error('falha');
    };
    const { router } = renderApp('/caixas');

    expect(await screen.findByRole('alert')).toHaveTextContent('Algo deu errado');
    await userEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(await screen.findByRole('heading', { name: 'Algo deu errado' })).toBeInTheDocument();

    delete paginas.PAGINAS['financeiro.caixas'];
    await userEvent.click(screen.getByRole('link', { name: 'Voltar ao Painel' }));
    expect(router.state.location.pathname).toBe('/');
    expect(await screen.findByRole('heading', { level: 1, name: 'Painel' })).toBeInTheDocument();
  });
});
