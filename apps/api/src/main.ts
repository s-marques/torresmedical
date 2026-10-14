import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { APP_OPTIONS, setupApp } from './setup-app';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    ...APP_OPTIONS,
    bufferLogs: true,
  });
  app.useLogger(app.get(Logger));
  setupApp(app);
  await app.listen(Number(process.env.API_PORT ?? 3000), '0.0.0.0');
}

void bootstrap();
