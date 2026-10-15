import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../test/render-app';

const paginas = vi.hoisted(() => ({ PAGINAS: {} as Record<string, () => never> }));
vi.mock('../paginas', () => paginas);

describe('LoginPage', () => {
  it('mostra e-mail, senha e "Esqueci minha senha"', async () => {
    renderApp('/login');

    expect(await screen.findByLabelText('E-mail')).toHaveAttribute('type', 'email');
    expect(screen.getByLabelText('Senha')).toHaveAttribute('type', 'password');
    expect(screen.getByRole('button', { name: 'Esqueci minha senha' })).toBeInTheDocument();
  });

  it('exige e-mail e senha antes de entrar', async () => {
    const { router } = renderApp('/login');

    await userEvent.click(await screen.findByRole('button', { name: 'Entrar' }));

    expect(screen.getByLabelText('E-mail')).toBeRequired();
    expect(screen.getByLabelText('Senha')).toBeRequired();
    expect(router.state.location.pathname).toBe('/login');
  });

  it('leva ao Painel ao entrar (até a integração da autenticação)', async () => {
    const { router } = renderApp('/login');

    await userEvent.type(await screen.findByLabelText('E-mail'), 'pessoa@exemplo.com');
    await userEvent.type(screen.getByLabelText('Senha'), 'segredo');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(router.state.location.pathname).toBe('/');
  });
});

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
