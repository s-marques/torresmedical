import { LocalStorageDriver } from './drivers/local-storage.driver';
import { S3StorageDriver } from './drivers/s3-storage.driver';
import type { StorageConfig } from './storage.config';
import { createStorageDriver } from './storage.module';

const BASE: StorageConfig = {
  driver: 'local',
  localDir: '/tmp/torres',
  urlSecret: 's'.repeat(32),
  urlTtlSeconds: 300,
};

describe('createStorageDriver', () => {
  it('escolhe o driver pela configuração', () => {
    expect(createStorageDriver(BASE)).toBeInstanceOf(LocalStorageDriver);
    expect(
      createStorageDriver({
        ...BASE,
        driver: 's3',
        s3: {
          endpoint: 'http://minio:9000',
          region: 'us-east-1',
          bucket: 'b',
          accessKeyId: 'k',
          secretAccessKey: 's',
        },
      }),
    ).toBeInstanceOf(S3StorageDriver);
  });
});
