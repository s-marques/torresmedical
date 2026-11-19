import { ARQUIVO_CAMPO, arquivoSchema, type Arquivo, type ArquivoUso } from '@torres/shared';
import { i18next } from '@/lib/i18n';
import PT_BR from '@/lib/i18n/locales/pt-BR.json';
import { ApiRequestError, erroConexao, erroDaResposta, mensagemDoDetalhe } from './api-error';
import { authorizationHeader } from './client';

/** Texto em português (testes); na tela vale `erros.envioArquivo` no idioma atual. */
export const ERRO_INESPERADO = PT_BR.erros.envioArquivo;

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
    const authorization = authorizationHeader();
    if (authorization) xhr.setRequestHeader('Authorization', authorization);

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
    xhr.onerror = () => reject(new ApiRequestError(0, null, erroConexao()));
    xhr.onabort = () => reject(abortError());
    signal?.addEventListener('abort', () => xhr.abort(), { once: true });

    const form = new FormData();
    form.append(ARQUIVO_CAMPO, arquivo);
    xhr.send(form);
  });
}

/** Mensagem para o usuário: o erro do campo `arquivo` (400) ou a mensagem geral. */
export function mensagemDoErroDeUpload(error: unknown): string {
  if (!(error instanceof ApiRequestError)) return i18next.t('erros.envioArquivo');
  const detalhe = error.body?.details?.find((d) => d.field === ARQUIVO_CAMPO);
  return detalhe ? mensagemDoDetalhe(detalhe) : error.message;
}

function abortError(): DOMException {
  return new DOMException(i18next.t('erros.envioCancelado'), 'AbortError');
}
