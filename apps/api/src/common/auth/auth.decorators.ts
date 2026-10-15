import { createParamDecorator, SetMetadata, type ExecutionContext } from '@nestjs/common';
import type { Permissao } from '@torres/shared';
import type { RequisicaoAutenticada, UsuarioAutenticado } from './usuario-autenticado';

export const PUBLIC_METADATA = 'auth:public';
export const PERMISSION_METADATA = 'auth:permission';
export const AUTHENTICATED_METADATA = 'auth:authenticated';

/** Rota sem login (CLAUDE.md, seção 6). Todo o resto é protegido pelo guard global. */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(PUBLIC_METADATA, true);

/**
 * Exige a permissão (`<modulo>.<recurso>.<acao>`) no perfil do usuário: sem login → 401,
 * sem a permissão → 403. Ex.: `@RequirePermission('financeiro.contas-receber.criar')`.
 * Com várias, basta uma delas (ex.: lookups usados por telas de módulos diferentes).
 */
export const RequirePermission = (
  ...permissoes: readonly [Permissao, ...Permissao[]]
): MethodDecorator & ClassDecorator => SetMetadata(PERMISSION_METADATA, permissoes);

/**
 * Exige só o login, sem permissão específica. Para recursos de infraestrutura usados por várias
 * telas (ex.: upload de arquivos) e para o próprio usuário (`/auth/me`).
 */
export const SomenteAutenticado = (): MethodDecorator & ClassDecorator =>
  SetMetadata(AUTHENTICATED_METADATA, true);

/** Usuário autenticado da requisição (preenchido pelo guard global). */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): UsuarioAutenticado | undefined =>
    context.switchToHttp().getRequest<RequisicaoAutenticada>().usuario,
);
