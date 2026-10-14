import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveTestStorageEnv, TEST_URL_SECRET } from './test-storage';

describe('resolveTestStorageEnv', () => {
  it('S3: usa o bucket de teste', () => {
    expect(
      resolveTestStorageEnv({
        STORAGE_DRIVER: 's3',
        STORAGE_S3_BUCKET: 'torres-arquivos',
        STORAGE_S3_BUCKET_TEST: 'torres-arquivos-test',
        STORAGE_URL_SECRET: 'x'.repeat(32),
      }),
    ).toEqual({ STORAGE_S3_BUCKET: 'torres-arquivos-test', STORAGE_URL_SECRET: 'x'.repeat(32) });
  });

  it('S3: recusa bucket que não é de teste', () => {
    expect(() =>
      resolveTestStorageEnv({ STORAGE_DRIVER: 's3', STORAGE_S3_BUCKET: 'torres-arquivos' }),
    ).toThrow(/-test/);
  });

  it('local: pasta temporária e segredo padrão', () => {
    expect(resolveTestStorageEnv({})).toEqual({
      STORAGE_LOCAL_DIR: join(tmpdir(), 'torres-storage-test'),
      STORAGE_URL_SECRET: TEST_URL_SECRET,
    });
  });
});
