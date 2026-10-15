import { Controller, Get } from '@nestjs/common';
import type { HealthResponse } from '@torres/shared';
import { Public } from '../common/auth/auth.decorators';

/** Usado pelo healthcheck do Docker e pelo indicador do front: público. */
@Public()
@Controller('health')
export class HealthController {
  @Get()
  check(): HealthResponse {
    return {
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  }
}
