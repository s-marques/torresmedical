import { render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { vi } from 'vitest';
import { AppProviders } from '../app/providers/AppProviders';
import { ROTAS } from '../app/routes';

/** Resposta de `/api/health` com a API no ar. */
export function healthOk(): Response {
  return new Response(
    JSON.stringify({ status: 'ok', uptime: 1, timestamp: new Date().toISOString() }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

/**
 * Renderiza a aplicação inteira (providers + rotas) em `path`. Por padrão a API de saúde
 * está no ar; passe `fetchMock` para outro comportamento.
 */
export function renderApp(
  path = '/',
  fetchMock = vi.fn(async (): Promise<Response> => healthOk()),
) {
  vi.stubGlobal('fetch', fetchMock);
  const router = createMemoryRouter(ROTAS, { initialEntries: [path] });
  const onUnauthorized = vi.fn();
  const view = render(
    <AppProviders onUnauthorized={onUnauthorized}>
      <RouterProvider router={router} />
    </AppProviders>,
  );
  return { ...view, router, fetchMock, onUnauthorized };
}
