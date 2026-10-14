import { createReadStream } from 'node:fs';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import type { Readable } from 'node:stream';
import type { StorageDriver } from './storage-driver';

/** Driver em disco, para rodar fora do Docker. As chaves viram caminhos relativos à pasta raiz. */
export class LocalStorageDriver implements StorageDriver {
  private readonly root: string;

  constructor(root: string) {
    this.root = resolve(root);
  }

  async ensureReady(): Promise<void> {
    await mkdir(this.root, { recursive: true });
  }

  async put(chave: string, conteudo: Buffer): Promise<void> {
    const path = this.pathOf(chave);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, conteudo);
  }

  async get(chave: string): Promise<Readable | null> {
    const path = this.pathOf(chave);
    const info = await stat(path).catch(() => null);
    return info?.isFile() ? createReadStream(path) : null;
  }

  async delete(chave: string): Promise<void> {
    await rm(this.pathOf(chave), { force: true });
  }

  close(): void {
    // Sem conexões a liberar.
  }

  /** Impede que uma chave saia da pasta raiz (ex.: `../`). */
  private pathOf(chave: string): string {
    const path = resolve(this.root, chave);
    if (!path.startsWith(this.root + sep)) throw new Error('Chave de arquivo inválida');
    return path;
  }
}
