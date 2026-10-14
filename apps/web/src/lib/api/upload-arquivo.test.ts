import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ApiRequestError,
  ERRO_CONEXAO,
  ERRO_INESPERADO,
  mensagemDoErroDeUpload,
  uploadArquivo,
} from './upload-arquivo';

const ARQUIVO = {
  id: '0b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f',
  uso: 'avatar',
  nomeOriginal: 'foto.png',
  contentType: 'image/png',
  tamanho: 3,
  criadoPor: null,
  createdAt: '2026-10-14T12:00:00.000Z',
};

/** XHR falso: guarda a última instância para o teste simular progresso e resposta. */
class FakeXhr {
  static ultimo: FakeXhr;
  method = '';
  url = '';
  responseType = '';
  status = 0;
  response: unknown = null;
  body: FormData | null = null;
  upload: { onprogress: ((e: Partial<ProgressEvent>) => void) | null } = { onprogress: null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  abort = vi.fn(() => this.onabort?.());

  constructor() {
    FakeXhr.ultimo = this;
  }

  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }

  send(body: FormData) {
    this.body = body;
  }

  responder(status: number, response: unknown) {
    this.status = status;
    this.response = response;
    this.onload?.();
  }
}

const file = () => new File(['abc'], 'foto.png', { type: 'image/png' });

beforeEach(() => {
  vi.stubGlobal('XMLHttpRequest', FakeXhr);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('uploadArquivo', () => {
  it('envia multipart com o uso na query, informa o progresso e devolve os metadados', async () => {
    const onProgress = vi.fn();
    const promessa = uploadArquivo({ uso: 'avatar', arquivo: file(), onProgress });
    const xhr = FakeXhr.ultimo;

    expect(xhr.method).toBe('POST');
    expect(xhr.url).toBe('/api/arquivos?uso=avatar');
    expect(xhr.responseType).toBe('json');
    expect((xhr.body?.get('arquivo') as File).name).toBe('foto.png');

    xhr.upload.onprogress?.({ lengthComputable: true, loaded: 1, total: 4 });
    xhr.upload.onprogress?.({ lengthComputable: false, loaded: 2, total: 0 });
    xhr.responder(201, ARQUIVO);

    await expect(promessa).resolves.toEqual(ARQUIVO);
    expect(onProgress).toHaveBeenCalledTimes(1);
    expect(onProgress).toHaveBeenCalledWith(25);
  });

  it('rejeita com o erro padrão da API', async () => {
    const promessa = uploadArquivo({ uso: 'avatar', arquivo: file() });
    const corpo = {
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      message: 'Dados inválidos',
      details: [{ field: 'arquivo', message: 'O arquivo deve ter no máximo 2 MB' }],
    };
    FakeXhr.ultimo.responder(400, corpo);

    const erro = await promessa.catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(ApiRequestError);
    expect(erro).toMatchObject({ status: 400, body: corpo, message: 'Dados inválidos' });
  });

  it('rejeita com mensagem genérica para resposta fora do contrato', async () => {
    const sucessoInvalido = uploadArquivo({ uso: 'avatar', arquivo: file() });
    FakeXhr.ultimo.responder(201, { id: 'x' });
    const erroSemCorpo = uploadArquivo({ uso: 'avatar', arquivo: file() });
    FakeXhr.ultimo.responder(502, null);

    await expect(sucessoInvalido).rejects.toMatchObject({ status: 201, message: ERRO_INESPERADO });
    await expect(erroSemCorpo).rejects.toMatchObject({ status: 502, body: null });
  });

  it('falha de rede vira erro de conexão', async () => {
    const promessa = uploadArquivo({ uso: 'avatar', arquivo: file() });
    FakeXhr.ultimo.onerror?.();

    await expect(promessa).rejects.toMatchObject({ status: 0, message: ERRO_CONEXAO });
  });

  it('cancela pelo AbortSignal, inclusive já abortado', async () => {
    const controller = new AbortController();
    const promessa = uploadArquivo({ uso: 'avatar', arquivo: file(), signal: controller.signal });
    controller.abort();

    await expect(promessa).rejects.toMatchObject({ name: 'AbortError' });
    expect(FakeXhr.ultimo.abort).toHaveBeenCalled();
    await expect(
      uploadArquivo({ uso: 'avatar', arquivo: file(), signal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });
});

describe('mensagemDoErroDeUpload', () => {
  it('prefere o detalhe do campo arquivo, depois a mensagem geral', () => {
    const comDetalhe = new ApiRequestError(400, {
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      message: 'Dados inválidos',
      details: [{ field: 'arquivo', message: 'Tipo de arquivo não permitido. Envie XML' }],
    });
    const semDetalhe = new ApiRequestError(403, {
      statusCode: 403,
      code: 'FORBIDDEN',
      message: 'Sem permissão',
    });

    expect(mensagemDoErroDeUpload(comDetalhe)).toBe('Tipo de arquivo não permitido. Envie XML');
    expect(mensagemDoErroDeUpload(semDetalhe)).toBe('Sem permissão');
    expect(mensagemDoErroDeUpload(new Error('x'))).toBe(ERRO_INESPERADO);
  });
});
