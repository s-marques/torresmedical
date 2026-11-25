import type { INestApplication, ModuleMetadata } from '@nestjs/common';
import { Test, type TestingModuleBuilder } from '@nestjs/testing';
import { AppModule } from '../../src/app.module';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { APP_OPTIONS, setupApp } from '../../src/setup-app';

/**
 * Sobe a aplicação completa para e2e, com a autenticação real (guard global).
 * Para chamar rotas protegidas, use `criarUsuarioTeste` e `comUsuario` (`./auth`).
 */
export async function createE2eApp(
  metadata: ModuleMetadata = {},
  /** Troca providers por fakes: `(b) => b.overrideProvider(TOKEN).useValue(fake)`. */
  configure: (builder: TestingModuleBuilder) => TestingModuleBuilder = (builder) => builder,
): Promise<INestApplication> {
  const moduleRef = await configure(
    Test.createTestingModule({
      ...metadata,
      imports: [AppModule, ...(metadata.imports ?? [])],
    }),
  ).compile();

  const app = moduleRef.createNestApplication<NestExpressApplication>({
    ...APP_OPTIONS,
    logger: false,
  });
  setupApp(app);
  await app.init();
  return app;
}
