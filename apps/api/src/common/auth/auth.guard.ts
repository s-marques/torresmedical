import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Permissao } from '@torres/shared';
import type { Request } from 'express';
import { RequestContextService } from '../context/request-context.service';
import { ApiException } from '../errors/api.exception';
import { ErrorCode } from '../errors/error-codes';
import { AUTHENTICATED_METADATA, PERMISSION_METADATA, PUBLIC_METADATA } from './auth.decorators';
import { SESSAO_INVALIDA } from './auth.service';
import { SessoesService } from './sessoes.service';
import { isUuid } from './tokens';
import type {
  AccessTokenPayload,
  RequisicaoAutenticada,
  UsuarioAutenticado,
} from './usuario-autenticado';

export const NAO_AUTENTICADO = 'Não autenticado';
export const SEM_PERMISSAO = 'Sem permissão';

/**
 * Guard global (CLAUDE.md, seção 6): toda rota exige login, exceto as `@Public()`.
 * Depois do login, a rota precisa declarar o acesso: `@RequirePermission(...)` confere a
 * permissão no perfil (403 sem nenhuma das declaradas) e `@SomenteAutenticado()` libera qualquer usuário logado.
 * Rota sem declaração é negada (403): o padrão é fechado.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly sessoes: SessoesService,
    private readonly context: RequestContextService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    const alvos = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC_METADATA, alvos)) return true;

    const request = context.switchToHttp().getRequest<RequisicaoAutenticada>();
    const usuario = await this.autenticar(request);
    request.usuario = usuario;
    this.context.setUserId(usuario.id);
    this.context.setEscopoDados(usuario.escopo);
    this.context.setVerDadosSensiveis(usuario.verDadosSensiveis);

    const permissoes = this.reflector.getAllAndOverride<readonly Permissao[] | undefined>(
      PERMISSION_METADATA,
      alvos,
    );
    if (permissoes) return this.exigir(usuario, permissoes);
    if (this.reflector.getAllAndOverride<boolean>(AUTHENTICATED_METADATA, alvos)) return true;
    throw new ApiException(403, ErrorCode.FORBIDDEN, SEM_PERMISSAO);
  }

  private async autenticar(request: Request): Promise<UsuarioAutenticado> {
    const token = bearerToken(request);
    if (!token) throw new ApiException(401, ErrorCode.UNAUTHORIZED, NAO_AUTENTICADO);

    let payload: AccessTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessTokenPayload>(token);
    } catch {
      throw new ApiException(401, 'SESSAO_INVALIDA', SESSAO_INVALIDA);
    }
    // Sem os dois ids o filtro do Prisma ignoraria o campo `undefined`: recusa antes.
    const usuario = payloadValido(payload)
      ? await this.sessoes.carregarUsuario(payload.sid, payload.sub)
      : null;
    if (!usuario) throw new ApiException(401, 'SESSAO_INVALIDA', SESSAO_INVALIDA);
    return usuario;
  }

  /** Basta uma das permissões declaradas. */
  private exigir(usuario: UsuarioAutenticado, permissoes: readonly Permissao[]): boolean {
    if (!permissoes.some((permissao) => usuario.permissoes.has(permissao))) {
      throw new ApiException(403, ErrorCode.FORBIDDEN, SEM_PERMISSAO);
    }
    return true;
  }
}

function payloadValido(payload: Partial<AccessTokenPayload>): payload is AccessTokenPayload {
  return (
    typeof payload.sub === 'string' &&
    typeof payload.sid === 'string' &&
    isUuid(payload.sub) &&
    isUuid(payload.sid)
  );
}

function bearerToken(request: Request): string | undefined {
  const [tipo, token] = request.header('authorization')?.split(' ') ?? [];
  return tipo?.toLowerCase() === 'bearer' && token ? token : undefined;
}
