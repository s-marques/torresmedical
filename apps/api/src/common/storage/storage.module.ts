import {
  Global,
  Inject,
  Module,
  RequestMethod,
  type MiddlewareConsumer,
  type NestModule,
  type OnApplicationShutdown,
  type OnModuleInit,
} from '@nestjs/common';
import { ArquivosController } from './arquivos.controller';
import { ArquivosService } from './arquivos.service';
import { LocalStorageDriver } from './drivers/local-storage.driver';
import { S3StorageDriver } from './drivers/s3-storage.driver';
import { STORAGE_DRIVER, type StorageDriver } from './drivers/storage-driver';
import { loadStorageConfig, STORAGE_CONFIG, type StorageConfig } from './storage.config';
import { UploadMiddleware } from './upload.middleware';

export function createStorageDriver(config: StorageConfig): StorageDriver {
  return config.driver === 's3' && config.s3
    ? new S3StorageDriver(config.s3)
    : new LocalStorageDriver(config.localDir);
}

/** Armazenamento de arquivos (CLAUDE.md, `common/storage`). Exporta o `ArquivosService`. */
@Global()
@Module({
  controllers: [ArquivosController],
  providers: [
    { provide: STORAGE_CONFIG, useFactory: () => loadStorageConfig(process.env) },
    { provide: STORAGE_DRIVER, useFactory: createStorageDriver, inject: [STORAGE_CONFIG] },
    ArquivosService,
  ],
  exports: [ArquivosService],
})
export class StorageModule implements NestModule, OnModuleInit, OnApplicationShutdown {
  constructor(@Inject(STORAGE_DRIVER) private readonly driver: StorageDriver) {}

  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(UploadMiddleware).forRoutes({ path: 'arquivos', method: RequestMethod.POST });
  }

  /** Cria o bucket (ou a pasta) se ainda não existir. */
  async onModuleInit(): Promise<void> {
    await this.driver.ensureReady();
  }

  onApplicationShutdown(): void {
    this.driver.close();
  }
}
