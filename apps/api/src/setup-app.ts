import type { INestApplication } from '@nestjs/common';

export const API_PREFIX = 'api';

/** Configuração comum à aplicação real e aos testes e2e. */
export function setupApp(app: INestApplication): void {
  app.setGlobalPrefix(API_PREFIX);
  app.enableShutdownHooks();
}
