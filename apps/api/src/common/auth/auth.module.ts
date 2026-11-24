import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';
import { AUTH_CONFIG, loadAuthConfig } from './auth.config';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { DadosSensiveisService } from './dados-sensiveis.service';
import { EscopoDadosService } from './escopo-dados.service';
import { throttlerOptions } from './auth.throttle';
import {
  NOTIFICADOR_REDEFINICAO_SENHA,
  NotificadorRedefinicaoSenhaPendente,
} from './notificador-redefinicao-senha';
import { SessoesService } from './sessoes.service';

/**
 * Autenticação e controle de acesso (CLAUDE.md, `common/auth`): login com JWT + refresh
 * token rotativo, guard global com `@Public()`, `@RequirePermission()` e `@SomenteAutenticado()`.
 */
@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      useFactory: () => ({
        secret: loadAuthConfig(process.env).jwtSecret,
        signOptions: { algorithm: 'HS256' },
        verifyOptions: { algorithms: ['HS256'] },
      }),
    }),
    ThrottlerModule.forRootAsync({
      useFactory: () => throttlerOptions(loadAuthConfig(process.env)),
    }),
  ],
  controllers: [AuthController],
  providers: [
    { provide: AUTH_CONFIG, useFactory: () => loadAuthConfig(process.env) },
    { provide: NOTIFICADOR_REDEFINICAO_SENHA, useClass: NotificadorRedefinicaoSenhaPendente },
    { provide: APP_GUARD, useClass: AuthGuard },
    AuthService,
    SessoesService,
    EscopoDadosService,
    DadosSensiveisService,
  ],
  exports: [AuthService, EscopoDadosService, DadosSensiveisService],
})
export class AuthModule {}
