import type { NestApplicationOptions } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { mapBodyParserErrors } from './common/errors/body-parser-errors';
import { setupSwagger } from './common/swagger/setup-swagger';

export const API_PREFIX = 'api';

/** Proxies confiáveis: loopback e redes privadas (Docker). */
export const TRUST_PROXY = 'loopback, linklocal, uniquelocal';

/** Opções de criação da aplicação (real e e2e): o body-parser é registrado em `setupApp`. */
export const APP_OPTIONS: NestApplicationOptions = { bodyParser: false };

/** Configuração comum à aplicação real e aos testes e2e. */
export function setupApp(app: NestExpressApplication): void {
  // O web chega pelo proxy (Vite no Docker): confia no X-Forwarded-For só da rede local/privada,
  // para o IP real valer no rate limit e na auditoria.
  app.set('trust proxy', TRUST_PROXY);
  app.use(cookieParser());
  app.useBodyParser('json');
  app.useBodyParser('urlencoded', { extended: true });
  app.use(mapBodyParserErrors);
  app.setGlobalPrefix(API_PREFIX);
  app.enableShutdownHooks();
  setupSwagger(app);
}
