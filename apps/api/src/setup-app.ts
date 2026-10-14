import type { NestApplicationOptions } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { mapBodyParserErrors } from './common/errors/body-parser-errors';
import { setupSwagger } from './common/swagger/setup-swagger';

export const API_PREFIX = 'api';

/** Opções de criação da aplicação (real e e2e): o body-parser é registrado em `setupApp`. */
export const APP_OPTIONS: NestApplicationOptions = { bodyParser: false };

/** Configuração comum à aplicação real e aos testes e2e. */
export function setupApp(app: NestExpressApplication): void {
  app.useBodyParser('json');
  app.useBodyParser('urlencoded', { extended: true });
  app.use(mapBodyParserErrors);
  app.setGlobalPrefix(API_PREFIX);
  app.enableShutdownHooks();
  setupSwagger(app);
}
