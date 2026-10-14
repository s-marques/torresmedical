import { Injectable } from '@nestjs/common';
import { ClsService, type ClsStore } from 'nestjs-cls';

export interface RequestContextStore extends ClsStore {
  userId?: string;
}

/** Acesso tipado ao contexto da requisição (requestId e usuário autenticado). */
@Injectable()
export class RequestContextService {
  constructor(private readonly cls: ClsService<RequestContextStore>) {}

  getRequestId(): string | undefined {
    return this.cls.isActive() ? this.cls.getId() : undefined;
  }

  getUserId(): string | undefined {
    return this.cls.isActive() ? this.cls.get('userId') : undefined;
  }

  /** Preenchido pelo guard de autenticação. */
  setUserId(userId: string): void {
    this.cls.set('userId', userId);
  }
}
