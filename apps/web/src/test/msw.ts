import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll } from 'vitest';

/**
 * Servidor MSW dos testes de componente que chamam a API (ex.: `DataGrid`). Fica fora do
 * `setup.ts`: só os arquivos que chamam `usarMsw()` o ligam. Não misture com `apiFalsa`/
 * `renderApp` no mesmo arquivo: eles trocam o `fetch` global (`vi.stubGlobal`) e o MSW não veria
 * as chamadas.
 *
 * Os handlers usam caminhos relativos (`http.get('/api/...')`), resolvidos contra a origem do
 * jsdom, como o `apiFetch` faz.
 */
export const servidorMsw = setupServer();

export function usarMsw(): void {
  beforeAll(() => servidorMsw.listen({ onUnhandledRequest: 'error' }));
  afterEach(() => servidorMsw.resetHandlers());
  afterAll(() => servidorMsw.close());
}
