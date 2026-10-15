import { Body, Controller, Get, HttpCode, Inject, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle, ThrottlerGuard } from '@nestjs/throttler';
import {
  esqueciSenhaSchema,
  loginSchema,
  redefinirSenhaSchema,
  sessaoSchema,
  usuarioSessaoSchema,
  type EsqueciSenhaInput,
  type LoginInput,
  type RedefinirSenhaInput,
  type Sessao,
  type UsuarioSessao,
} from '@torres/shared';
import type { CookieOptions, Request, Response } from 'express';
import { ApiErrorResponses, ApiZodBody, ApiZodResponse } from '../swagger/zod-openapi';
import { ZodValidationPipe } from '../validation/zod-validation.pipe';
import { AUTH_CONFIG, type AuthConfig } from './auth.config';
import { CurrentUser, Public, SomenteAutenticado } from './auth.decorators';
import { AuthService, type SessaoComRefresh } from './auth.service';
import { THROTTLE_LOGIN, THROTTLE_SENHA } from './auth.throttle';
import { toUsuarioSessao, type UsuarioAutenticado } from './usuario-autenticado';

export const REFRESH_COOKIE = 'torres_refresh';
/** O cookie só vai para as rotas de autenticação, nunca para o resto da API. */
export const REFRESH_COOKIE_PATH = '/api/auth';

@ApiTags('Autenticação')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
  ) {}

  @Post('login')
  @Public()
  @HttpCode(200)
  @UseGuards(ThrottlerGuard)
  @SkipThrottle({ [THROTTLE_SENHA]: true })
  @ApiOperation({ summary: 'Entra com e-mail e senha. O refresh token vai em cookie httpOnly' })
  @ApiZodBody(loginSchema)
  @ApiZodResponse(200, sessaoSchema)
  @ApiErrorResponses(400, 401, 429)
  async login(
    @Body(new ZodValidationPipe(loginSchema)) body: LoginInput,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<Sessao> {
    const resultado = await this.auth.login(body, {
      ip: request.ip,
      userAgent: request.header('user-agent'),
    });
    return this.responder(response, resultado);
  }

  @Post('refresh')
  @Public()
  @HttpCode(200)
  @ApiCookieAuth(REFRESH_COOKIE)
  @ApiOperation({ summary: 'Renova o access token pelo cookie (e troca o refresh token)' })
  @ApiZodResponse(200, sessaoSchema)
  @ApiErrorResponses(401)
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<Sessao> {
    try {
      return this.responder(response, await this.auth.refresh(refreshCookie(request)));
    } catch (error) {
      response.clearCookie(REFRESH_COOKIE, this.cookieOptions());
      throw error;
    }
  }

  @Post('logout')
  @Public()
  @HttpCode(204)
  @ApiCookieAuth(REFRESH_COOKIE)
  @ApiOperation({
    summary: 'Encerra a sessão do cookie. Funciona mesmo com o access token vencido',
  })
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.auth.logout(refreshCookie(request));
    response.clearCookie(REFRESH_COOKIE, this.cookieOptions());
  }

  @Get('me')
  @SomenteAutenticado()
  @ApiOperation({ summary: 'Usuário logado e as permissões do perfil' })
  @ApiZodResponse(200, usuarioSessaoSchema)
  @ApiErrorResponses(401)
  me(@CurrentUser() usuario: UsuarioAutenticado): UsuarioSessao {
    return toUsuarioSessao(usuario);
  }

  @Post('esqueci-senha')
  @Public()
  @HttpCode(202)
  @UseGuards(ThrottlerGuard)
  @SkipThrottle({ [THROTTLE_LOGIN]: true })
  @ApiOperation({
    summary: 'Pede o link de redefinição de senha',
    description: 'Responde 202 exista ou não o e-mail, para não revelar quais contas existem.',
  })
  @ApiZodBody(esqueciSenhaSchema)
  @ApiErrorResponses(400, 429)
  async esqueciSenha(
    @Body(new ZodValidationPipe(esqueciSenhaSchema)) body: EsqueciSenhaInput,
  ): Promise<void> {
    await this.auth.esqueciSenha(body);
  }

  @Post('redefinir-senha')
  @Public()
  @HttpCode(204)
  @UseGuards(ThrottlerGuard)
  @SkipThrottle({ [THROTTLE_LOGIN]: true })
  @ApiOperation({ summary: 'Troca a senha pelo link de redefinição e encerra as sessões' })
  @ApiZodBody(redefinirSenhaSchema)
  @ApiErrorResponses(400, 429)
  async redefinirSenha(
    @Body(new ZodValidationPipe(redefinirSenhaSchema)) body: RedefinirSenhaInput,
  ): Promise<void> {
    await this.auth.redefinirSenha(body);
  }

  private responder(response: Response, { sessao, refreshToken }: SessaoComRefresh): Sessao {
    response.cookie(REFRESH_COOKIE, refreshToken, {
      ...this.cookieOptions(),
      maxAge: this.config.refreshTtlSeconds * 1000,
    });
    response.setHeader('Cache-Control', 'no-store');
    return sessao;
  }

  private cookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      secure: this.config.cookieSecure,
      sameSite: 'strict',
      path: REFRESH_COOKIE_PATH,
    };
  }
}

function refreshCookie(request: Request): string | undefined {
  const valor: unknown = request.cookies?.[REFRESH_COOKIE];
  return typeof valor === 'string' && valor ? valor : undefined;
}
