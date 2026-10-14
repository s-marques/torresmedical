import { Module } from '@nestjs/common';
import { RequestContextModule } from './common/context/request-context.module';
import { LoggerModule } from './common/logger/logger.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [RequestContextModule, LoggerModule, HealthModule],
})
export class AppModule {}
