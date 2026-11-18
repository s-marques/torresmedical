import { Injectable } from '@nestjs/common';
import { ClsService, type ClsStore } from 'nestjs-cls';
import type { EscopoDados } from '../auth/escopo-dados';

export interface RequestContextStore extends ClsStore {
  userId?: string;
  ip?: string;
  escopoDados?: EscopoDados;
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

  /** Escopo de dados do usuário autenticado (issue #153). Use `EscopoDadosService`. */
  getEscopoDados(): EscopoDados | undefined {
    return this.cls.isActive() ? this.cls.get('escopoDados') : undefined;
  }

  /** Preenchido pelo guard de autenticação. */
  setEscopoDados(escopo: EscopoDados): void {
    this.cls.set('escopoDados', escopo);
  }

  getIp(): string | undefined {
    return this.cls.isActive() ? this.cls.get('ip') : undefined;
  }
}
