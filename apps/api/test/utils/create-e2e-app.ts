import type { INestApplication, ModuleMetadata } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { APP_OPTIONS, setupApp } from '../../src/setup-app';
import { TestUserGuard } from './test-user.guard';

/** Sobe a aplicação completa para e2e, com o usuário de teste vindo do header. */
export async function createE2eApp(metadata: ModuleMetadata = {}): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    ...metadata,
    imports: [AppModule, ...(metadata.imports ?? [])],
    providers: [{ provide: APP_GUARD, useClass: TestUserGuard }, ...(metadata.providers ?? [])],
  }).compile();

  const app = moduleRef.createNestApplication<NestExpressApplication>({
    ...APP_OPTIONS,
    logger: false,
  });
  setupApp(app);
  await app.init();
  return app;
}
