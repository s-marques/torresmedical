import { Controller, Get } from '@nestjs/common';
import type { HealthResponse } from '@torres/shared';
import { Public } from '../common/auth/auth.decorators';
import { MessagingConnection } from '../common/messaging/messaging.connection';

/**
 * Usado pelo healthcheck do Docker e pelo indicador do front: público. Responde 200 enquanto
 * a API estiver no ar; o estado das dependências vai em `checks`.
 */
@Public()
@Controller('health')
export class HealthController {
  constructor(private readonly messaging: MessagingConnection) {}

  @Get()
  check(): HealthResponse {
    return {
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      checks: { mensageria: this.messaging.isConnected() ? 'up' : 'down' },
    };
  }
}
