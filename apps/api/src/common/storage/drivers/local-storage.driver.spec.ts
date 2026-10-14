import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Readable } from 'node:stream';
import { LocalStorageDriver } from './local-storage.driver';

async function ler(stream: Readable): Promise<string> {
  const partes: Buffer[] = [];
  for await (const parte of stream) partes.push(parte as Buffer);
  return Buffer.concat(partes).toString();
}

describe('LocalStorageDriver', () => {
  let raiz: string;
  let driver: LocalStorageDriver;

  beforeEach(async () => {
    raiz = join(await mkdtemp(join(tmpdir(), 'torres-local-')), 'arquivos');
    driver = new LocalStorageDriver(raiz);
    await driver.ensureReady();
  });

  afterEach(async () => {
    await rm(join(raiz, '..'), { recursive: true, force: true });
  });

  it('grava em subpastas, lê e remove', async () => {
    await driver.put('avatar/2026/10/abc', Buffer.from('conteúdo'));

    expect(await readFile(join(raiz, 'avatar/2026/10/abc'), 'utf8')).toBe('conteúdo');
    const stream = await driver.get('avatar/2026/10/abc');
    expect(stream).not.toBeNull();
    expect(await ler(stream as Readable)).toBe('conteúdo');

    await driver.delete('avatar/2026/10/abc');
    expect(await driver.get('avatar/2026/10/abc')).toBeNull();
  });

  it('get de chave inexistente ou de pasta devolve null; delete não falha', async () => {
    await driver.put('a/b', Buffer.from('x'));

    expect(await driver.get('nao/existe')).toBeNull();
    expect(await driver.get('a')).toBeNull();
    await expect(driver.delete('nao/existe')).resolves.toBeUndefined();
    expect(() => driver.close()).not.toThrow();
  });

  it('recusa chave que sai da pasta raiz', async () => {
    await expect(driver.put('../fora', Buffer.from('x'))).rejects.toThrow(
      'Chave de arquivo inválida',
    );
    await expect(driver.get('../../etc/passwd')).rejects.toThrow('Chave de arquivo inválida');
  });
});
