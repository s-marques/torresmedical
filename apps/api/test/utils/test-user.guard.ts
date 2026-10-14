import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { RequestContextService } from '../../src/common/context/request-context.service';

/** Header usado só nos e2e para simular o usuário autenticado (até a issue de Autenticação). */
export const TEST_USER_HEADER = 'x-test-user-id';

/** Guard de teste: coloca no contexto o usuário enviado no header. Nunca usado em produção. */
@Injectable()
export class TestUserGuard implements CanActivate {
  constructor(private readonly context: RequestContextService) {}

  canActivate(context: ExecutionContext): boolean {
    const userId = context.switchToHttp().getRequest<Request>().header(TEST_USER_HEADER);
    if (userId) this.context.setUserId(userId);
    return true;
  }
}
