import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { AuditModule } from './common/audit/audit.module';
import { AuthModule } from './common/auth/auth.module';
import { RequestContextModule } from './common/context/request-context.module';
import { AllExceptionsFilter } from './common/errors/all-exceptions.filter';
import { ExportModule } from './common/export/export.module';
import { LoggerModule } from './common/logger/logger.module';
import { PrismaModule } from './common/prisma/prisma.module';
import { StorageModule } from './common/storage/storage.module';
import { HealthModule } from './health/health.module';
import { ConfiguracoesGestaoModule } from './modules/configuracoes-gestao/configuracoes-gestao.module';

@Module({
  imports: [
    RequestContextModule,
    LoggerModule,
    PrismaModule,
    AuditModule,
    AuthModule,
    ExportModule,
    StorageModule,
    HealthModule,
    ConfiguracoesGestaoModule,
  ],
  providers: [{ provide: APP_FILTER, useClass: AllExceptionsFilter }],
})
export class AppModule {}
