import type { Readable } from 'node:stream';

/** Interface única do armazenamento de arquivos. Implementações: disco local (dev) e S3/MinIO. */
export interface StorageDriver {
  /** Prepara o armazenamento (ex.: cria o bucket). Chamado na subida da aplicação. */
  ensureReady(): Promise<void>;
  put(chave: string, conteudo: Buffer, contentType: string): Promise<void>;
  /** Conteúdo do objeto, ou `null` se ele não existir. */
  get(chave: string): Promise<Readable | null>;
  /** Remove o objeto. Não falha se ele não existir. */
  delete(chave: string): Promise<void>;
  /** Libera conexões abertas. Chamado no encerramento da aplicação. */
  close(): void;
}

export const STORAGE_DRIVER = Symbol('STORAGE_DRIVER');
