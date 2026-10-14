import { Injectable } from '@nestjs/common';
import { ClsService, type ClsStore } from 'nestjs-cls';

export interface RequestContextStore extends ClsStore {
  userId?: string;
  ip?: string;
}

/** Acesso tipado ao contexto da requisição (requestId, usuário autenticado e IP). */
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

  getIp(): string | undefined {
    return this.cls.isActive() ? this.cls.get('ip') : undefined;
  }
}
