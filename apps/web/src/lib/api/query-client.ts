import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { ApiRequestError } from './api-error';
import { tratarErroApi, type TratarErroOptions } from './tratar-erro';

declare module '@tanstack/react-query' {
  interface Register {
    queryMeta: QueryMeta;
    mutationMeta: QueryMeta;
  }
}

interface QueryMeta extends Record<string, unknown> {
  /** `false` desliga o tratamento global (toast/redirecionamento) para esta query ou mutation. */
  tratarErro?: boolean;
}

const MAX_TENTATIVAS = 2;

/** Erros do cliente (4xx) não melhoram tentando de novo. Falhas de rede e 5xx, sim. */
export function deveRepetir(tentativas: number, error: unknown): boolean {
  if (error instanceof ApiRequestError && error.status >= 400 && error.status < 500) return false;
  return tentativas < MAX_TENTATIVAS;
}

/** QueryClient da aplicação, com o tratamento de erros da API ligado a queries e mutations. */
export function createQueryClient(options: TratarErroOptions): QueryClient {
  return new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) => {
        if (query.meta?.tratarErro !== false) tratarErroApi(error, options);
      },
    }),
    mutationCache: new MutationCache({
      onError: (error, _variables, _context, mutation) => {
        if (mutation.meta?.tratarErro !== false) tratarErroApi(error, options);
      },
    }),
    defaultOptions: {
      queries: { retry: deveRepetir, refetchOnWindowFocus: false, staleTime: 30_000 },
      mutations: { retry: false },
    },
  });
}
