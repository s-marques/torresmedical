import { fakerPT_BR as faker } from '@faker-js/faker';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Permissao } from '@torres/shared';
import request from 'supertest';
import { hashSenha } from '../../src/common/auth/senhas';
import { SessoesService, USUARIO_COM_PERMISSOES } from '../../src/common/auth/sessoes.service';
import type { AccessTokenPayload } from '../../src/common/auth/usuario-autenticado';
import { PrismaService } from '../../src/common/prisma/prisma.service';

export const SENHA_TESTE = 'senha-de-teste-1';

export interface UsuarioTeste {
  id: string;
  email: string;
  senha: string;
  perfilId: string;
  empresaId: string;
  accessToken: string;
  refreshToken: string;
  /** Valor do header `Authorization`. */
  authorization: string;
}

export interface OpcoesUsuarioTeste {
  permissoes?: readonly Permissao[];
  ativo?: boolean;
  empresaId?: string;
  /** Issue #153: perfil restrito aos profissionais vinculados. */
  escopoDados?: 'TODOS' | 'PROFISSIONAIS_VINCULADOS';
  /** Issue #153: profissionais vinculados ao usuário. */
  profissionalIds?: readonly string[];
}

/**
 * Cria um usuário fictício com um perfil só com as permissões pedidas, e uma sessão real
 * (refresh token no banco + access token assinado), sem passar pelo login nem pelo rate limit.
 */
export async function criarUsuarioTeste(
  app: INestApplication,
  {
    permissoes = [],
    ativo = true,
    empresaId,
    escopoDados = 'TODOS',
    profissionalIds = [],
  }: OpcoesUsuarioTeste = {},
): Promise<UsuarioTeste> {
  const prisma = app.get(PrismaService);
  const empresa =
    empresaId ??
    (
      await prisma.empresa.create({
        data: { nome: faker.company.name(), documento: faker.string.numeric(14) },
      })
    ).id;
  const perfil = await prisma.perfil.create({
    data: {
      nome: `Perfil ${faker.string.uuid()}`,
      escopoDados,
      permissoes: { create: permissoes.map((permissao) => ({ permissao })) },
    },
  });
  const usuario = await prisma.usuario.create({
    data: {
      empresaId: empresa,
      perfilId: perfil.id,
      nome: faker.person.fullName(),
      email: `teste.${faker.string.uuid()}@example.com`,
      senhaHash: await hashSenha(SENHA_TESTE),
      ativo,
      profissionais: { create: profissionalIds.map((profissionalId) => ({ profissionalId })) },
    },
    include: USUARIO_COM_PERMISSOES,
  });

  const { refreshToken, usuario: autenticado } = await app.get(SessoesService).criar(usuario, {});
  const payload: AccessTokenPayload = { sub: usuario.id, sid: autenticado.sessaoId };
  const accessToken = await app.get(JwtService).signAsync(payload);

  return {
    id: usuario.id,
    email: usuario.email,
    senha: SENHA_TESTE,
    perfilId: perfil.id,
    empresaId: empresa,
    accessToken,
    refreshToken,
    authorization: `Bearer ${accessToken}`,
  };
}

/** Cliente HTTP dos e2e com o token do usuário em todas as requisições. */
export function comUsuario(app: INestApplication, usuario: UsuarioTeste) {
  return request.agent(app.getHttpServer()).set('Authorization', usuario.authorization);
}
