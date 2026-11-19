import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { apiErrorSchema, sessaoSchema, usuarioSessaoSchema } from '@torres/shared';
import request from 'supertest';
import { REFRESH_COOKIE } from '../../src/common/auth/auth.controller';
import {
  NOTIFICADOR_REDEFINICAO_SENHA,
  type NotificadorRedefinicaoSenha,
  type PedidoRedefinicaoSenha,
} from '../../src/common/auth/notificador-redefinicao-senha';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { comUsuario, criarUsuarioTeste, SENHA_TESTE, type UsuarioTeste } from '../utils/auth';
import { createE2eApp } from '../utils/create-e2e-app';
import { truncateAll } from '../utils/database';
import { expectAudit } from '../utils/expect-audit';

const AUTH = '/api/auth';

describe('Autenticação (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let usuario: UsuarioTeste;
  /** IP próprio por teste: o rate limit é por IP e o contador vive enquanto o app vive. */
  let ip: string;

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await truncateAll(prisma);
    usuario = await criarUsuarioTeste(app, {
      permissoes: ['financeiro.caixas.ver', 'financeiro.caixas.criar'],
    });
    ip = `10.0.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
  });

  afterAll(async () => {
    await app.close();
  });

  function http() {
    return request(app.getHttpServer());
  }

  function login(email = usuario.email, senha = SENHA_TESTE) {
    return http().post(`${AUTH}/login`).set('X-Forwarded-For', ip).send({ email, senha });
  }

  /** Valor do cookie de refresh no `Set-Cookie` da resposta. */
  function cookieDe(res: request.Response): string {
    const cookies = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
    const cookie = cookies.find((c) => c.startsWith(`${REFRESH_COOKIE}=`));
    if (!cookie) throw new Error('Resposta sem o cookie de refresh');
    return cookie;
  }

  /** A sessão criada pelo login (a do `criarUsuarioTeste` não tem IP). */
  function sessaoDoLogin() {
    return prisma.sessao.findFirstOrThrow({ where: { usuarioId: usuario.id, ip: { not: null } } });
  }

  function valorDoCookie(cookie: string): string {
    return cookie.split(';')[0] ?? '';
  }

  describe('POST /login', () => {
    it('entra, devolve a sessão e grava o refresh token em cookie httpOnly', async () => {
      const res = await login().expect(200);

      const sessao = sessaoSchema.parse(res.body);
      expect(sessao.usuario).toMatchObject({ id: usuario.id, email: usuario.email });
      expect(sessao.usuario.permissoes).toEqual([
        'financeiro.caixas.criar',
        'financeiro.caixas.ver',
      ]);
      const cookie = cookieDe(res);
      expect(cookie).toMatch(/HttpOnly/i);
      expect(cookie).toMatch(/SameSite=Strict/i);
      expect(cookie).toMatch(/Path=\/api\/auth/);
      expect(res.headers['cache-control']).toBe('no-store');

      const banco = await prisma.usuario.findUniqueOrThrow({ where: { id: usuario.id } });
      expect(banco.ultimoLoginEm).toBeInstanceOf(Date);
    });

    it('a senha e o hash nunca aparecem na resposta', async () => {
      const res = await login().expect(200);

      expect(JSON.stringify(res.body)).not.toMatch(/senha|argon2|Hash/i);
    });

    it.each([
      ['senha errada', () => login(usuario.email, 'senha-errada-9')],
      ['e-mail inexistente', () => login('ninguem@example.com')],
    ])('%s: 401 com mensagem genérica', async (_caso, tentar) => {
      const res = await tentar().expect(401);

      expect(apiErrorSchema.parse(res.body)).toMatchObject({
        code: 'CREDENCIAIS_INVALIDAS',
        message: 'E-mail ou senha inválidos',
      });
    });

    it('usuário inativo ou sem senha: o mesmo 401 genérico', async () => {
      const inativo = await criarUsuarioTeste(app, { ativo: false });
      await prisma.usuario.update({ where: { id: usuario.id }, data: { senhaHash: null } });

      const resInativo = await login(inativo.email).expect(401);
      const resSemSenha = await login().expect(401);

      expect(resInativo.body.message).toBe('E-mail ou senha inválidos');
      expect(resSemSenha.body.message).toBe('E-mail ou senha inválidos');
    });

    it('400 com details por campo para dados inválidos', async () => {
      const res = await http()
        .post(`${AUTH}/login`)
        .set('X-Forwarded-For', ip)
        .send({ email: 'x' })
        .expect(400);

      expect(res.body.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'email', message: 'E-mail inválido' }),
          expect.objectContaining({ field: 'senha', message: 'Informe a senha' }),
        ]),
      );
    });

    it('limita 5 tentativas por minuto por IP (429)', async () => {
      for (let i = 0; i < 5; i++) await login(usuario.email, 'senha-errada-9').expect(401);

      const res = await login().expect(429);

      expect(res.body).toMatchObject({ statusCode: 429, code: 'TOO_MANY_REQUESTS' });
      ip = '10.255.0.1';
      await login().expect(200);
    });
  });

  describe('POST /refresh', () => {
    it('renova pelo cookie, troca o refresh token e o antigo deixa de valer', async () => {
      const primeiro = valorDoCookie(cookieDe(await login().expect(200)));

      const res = await http().post(`${AUTH}/refresh`).set('Cookie', primeiro).expect(200);
      const segundo = valorDoCookie(cookieDe(res));
      const sessao = sessaoSchema.parse(res.body);

      expect(segundo).not.toBe(primeiro);
      await http().get(`${AUTH}/me`).auth(sessao.accessToken, { type: 'bearer' }).expect(200);
      await http().post(`${AUTH}/refresh`).set('Cookie', segundo).expect(200);
    });

    it('reuso de um refresh token antigo revoga a sessão (roubo de token)', async () => {
      const primeiro = valorDoCookie(cookieDe(await login().expect(200)));
      const res = await http().post(`${AUTH}/refresh`).set('Cookie', primeiro).expect(200);
      const segundo = valorDoCookie(cookieDe(res));

      await http().post(`${AUTH}/refresh`).set('Cookie', primeiro).expect(401);

      // A sessão foi revogada: nem o token novo vale mais.
      await http().post(`${AUTH}/refresh`).set('Cookie', segundo).expect(401);
      await http()
        .get(`${AUTH}/me`)
        .auth(sessaoSchema.parse(res.body).accessToken, { type: 'bearer' })
        .expect(401);
      const sessao = await sessaoDoLogin();
      expect(sessao.revogadaEm).toBeInstanceOf(Date);
    });

    it('sem cookie ou com cookie inválido: 401 e o cookie é apagado', async () => {
      const semCookie = await http().post(`${AUTH}/refresh`).expect(401);
      const invalido = await http()
        .post(`${AUTH}/refresh`)
        .set('Cookie', `${REFRESH_COOKIE}=${randomUUID()}.segredo-falso`)
        .expect(401);

      expect(semCookie.body).toMatchObject({ code: 'SESSAO_INVALIDA' });
      expect(cookieDe(invalido)).toMatch(new RegExp(`^${REFRESH_COOKIE}=;`));
    });

    it('sessão expirada não renova', async () => {
      const cookie = valorDoCookie(cookieDe(await login().expect(200)));
      await prisma.sessao.updateMany({ data: { expiraEm: new Date(Date.now() - 1000) } });

      const res = await http().post(`${AUTH}/refresh`).set('Cookie', cookie).expect(401);

      expect(res.body).toMatchObject({ code: 'SESSAO_INVALIDA' });
    });

    it('usuário desativado não renova', async () => {
      const cookie = valorDoCookie(cookieDe(await login().expect(200)));
      await prisma.usuario.update({ where: { id: usuario.id }, data: { ativo: false } });

      const res = await http().post(`${AUTH}/refresh`).set('Cookie', cookie).expect(401);

      expect(res.body).toMatchObject({ code: 'SESSAO_INVALIDA' });
      const sessao = await sessaoDoLogin();
      expect(sessao.revogadaEm).toBeInstanceOf(Date);
    });
  });

  describe('POST /logout', () => {
    it('encerra a sessão: o refresh e o access token deixam de valer', async () => {
      const res = await login().expect(200);
      const cookie = valorDoCookie(cookieDe(res));
      const { accessToken } = sessaoSchema.parse(res.body);

      const saida = await http().post(`${AUTH}/logout`).set('Cookie', cookie).expect(204);

      expect(cookieDe(saida)).toMatch(new RegExp(`^${REFRESH_COOKIE}=;`));
      await http().post(`${AUTH}/refresh`).set('Cookie', cookie).expect(401);
      await http().get(`${AUTH}/me`).auth(accessToken, { type: 'bearer' }).expect(401);
    });

    it('sem cookie também responde 204', async () => {
      const res = await http().post(`${AUTH}/logout`).expect(204);

      expect(res.body).toEqual({});
    });
  });

  describe('GET /me e o guard global', () => {
    it('devolve o usuário logado com as permissões do perfil', async () => {
      const res = await comUsuario(app, usuario).get(`${AUTH}/me`).expect(200);

      expect(usuarioSessaoSchema.parse(res.body)).toMatchObject({
        id: usuario.id,
        perfil: { id: usuario.perfilId },
        permissoes: ['financeiro.caixas.criar', 'financeiro.caixas.ver'],
      });
    });

    it('perfil inativo não concede permissões', async () => {
      await prisma.perfil.update({ where: { id: usuario.perfilId }, data: { ativo: false } });

      const res = await comUsuario(app, usuario).get(`${AUTH}/me`).expect(200);

      expect(res.body.permissoes).toEqual([]);
    });

    it.each([
      ['sem token', undefined],
      ['com token malformado', 'Bearer nao-e-jwt'],
      ['com outro esquema', 'Basic dXN1YXJpbzpzZW5oYQ=='],
    ])('401 %s', async (_caso, authorization) => {
      const req = http().get(`${AUTH}/me`);
      const res = await (authorization ? req.set('Authorization', authorization) : req).expect(401);

      expect(res.body.statusCode).toBe(401);
    });

    it('401 para token assinado com outro segredo ou sem os ids', async () => {
      const outroSegredo = await new JwtService({ secret: 'x'.repeat(40) }).signAsync({
        sub: usuario.id,
        sid: randomUUID(),
      });
      const semIds = await app.get(JwtService).signAsync({ sub: 'qualquer' });

      const res1 = await http()
        .get(`${AUTH}/me`)
        .auth(outroSegredo, { type: 'bearer' })
        .expect(401);
      const res2 = await http().get(`${AUTH}/me`).auth(semIds, { type: 'bearer' }).expect(401);

      expect([res1.body.code, res2.body.code]).toEqual(['SESSAO_INVALIDA', 'SESSAO_INVALIDA']);
    });

    it('401 quando o usuário é desativado ou excluído depois do login', async () => {
      const excluido = await criarUsuarioTeste(app);
      await prisma.usuario.update({ where: { id: usuario.id }, data: { ativo: false } });
      await prisma.usuario.update({ where: { id: excluido.id }, data: { deletedAt: new Date() } });

      const inativo = await comUsuario(app, usuario).get(`${AUTH}/me`).expect(401);
      const removido = await comUsuario(app, excluido).get(`${AUTH}/me`).expect(401);

      expect([inativo.body.code, removido.body.code]).toEqual([
        'SESSAO_INVALIDA',
        'SESSAO_INVALIDA',
      ]);
    });
  });

  describe('esqueci e redefinir a senha', () => {
    let pedidos: PedidoRedefinicaoSenha[];

    beforeEach(() => {
      pedidos = [];
      const notificador = app.get<NotificadorRedefinicaoSenha>(NOTIFICADOR_REDEFINICAO_SENHA);
      jest.spyOn(notificador, 'enviar').mockImplementation(async (pedido) => {
        pedidos.push(pedido);
      });
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    function esqueci(email: string) {
      return http().post(`${AUTH}/esqueci-senha`).set('X-Forwarded-For', ip).send({ email });
    }

    function redefinir(token: string, senha = 'senha-nova-123') {
      return http()
        .post(`${AUTH}/redefinir-senha`)
        .set('X-Forwarded-For', ip)
        .send({ token, senha });
    }

    it('202 para e-mail cadastrado (envia o link) e para inexistente (não envia)', async () => {
      await esqueci('ninguem@example.com').expect(202);
      expect(pedidos).toHaveLength(0);

      await esqueci(usuario.email.toUpperCase()).expect(202);

      expect(pedidos).toHaveLength(1);
      expect(pedidos[0]).toMatchObject({ usuarioId: usuario.id });
      const banco = await prisma.redefinicaoSenha.findFirstOrThrow();
      expect(banco.tokenHash).not.toBe(pedidos[0]?.token);
    });

    it('troca a senha, encerra as sessões, audita sem o hash e o link é de uso único', async () => {
      const sessaoAntiga = await login().expect(200);
      await esqueci(usuario.email).expect(202);
      const token = pedidos[0]?.token ?? '';
      await prisma.auditLog.deleteMany();

      await redefinir(token).expect(204);

      await login(usuario.email, SENHA_TESTE).expect(401);
      await login(usuario.email, 'senha-nova-123').expect(200);
      await http()
        .get(`${AUTH}/me`)
        .auth(sessaoSchema.parse(sessaoAntiga.body).accessToken, { type: 'bearer' })
        .expect(401);

      const registro = await expectAudit(prisma, {
        action: 'UPDATE',
        entity: 'Usuario',
        entityId: usuario.id,
        userId: usuario.id,
      });
      expect(JSON.stringify([registro.before, registro.after])).not.toMatch(/senha|argon2/i);

      const reuso = await redefinir(token).expect(400);
      expect(reuso.body).toMatchObject({
        code: 'LINK_REDEFINICAO_INVALIDO',
        details: [
          expect.objectContaining({
            field: 'token',
            message: 'Link de redefinição inválido ou expirado',
          }),
        ],
      });
    });

    it('um pedido novo invalida o anterior', async () => {
      await esqueci(usuario.email).expect(202);
      await esqueci(usuario.email).expect(202);

      const antigo = await redefinir(pedidos[0]?.token ?? '').expect(400);
      await redefinir(pedidos[1]?.token ?? '').expect(204);

      expect(antigo.body).toMatchObject({ code: 'LINK_REDEFINICAO_INVALIDO' });
      expect(pedidos).toHaveLength(2);
    });

    it('link expirado ou inexistente: 400', async () => {
      await esqueci(usuario.email).expect(202);
      await prisma.redefinicaoSenha.updateMany({ data: { expiraEm: new Date(Date.now() - 1) } });

      const expirado = await redefinir(pedidos[0]?.token ?? '').expect(400);
      const inexistente = await redefinir('token-que-nao-existe').expect(400);

      expect([expirado.body.code, inexistente.body.code]).toEqual([
        'LINK_REDEFINICAO_INVALIDO',
        'LINK_REDEFINICAO_INVALIDO',
      ]);
    });

    it('400 para senha fraca, com a mensagem do campo', async () => {
      const res = await redefinir('qualquer', 'curta').expect(400);

      expect(res.body.details).toEqual([
        expect.objectContaining({
          field: 'senha',
          message: 'A senha deve ter no mínimo 8 caracteres',
        }),
      ]);
    });
  });
});
