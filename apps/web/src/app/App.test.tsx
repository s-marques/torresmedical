import { useQuery } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentType } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { apiFetch } from '@/lib/api/client';
import { apiFalsa, chamadasPara, ERRO_401, json, sessaoJson } from '../test/render-app';
import { App } from './App';

const paginas = vi.hoisted(() => ({ PAGINAS: {} as Record<string, ComponentType> }));
vi.mock('./paginas', () => paginas);

function TelaQueChamaApi() {
  useQuery({ queryKey: ['caixas'], queryFn: () => apiFetch('/api/financeiro/caixas') });
  return <h1>Caixas</h1>;
}

describe('App', () => {
  it('retoma a sessão pelo cookie e abre o Painel em "/" dentro do layout', async () => {
    const fetchMock = apiFalsa();
    vi.stubGlobal('fetch', fetchMock);
    window.history.pushState({}, '', '/');

    render(<App />);

    expect(await screen.findByRole('heading', { level: 1, name: 'Painel' })).toBeInTheDocument();
    expect(await screen.findByText('API: online')).toBeInTheDocument();
    expect(chamadasPara(fetchMock, '/api/auth/refresh')).toHaveLength(1);
  });

  it('navega pelo menu para a URL do sistema atual', async () => {
    vi.stubGlobal('fetch', apiFalsa());
    window.history.pushState({}, '', '/');
    render(<App />);

    await userEvent.click(await screen.findByRole('button', { name: 'COMERCIAL / ATENDIMENTO' }));
    await userEvent.click(screen.getByRole('link', { name: 'Pacientes' }));

    expect(window.location.pathname).toBe('/clientes');
    expect(await screen.findByRole('heading', { level: 1, name: 'Pacientes' })).toBeInTheDocument();
  });

  it('renova o access token no 401 e repete a chamada com o token novo', async () => {
    let tentativas = 0;
    let refreshes = 0;
    const fetchMock = apiFalsa({
      rotas: {
        '/api/auth/refresh': () => sessaoJson(undefined, `token-${++refreshes}`),
        '/api/financeiro/caixas': () => (++tentativas === 1 ? json(ERRO_401, 401) : json([])),
      },
    });
    vi.stubGlobal('fetch', fetchMock);
    paginas.PAGINAS['financeiro.caixas'] = TelaQueChamaApi;
    window.history.pushState({}, '', '/caixas');

    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Caixas' })).toBeInTheDocument();
    await vi.waitFor(() => expect(tentativas).toBe(2));
    const [primeira, segunda] = chamadasPara(fetchMock, '/api/financeiro/caixas');
    expect(new Headers(primeira?.[1]?.headers).get('Authorization')).toBe('Bearer token-1');
    expect(new Headers(segunda?.[1]?.headers).get('Authorization')).toBe('Bearer token-2');
    delete paginas.PAGINAS['financeiro.caixas'];
  });

  it('vai para o login quando a sessão acaba (401 que a renovação não resolve)', async () => {
    let refreshes = 0;
    vi.stubGlobal(
      'fetch',
      apiFalsa({
        rotas: {
          '/api/auth/refresh': () => (++refreshes === 1 ? sessaoJson() : json(ERRO_401, 401)),
          '/api/financeiro/caixas': () => json(ERRO_401, 401),
        },
      }),
    );
    paginas.PAGINAS['financeiro.caixas'] = TelaQueChamaApi;
    window.history.pushState({}, '', '/caixas');

    render(<App />);

    expect(await screen.findByRole('button', { name: 'Entrar' })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/login');
    expect(new URLSearchParams(window.location.search).get('redirect')).toBe('/caixas');
    delete paginas.PAGINAS['financeiro.caixas'];
  });
});
