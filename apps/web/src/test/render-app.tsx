import { PERMISSOES, type UsuarioSessao } from '@torres/shared';
import { render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { vi, type Mock } from 'vitest';
import { AppProviders } from '../app/providers/AppProviders';
import { ROTAS } from '../app/routes';
import { encerrarSessaoLocal } from '../lib/auth/sessao';

/** Usuário fictício com todas as permissões do catálogo. */
export const USUARIO_TESTE: UsuarioSessao = {
  id: '00000000-0000-4000-8000-000000000001',
  nome: 'Pessoa de Teste',
  email: 'pessoa@example.com',
  perfil: { id: '00000000-0000-4000-8000-000000000002', nome: 'Administrador' },
  permissoes: [...PERMISSOES],
};

export const ERRO_401 = { statusCode: 401, code: 'SESSAO_INVALIDA', message: 'Sessão expirada' };

export function json(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Resposta de `/api/health` com a API no ar. */
export function healthOk(): Response {
  return json({
    status: 'ok',
    uptime: 1,
    timestamp: new Date().toISOString(),
    checks: { mensageria: 'up' },
  });
}

export function sessaoJson(usuario: UsuarioSessao = USUARIO_TESTE, accessToken = 'token-1') {
  return json({ accessToken, expiraEm: '2026-10-15T12:15:00.000Z', usuario });
}

type Rota = (init?: RequestInit) => Response | Promise<Response>;
export type FetchFalso = Mock<(url: string, init?: RequestInit) => Promise<Response>>;

export interface ApiFalsaOptions {
  /** Usuário da sessão retomada pelo refresh. `null`: sem sessão (refresh responde 401). */
  usuario?: UsuarioSessao | null;
  /** Respostas por caminho (sem query string), antes das padrão. */
  rotas?: Record<string, Rota>;
}

/** `fetch` falso: health no ar, refresh com o usuário, logout 204 e 404 para o resto. */
export function apiFalsa({
  usuario = USUARIO_TESTE,
  rotas = {},
}: ApiFalsaOptions = {}): FetchFalso {
  return vi.fn(async (url: string, init?: RequestInit): Promise<Response> => {
    const caminho = url.split('?')[0] ?? url;
    const rota = rotas[caminho];
    if (rota) return rota(init);
    if (caminho === '/api/health') return healthOk();
    if (caminho === '/api/auth/refresh') return usuario ? sessaoJson(usuario) : json(ERRO_401, 401);
    if (caminho === '/api/auth/logout') return new Response(null, { status: 204 });
    return json({ statusCode: 404, code: 'NOT_FOUND', message: 'Recurso não encontrado' }, 404);
  });
}

/** Chamadas feitas ao `fetch` falso para o caminho. */
export function chamadasPara(fetchMock: FetchFalso, caminho: string) {
  return fetchMock.mock.calls.filter(([url]) => url.split('?')[0] === caminho);
}

/**
 * Renderiza a aplicação inteira (providers + rotas) em `path`. Por padrão a API está no ar
 * e a sessão é retomada com `USUARIO_TESTE`; passe `fetchMock` (ex.: `apiFalsa({...})`) para mudar.
 */
export function renderApp(path = '/', fetchMock: FetchFalso = apiFalsa()) {
  vi.stubGlobal('fetch', fetchMock);
  const router = createMemoryRouter(ROTAS, { initialEntries: [path] });
  const onUnauthorized = vi.fn(encerrarSessaoLocal);
  const view = render(
    <AppProviders onUnauthorized={onUnauthorized}>
      <RouterProvider router={router} />
    </AppProviders>,
  );
  return { ...view, router, fetchMock, onUnauthorized };
}
