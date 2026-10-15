import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { useQuery } from '@tanstack/react-query';
import type { ComponentType } from 'react';
import { apiFetch } from '@/lib/api/client';
import { healthOk } from '../test/render-app';
import { App } from './App';

const paginas = vi.hoisted(() => ({ PAGINAS: {} as Record<string, ComponentType> }));
vi.mock('./paginas', () => paginas);

const ERRO_401 = { statusCode: 401, code: 'UNAUTHORIZED', message: 'Não autenticado' };

function TelaQueChamaApi() {
  useQuery({ queryKey: ['caixas'], queryFn: () => apiFetch('/api/financeiro/caixas') });
  return <h1>Caixas</h1>;
}

describe('App', () => {
  it('abre o Painel em "/" dentro do layout e consulta /api/health', async () => {
    const fetchMock = vi.fn(async () => healthOk());
    vi.stubGlobal('fetch', fetchMock);
    window.history.pushState({}, '', '/');

    render(<App />);

    expect(await screen.findByRole('heading', { level: 1, name: 'Painel' })).toBeInTheDocument();
    expect(await screen.findByText('API: online')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/health', expect.anything());
  });

  it('navega pelo menu para a URL do sistema atual', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => healthOk()),
    );
    window.history.pushState({}, '', '/');
    render(<App />);

    await userEvent.click(await screen.findByRole('button', { name: 'COMERCIAL / ATENDIMENTO' }));
    await userEvent.click(screen.getByRole('link', { name: 'Pacientes' }));

    expect(window.location.pathname).toBe('/clientes');
    expect(await screen.findByRole('heading', { level: 1, name: 'Pacientes' })).toBeInTheDocument();
  });

  it('redireciona para o login quando uma chamada da tela recebe 401', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url === '/api/health'
          ? healthOk()
          : new Response(JSON.stringify(ERRO_401), { status: 401 }),
      ),
    );
    paginas.PAGINAS['financeiro.caixas'] = TelaQueChamaApi;
    window.history.pushState({}, '', '/caixas');

    render(<App />);

    expect(await screen.findByRole('button', { name: 'Entrar' })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/login');
    delete paginas.PAGINAS['financeiro.caixas'];
  });
});
