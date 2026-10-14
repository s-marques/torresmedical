import { resolve } from 'node:path';
import { loadStorageConfig } from './storage.config';

const SECRET = 's'.repeat(32);
const S3_ENV = {
  STORAGE_DRIVER: 's3',
  STORAGE_URL_SECRET: SECRET,
  STORAGE_S3_ENDPOINT: 'http://minio:9000',
  STORAGE_S3_BUCKET: 'torres-arquivos',
  STORAGE_S3_ACCESS_KEY: 'chave',
  STORAGE_S3_SECRET_KEY: 'segredo',
};

describe('loadStorageConfig', () => {
  it('padrão: driver local em ./storage e links de 5 minutos', () => {
    expect(loadStorageConfig({ STORAGE_URL_SECRET: SECRET })).toEqual({
      driver: 'local',
      localDir: resolve('storage'),
      s3: undefined,
      urlSecret: SECRET,
      urlTtlSeconds: 300,
    });
  });

  it('driver s3 com as variáveis do MinIO', () => {
    expect(loadStorageConfig({ ...S3_ENV, STORAGE_URL_TTL_SECONDS: '60' })).toMatchObject({
      driver: 's3',
      urlTtlSeconds: 60,
      s3: {
        endpoint: 'http://minio:9000',
        region: 'us-east-1',
        bucket: 'torres-arquivos',
        accessKeyId: 'chave',
        secretAccessKey: 'segredo',
      },
    });
  });

  it('falha cedo com configuração inválida', () => {
    expect(() => loadStorageConfig({ STORAGE_URL_SECRET: SECRET, STORAGE_DRIVER: 'ftp' })).toThrow(
      /STORAGE_DRIVER/,
    );
    expect(() => loadStorageConfig({ STORAGE_URL_SECRET: 'curto' })).toThrow(/STORAGE_URL_SECRET/);
    expect(() => loadStorageConfig({})).toThrow(/STORAGE_URL_SECRET/);
    expect(() =>
      loadStorageConfig({ STORAGE_URL_SECRET: SECRET, STORAGE_URL_TTL_SECONDS: '0' }),
    ).toThrow(/STORAGE_URL_TTL_SECONDS/);
    expect(() => loadStorageConfig({ ...S3_ENV, STORAGE_S3_BUCKET: '' })).toThrow(
      /STORAGE_S3_BUCKET/,
    );
  });
});
