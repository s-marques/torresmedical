import type { INestApplication } from '@nestjs/common';
import {
  meuPerfilSchema,
  PREFERENCIAS_PADRAO,
  preferenciasSchema,
  usuarioSessaoSchema,
} from '@torres/shared';
import request from 'supertest';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { createE2eApp } from '../utils/create-e2e-app';
import { truncateAll } from '../utils/database';
import { comUsuario, criarUsuarioTeste, type UsuarioTeste } from '../utils/auth';
import { expectAudit, expectNoAudit } from '../utils/expect-audit';

const BASE = '/api/configuracoes-gestao/configuracoes';
const PERMISSOES = [
  'configuracoes-gestao.configuracoes.ver',
  'configuracoes-gestao.configuracoes.editar',
] as const;

describe('Configurações (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let usuario: UsuarioTeste;

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await truncateAll(prisma);
    usuario = await criarUsuarioTeste(app, { permissoes: PERMISSOES });
  });

  afterAll(async () => {
    await app.close();
  });

  function http(quem: UsuarioTeste = usuario) {
    return comUsuario(app, quem);
  }

  async function somenteVer() {
    return criarUsuarioTeste(app, { permissoes: ['configuracoes-gestao.configuracoes.ver'] });
  }

  function criarArquivo(uso: string) {
    return prisma.arquivo.create({
      data: {
        uso,
        nomeOriginal: 'avatar.png',
        contentType: 'image/png',
        tamanho: 10,
        chave: `${uso}/${Math.random()}`,
      },
    });
  }

  describe('GET /perfil', () => {
    it('200 com os dados do próprio usuário, sem dados de login', async () => {
      const res = await http().get(`${BASE}/perfil`).expect(200);

      const perfil = meuPerfilSchema.parse(res.body);
      expect(perfil).toMatchObject({ id: usuario.id, email: usuario.email, avatarArquivoId: null });
      expect(res.body).not.toHaveProperty('senhaHash');
    });

    it('401 sem token e 403 sem a permissão', async () => {
      await request(app.getHttpServer()).get(`${BASE}/perfil`).expect(401);
      const semPermissao = await criarUsuarioTeste(app, { permissoes: [] });
      const res = await http(semPermissao).get(`${BASE}/perfil`).expect(403);
      expect(res.body.message).toBe('Sem permissão');
    });
  });

  describe('PUT /perfil (Salvar Alterações)', () => {
    const dados = {
      nome: 'Nome Atualizado',
      email: 'novo.email@example.com',
      telefone: '(65) 99999-8888',
      cargo: 'Gerente',
    };

    it('200, altera só o usuário logado e audita UPDATE sem a senha', async () => {
      const antes = await prisma.usuario.findUniqueOrThrow({ where: { id: usuario.id } });

      const res = await http().put(`${BASE}/perfil`).send(dados).expect(200);

      expect(res.body).toMatchObject({
        nome: 'Nome Atualizado',
        email: 'novo.email@example.com',
        telefone: '65999998888',
        cargo: 'Gerente',
      });
      const registro = await expectAudit(prisma, {
        action: 'UPDATE',
        entity: 'Usuario',
        entityId: usuario.id,
        before: { nome: antes.nome, email: antes.email },
        after: { nome: 'Nome Atualizado', email: 'novo.email@example.com', cargo: 'Gerente' },
        userId: usuario.id,
      });
      expect(registro.before).not.toHaveProperty('senhaHash');
      expect(registro.after).not.toHaveProperty('senhaHash');
    });

    it('a sessão (/api/auth/me) passa a trazer o nome novo', async () => {
      await http().put(`${BASE}/perfil`).send(dados).expect(200);
      const me = usuarioSessaoSchema.parse((await http().get('/api/auth/me').expect(200)).body);
      expect(me.nome).toBe('Nome Atualizado');
    });

    it('400 com as mensagens padrão por campo e sem auditoria', async () => {
      const res = await http()
        .put(`${BASE}/perfil`)
        .send({ nome: '', email: '', telefone: '12' })
        .expect(400);

      expect(res.body.details).toEqual(
        expect.arrayContaining([
          { field: 'nome', message: 'Nome é obrigatório.' },
          { field: 'email', message: 'E-mail é obrigatório.' },
          { field: 'telefone', message: 'Telefone inválido' },
        ]),
      );
      await expectNoAudit(prisma, { entity: 'Usuario' });
    });

    it('409 DUPLICATE quando o e-mail é de outro usuário', async () => {
      const outro = await criarUsuarioTeste(app);

      const res = await http()
        .put(`${BASE}/perfil`)
        .send({ ...dados, email: outro.email })
        .expect(409);

      expect(res.body.code).toBe('DUPLICATE');
      expect(res.body.details).toEqual([
        { field: 'email', message: 'Já existe um usuário com este email' },
      ]);
      await expectNoAudit(prisma, { entity: 'Usuario' });
    });

    it('403 com permissão só de ver', async () => {
      await http(await somenteVer())
        .put(`${BASE}/perfil`)
        .send(dados)
        .expect(403);
      await expectNoAudit(prisma, { entity: 'Usuario' });
    });
  });

  describe('PUT /perfil/avatar', () => {
    it('200, grava o avatar, que vai para a sessão, e audita', async () => {
      const avatar = await criarArquivo('avatar');

      const res = await http()
        .put(`${BASE}/perfil/avatar`)
        .send({ arquivoId: avatar.id })
        .expect(200);

      expect(res.body.avatarArquivoId).toBe(avatar.id);
      await expectAudit(prisma, {
        action: 'UPDATE',
        entity: 'Usuario',
        entityId: usuario.id,
        before: { avatarArquivoId: null },
        after: { avatarArquivoId: avatar.id },
      });
      const me = (await http().get('/api/auth/me').expect(200)).body;
      expect(me.avatarArquivoId).toBe(avatar.id);
    });

    it('remove o avatar com null', async () => {
      const avatar = await criarArquivo('avatar');
      await prisma.usuario.update({
        where: { id: usuario.id },
        data: { avatarArquivoId: avatar.id },
      });

      const res = await http().put(`${BASE}/perfil/avatar`).send({ arquivoId: null }).expect(200);

      expect(res.body.avatarArquivoId).toBeNull();
    });

    it('400 para arquivo de outro uso e 404 para arquivo inexistente', async () => {
      const logo = await criarArquivo('logo-empresa');

      const invalido = await http()
        .put(`${BASE}/perfil/avatar`)
        .send({ arquivoId: logo.id })
        .expect(400);
      expect(invalido.body.code).toBe('ARQUIVO_USO_INVALIDO');

      await http()
        .put(`${BASE}/perfil/avatar`)
        .send({ arquivoId: '7f1c2a8e-5b9d-4f3e-8a6c-1d2e3f4a5b6c' })
        .expect(404);
      await expectNoAudit(prisma, { entity: 'Usuario' });
    });
  });

  describe('preferências e aparência', () => {
    it('GET devolve os padrões e a sessão também', async () => {
      const res = await http().get(`${BASE}/preferencias`).expect(200);
      expect(preferenciasSchema.parse(res.body)).toEqual(PREFERENCIAS_PADRAO);

      const me = usuarioSessaoSchema.parse((await http().get('/api/auth/me').expect(200)).body);
      expect(me.preferencias).toEqual(PREFERENCIAS_PADRAO);
    });

    it('PATCH cria na primeira vez (CREATE) e altera depois (UPDATE)', async () => {
      const criado = await http()
        .patch(`${BASE}/preferencias`)
        .send({ resumoSemanal: true, tema: 'escuro' })
        .expect(200);
      expect(criado.body).toEqual({ ...PREFERENCIAS_PADRAO, resumoSemanal: true, tema: 'escuro' });
      await expectAudit(prisma, {
        action: 'CREATE',
        entity: 'PreferenciaUsuario',
        entityId: usuario.id,
        before: null,
        after: { resumoSemanal: true, tema: 'escuro' },
        userId: usuario.id,
      });

      const alterado = await http()
        .patch(`${BASE}/preferencias`)
        .send({ esquemaCor: 'violeta', densidade: 'compacto', idioma: 'es' })
        .expect(200);
      expect(alterado.body).toMatchObject({
        tema: 'escuro',
        esquemaCor: 'violeta',
        densidade: 'compacto',
        idioma: 'es',
      });
      await expectAudit(prisma, {
        action: 'UPDATE',
        entity: 'PreferenciaUsuario',
        entityId: usuario.id,
        before: { esquemaCor: 'esmeralda', idioma: 'pt-BR' },
        after: { esquemaCor: 'violeta', idioma: 'es' },
      });

      const me = usuarioSessaoSchema.parse((await http().get('/api/auth/me').expect(200)).body);
      expect(me.preferencias).toMatchObject({ tema: 'escuro', idioma: 'es' });
    });

    it('400 para opção fora do catálogo ou corpo vazio, sem auditoria', async () => {
      const res = await http()
        .patch(`${BASE}/preferencias`)
        .send({ idioma: 'de', notificacoesPush: 'sim' })
        .expect(400);
      expect(res.body.details).toEqual(
        expect.arrayContaining([
          { field: 'idioma', message: 'Opção inválida' },
          { field: 'notificacoesPush', message: 'Valor inválido' },
        ]),
      );
      await http().patch(`${BASE}/preferencias`).send({}).expect(400);
      await expectNoAudit(prisma, { entity: 'PreferenciaUsuario' });
    });

    it('403 com permissão só de ver', async () => {
      await http(await somenteVer())
        .patch(`${BASE}/preferencias`)
        .send({ tema: 'claro' })
        .expect(403);
      await expectNoAudit(prisma, { entity: 'PreferenciaUsuario' });
    });
  });
});
