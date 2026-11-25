import { randomUUID } from 'node:crypto';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { JwtService } from '@nestjs/jwt';
import { PREFERENCIAS_PADRAO } from '@torres/shared';
import type { RequestContextService } from '../context/request-context.service';
import { ApiException } from '../errors/api.exception';
import { AuthGuard } from './auth.guard';
import { Public, RequirePermission, SomenteAutenticado } from './auth.decorators';
import type { SessoesService } from './sessoes.service';
import type { UsuarioAutenticado } from './usuario-autenticado';

class Rotas {
  @Public()
  publica(): void {}

  @RequirePermission('financeiro.caixas.ver')
  comPermissao(): void {}

  @RequirePermission('financeiro.contas-pagar.ver', 'financeiro.caixas.ver')
  qualquerPermissao(): void {}

  @SomenteAutenticado()
  logado(): void {}

  semDeclaracao(): void {}
}

const USUARIO: UsuarioAutenticado = {
  id: randomUUID(),
  sessaoId: randomUUID(),
  empresaId: randomUUID(),
  nome: 'Pessoa Teste',
  email: 'pessoa@example.com',
  perfil: null,
  permissoes: new Set(['financeiro.caixas.ver']),
  escopo: { tipo: 'PROFISSIONAIS', profissionalIds: [] },
  verDadosSensiveis: false,
  avatarArquivoId: null,
  preferencias: PREFERENCIAS_PADRAO,
};

function contexto(handler: keyof Rotas, authorization?: string, tipo = 'http') {
  const request = {
    header: (nome: string) => (nome === 'authorization' ? authorization : undefined),
  };
  return {
    request,
    context: {
      getType: () => tipo,
      getHandler: () => Rotas.prototype[handler],
      getClass: () => Rotas,
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext,
  };
}

function criarGuard(usuario: UsuarioAutenticado | null = USUARIO) {
  const jwt = {
    verifyAsync: jest.fn(async (token: string) => {
      if (token !== 'valido') throw new Error('inválido');
      return { sub: USUARIO.id, sid: USUARIO.sessaoId };
    }),
  } as unknown as JwtService;
  const sessoes = { carregarUsuario: jest.fn(async () => usuario) } as unknown as SessoesService;
  const requestContext = {
    setUserId: jest.fn(),
    setEscopoDados: jest.fn(),
    setVerDadosSensiveis: jest.fn(),
    setVerProntuario: jest.fn(),
  } as unknown as RequestContextService;
  return { guard: new AuthGuard(new Reflector(), jwt, sessoes, requestContext), requestContext };
}

async function status(promessa: Promise<unknown>): Promise<number> {
  try {
    await promessa;
    return 200;
  } catch (error) {
    return error instanceof ApiException ? error.getStatus() : 500;
  }
}

describe('AuthGuard', () => {
  it('libera rotas públicas e contextos que não são HTTP sem token', async () => {
    const { guard } = criarGuard();

    expect(await guard.canActivate(contexto('publica').context)).toBe(true);
    expect(await guard.canActivate(contexto('semDeclaracao', undefined, 'rpc').context)).toBe(true);
  });

  it('401 sem token, com token inválido ou com sessão encerrada', async () => {
    expect(await status(criarGuard().guard.canActivate(contexto('logado').context))).toBe(401);
    expect(
      await status(criarGuard().guard.canActivate(contexto('logado', 'Bearer x').context)),
    ).toBe(401);
    expect(
      await status(criarGuard(null).guard.canActivate(contexto('logado', 'Bearer valido').context)),
    ).toBe(401);
  });

  it('preenche o usuário na requisição e no contexto (auditoria)', async () => {
    const { guard, requestContext } = criarGuard();
    const { context, request } = contexto('logado', 'Bearer valido');

    expect(await guard.canActivate(context)).toBe(true);
    expect((request as { usuario?: UsuarioAutenticado }).usuario).toBe(USUARIO);
    expect(requestContext.setUserId).toHaveBeenCalledWith(USUARIO.id);
    expect(requestContext.setEscopoDados).toHaveBeenCalledWith(USUARIO.escopo);
    expect(requestContext.setVerDadosSensiveis).toHaveBeenCalledWith(false);
    expect(requestContext.setVerProntuario).toHaveBeenCalledWith(false);
  });

  it('marca no contexto quem tem a permissão de ver o prontuário', async () => {
    const comProntuario = {
      ...USUARIO,
      permissoes: new Set(['consultorio-assistencial.prontuarios.ver'] as const),
    };
    const { guard, requestContext } = criarGuard(comProntuario);

    await guard.canActivate(contexto('logado', 'Bearer valido').context);

    expect(requestContext.setVerProntuario).toHaveBeenCalledWith(true);
  });

  it('confere a permissão: libera com ela e responde 403 sem ela', async () => {
    const semPermissao = { ...USUARIO, permissoes: new Set<never>() };

    expect(
      await criarGuard().guard.canActivate(contexto('comPermissao', 'Bearer valido').context),
    ).toBe(true);
    expect(
      await status(
        criarGuard(semPermissao).guard.canActivate(
          contexto('comPermissao', 'Bearer valido').context,
        ),
      ),
    ).toBe(403);
  });

  it('com várias permissões, basta uma delas', async () => {
    const outra = { ...USUARIO, permissoes: new Set(['financeiro.contas-receber.ver'] as const) };

    expect(
      await criarGuard().guard.canActivate(contexto('qualquerPermissao', 'Bearer valido').context),
    ).toBe(true);
    expect(
      await status(
        criarGuard(outra).guard.canActivate(contexto('qualquerPermissao', 'Bearer valido').context),
      ),
    ).toBe(403);
  });

  it('rota sem declaração de acesso é negada (403), mesmo com login', async () => {
    expect(
      await status(
        criarGuard().guard.canActivate(contexto('semDeclaracao', 'Bearer valido').context),
      ),
    ).toBe(403);
  });
});
