import { ApiRequestError, ERRO_CONEXAO, erroDaResposta } from './api-error';

type Query = Record<string, string | number | boolean | null | undefined>;

/** O que o cliente usa de um schema Zod (os de `@torres/shared`). */
export interface ValidadorResposta<T> {
  safeParse(dados: unknown): { success: true; data: T } | { success: false };
}

export interface ApiFetchOptions<T> {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  /** Parâmetros da query string. `null` e `undefined` são omitidos. */
  query?: Query;
  /** Corpo enviado como JSON. */
  body?: unknown;
  /** Schema da resposta de sucesso. Sem schema, o corpo volta sem validação. */
  schema?: ValidadorResposta<T>;
  signal?: AbortSignal;
}

/**
 * Chamada JSON à API. Rejeita com `ApiRequestError` (erro HTTP, falha de conexão ou resposta
 * fora do schema) ou com `AbortError` quando cancelada. O tratamento para o usuário (login,
 * "Sem permissão", toast) é centralizado em `tratarErroApi`.
 */
export async function apiFetch<T = unknown>(
  path: string,
  { method = 'GET', query, body, schema, signal }: ApiFetchOptions<T> = {},
): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let resposta: Response;
  try {
    resposta = await fetch(montarUrl(path, query), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new ApiRequestError(0, null, ERRO_CONEXAO);
  }

  const corpo = await lerCorpo(resposta);
  if (!resposta.ok) throw erroDaResposta(resposta.status, corpo);
  if (!schema) return corpo as T;

  const dados = schema.safeParse(corpo);
  if (!dados.success) throw new ApiRequestError(resposta.status, null);
  return dados.data;
}

function montarUrl(path: string, query?: Query): string {
  if (!query) return path;
  const params = new URLSearchParams();
  for (const [chave, valor] of Object.entries(query)) {
    if (valor !== undefined && valor !== null) params.append(chave, String(valor));
  }
  const busca = params.toString();
  return busca ? `${path}?${busca}` : path;
}

async function lerCorpo(resposta: Response): Promise<unknown> {
  if (resposta.status === 204) return undefined;
  try {
    return await resposta.json();
  } catch {
    return undefined;
  }
}
