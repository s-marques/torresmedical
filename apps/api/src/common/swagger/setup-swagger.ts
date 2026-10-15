import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

export const SWAGGER_PATH = 'api/docs';

/** Ligado fora de produção; em produção, só com `SWAGGER_ENABLED=true`. */
export function isSwaggerEnabled(env: NodeJS.ProcessEnv): boolean {
  if (env.SWAGGER_ENABLED !== undefined) return env.SWAGGER_ENABLED === 'true';
  return env.NODE_ENV !== 'production';
}

/** Documentação em `/api/docs` (JSON em `/api/docs/json`). */
export function setupSwagger(app: INestApplication, env: NodeJS.ProcessEnv = process.env): boolean {
  if (!isSwaggerEnabled(env)) return false;
  const config = new DocumentBuilder()
    .setTitle('Torres Medical API')
    .setDescription('API do sistema de gestão da clínica Torres Medical.')
    .setVersion('1.0')
    .addBearerAuth()
    .addSecurityRequirements('bearer')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup(SWAGGER_PATH, app, document, { jsonDocumentUrl: `${SWAGGER_PATH}/json` });
  return true;
}
