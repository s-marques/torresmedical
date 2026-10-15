import { ARQUIVO_CAMPO, arquivoSchema, type Arquivo, type ArquivoUso } from '@torres/shared';
import { ApiRequestError, ERRO_CONEXAO, erroDaResposta } from './api-error';

export const ERRO_INESPERADO = 'Não foi possível enviar o arquivo. Tente novamente';

export interface UploadArquivoOptions {
  uso: ArquivoUso;
  arquivo: File;
  /** Percentual enviado (0 a 100). */
  onProgress?: (percentual: number) => void;
  signal?: AbortSignal;
}

/**
 * `POST /api/arquivos?uso=` em multipart. Usa XHR porque o `fetch` não informa o progresso
 * do envio. Rejeita com `ApiRequestError` (erro da API ou de conexão) ou `AbortError`.
 */
export function uploadArquivo({
  uso,
  arquivo,
  onProgress,
  signal,
}: UploadArquivoOptions): Promise<Arquivo> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api/arquivos?${new URLSearchParams({ uso }).toString()}`);
    xhr.responseType = 'json';

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () => {
      const corpo: unknown = xhr.response;
      if (xhr.status >= 200 && xhr.status < 300) {
        const arquivo = arquivoSchema.safeParse(corpo);
        if (arquivo.success) resolve(arquivo.data);
        else reject(new ApiRequestError(xhr.status, null, ERRO_INESPERADO));
        return;
      }
      reject(erroDaResposta(xhr.status, corpo, ERRO_INESPERADO));
    };
    xhr.onerror = () => reject(new ApiRequestError(0, null, ERRO_CONEXAO));
    xhr.onabort = () => reject(abortError());
    signal?.addEventListener('abort', () => xhr.abort(), { once: true });

    const form = new FormData();
    form.append(ARQUIVO_CAMPO, arquivo);
    xhr.send(form);
  });
}

/** Mensagem para o usuário: o erro do campo `arquivo` (400) ou a mensagem geral. */
export function mensagemDoErroDeUpload(error: unknown): string {
  if (!(error instanceof ApiRequestError)) return ERRO_INESPERADO;
  const detalhe = error.body?.details?.find((d) => d.field === ARQUIVO_CAMPO);
  return detalhe?.message ?? error.message;
}

function abortError(): DOMException {
  return new DOMException('Envio cancelado', 'AbortError');
}
