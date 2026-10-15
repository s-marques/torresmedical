import { apiFetchArquivo, type ApiFetchOptions } from './client';

/** Entrega o arquivo ao navegador como download. */
export function salvarArquivo(blob: Blob, nome: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = nome;
  link.rel = 'noopener';
  document.body.append(link);
  link.click();
  link.remove();
  // Depois do clique o navegador já tem a referência; libera a memória.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * Baixa um arquivo da API (ex.: `GET /api/<recurso>/export?format=xlsx`) e salva no navegador.
 * Rejeita com `ApiRequestError` quando a API responde erro.
 */
export async function baixarArquivo(
  path: string,
  query?: ApiFetchOptions<never>['query'],
  nomePadrao?: string,
): Promise<void> {
  const { blob, nome } = await apiFetchArquivo(path, { query, nomePadrao });
  salvarArquivo(blob, nome);
}
