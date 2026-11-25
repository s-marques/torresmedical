import type { INestApplication } from '@nestjs/common';
import { usuarioPageSchema, usuarioSchema } from '@torres/shared';
import { hashSenha, verificarSenha } from '../../src/common/auth/senhas';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { comUsuario, criarUsuarioTeste, type UsuarioTeste } from '../utils/auth';
import { createE2eApp } from '../utils/create-e2e-app';
import { truncateAll } from '../utils/database';
import { expectAudit, expectNoAudit } from '../utils/expect-audit';

const BASE = '/api/configuracoes-gestao/usuarios';
const PERMISSOES = [
  'configuracoes-gestao.usuarios.ver',
  'configuracoes-gestao.usuarios.criar',
  'configuracoes-gestao.usuarios.editar',
  'configuracoes-gestao.usuarios.exportar',
  'configuracoes-gestao.dados-pessoais.exportar',
] as const;
const INEXISTENTE = '00000000-0000-4000-8000-000000000000';

describe('Usuários (e2e)', () => {
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

  const http = () => comUsuario(app, usuario);

  async function criarNoBanco(nome: string, extra: Record<string, unknown> = {}) {
    const empresa = await prisma.empresa.findFirstOrThrow({ where: {} });
    return prisma.usuario.create({
      data: {
        empresaId: empresa.id,
        nome,
        email: `${nome.toLowerCase()}.${Date.now()}@example.com`,
        senhaHash: await hashSenha('senha-antiga-123'),
        ...extra,
      },
    });
  }

  describe('GET', () => {
    it('lista paginada, sem excluídos; busca e status', async () => {
      await criarNoBanco('Carlos');
      await criarNoBanco('Beatriz');
      await criarNoBanco('Inativa', { ativo: false });
      await criarNoBanco('Excluida', { deletedAt: new Date() });

      const todos = await http().get(BASE).expect(200);
      const page = usuarioPageSchema.parse(todos.body);
      // Beatriz, Carlos, Inativa, o próprio usuário de teste — tudo menos Excluida.
      expect(page.data.map((u) => u.nome)).toContain('Beatriz');
      expect(page.data.map((u) => u.nome)).not.toContain('Excluida');
      expect(page.data.every((u) => !('senhaHash' in u))).toBe(true);

      const busca = await http().get(BASE).query({ search: 'carlos' }).expect(200);
      expect(busca.body.data.map((u: { nome: string }) => u.nome)).toEqual(['Carlos']);
      const inativos = await http().get(BASE).query({ status: 'inativo' }).expect(200);
      expect(inativos.body.meta.total).toBe(1);
    });

    it('403 sem permissão', async () => {
      const semPermissao = await criarUsuarioTeste(app, { permissoes: [] });
      await comUsuario(app, semPermissao).get(BASE).expect(403);
    });
  });

  describe('GET /:id', () => {
    it('200, 404 e 400, sem senhaHash', async () => {
      const u = await criarNoBanco('Carlos');

      const ok = await http().get(`${BASE}/${u.id}`).expect(200);
      const dto = usuarioSchema.parse(ok.body);
      expect(dto).toMatchObject({ nome: 'Carlos' });
      expect(ok.body).not.toHaveProperty('senhaHash');
      const nao = await http().get(`${BASE}/${INEXISTENTE}`).expect(404);
      expect(nao.body.message).toBe('Usuário não encontrado');
      await http().get(`${BASE}/abc`).expect(400);
    });
  });

  describe('POST', () => {
    it('201, com a empresa herdada do criador, senha em hash e audita CREATE sem a senha', async () => {
      const res = await http()
        .post(BASE)
        .send({ nome: 'Carlos Novo', email: 'carlos.novo@example.com', senha: 'senha-123456' })
        .expect(201);

      expect(usuarioSchema.parse(res.body)).toMatchObject({
        nome: 'Carlos Novo',
        email: 'carlos.novo@example.com',
        perfilNome: null,
        ativo: true,
      });
      expect(res.body).not.toHaveProperty('senha');
      expect(res.body).not.toHaveProperty('senhaHash');

      const criado = await prisma.usuario.findUniqueOrThrow({ where: { id: res.body.id } });
      expect(await verificarSenha('senha-123456', criado.senhaHash)).toBe(true);

      const registro = await expectAudit(prisma, {
        action: 'CREATE',
        entity: 'Usuario',
        entityId: res.body.id,
        before: null,
        userId: usuario.id,
      });
      expect(JSON.stringify(registro.after)).not.toContain('senha-123456');
      expect(registro.after).not.toHaveProperty('senhaHash');
    });

    it('400 "Nome é obrigatório.", "Email é obrigatório." e senha obrigatória, sem auditar', async () => {
      const res = await http().post(BASE).send({ nome: '', email: '', senha: '' }).expect(400);

      expect(res.body.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'nome', message: 'Nome é obrigatório.' }),
          expect.objectContaining({ field: 'email', message: 'Email é obrigatório.' }),
          expect.objectContaining({
            field: 'senha',
            message: 'A senha deve ter no mínimo 8 caracteres',
          }),
        ]),
      );
      await expectNoAudit(prisma, { entity: 'Usuario' });
    });

    it('409 com email já cadastrado', async () => {
      const existente = await criarNoBanco('Carlos');
      await http()
        .post(BASE)
        .send({ nome: 'Outro', email: existente.email, senha: 'senha-123456' })
        .expect(409);
    });

    it('403 sem permissão de criar', async () => {
      const leitor = await criarUsuarioTeste(app, {
        permissoes: ['configuracoes-gestao.usuarios.ver'],
      });
      await comUsuario(app, leitor)
        .post(BASE)
        .send({ nome: 'X', email: 'x@example.com', senha: 'senha-123456' })
        .expect(403);
    });
  });

  describe('PATCH /:id', () => {
    it('200, audita UPDATE com before/after e não altera a senha', async () => {
      const u = await criarNoBanco('Carlos');

      const res = await http()
        .patch(`${BASE}/${u.id}`)
        .send({ nome: 'Carlos Alterado', email: u.email, status: 'inativo' })
        .expect(200);

      expect(res.body).toMatchObject({ nome: 'Carlos Alterado', ativo: false });
      await expectAudit(prisma, {
        action: 'UPDATE',
        entity: 'Usuario',
        entityId: u.id,
        before: { nome: 'Carlos', ativo: true },
        after: { nome: 'Carlos Alterado', ativo: false },
        userId: usuario.id,
      });
      const senhaInalterada = await prisma.usuario.findUniqueOrThrow({ where: { id: u.id } });
      expect(senhaInalterada.senhaHash).toBe(u.senhaHash);
    });

    it('404 para inexistente', async () => {
      await http()
        .patch(`${BASE}/${INEXISTENTE}`)
        .send({ nome: 'X', email: 'x@example.com' })
        .expect(404);
      await expectNoAudit(prisma, { entity: 'Usuario' });
    });
  });

  describe('profissionais vinculados (issue #153)', () => {
    const criarProfissional = (nome: string) => prisma.profissional.create({ data: { nome } });

    it('POST vincula um ou mais profissionais e audita CREATE com os vínculos', async () => {
      const a = await criarProfissional('Ana Fictícia');
      const b = await criarProfissional('Bruno Fictício');

      const res = await http()
        .post(BASE)
        .send({
          nome: 'Secretária',
          email: 'secretaria@example.com',
          senha: 'senha-123456',
          profissionalIds: [b.id, a.id, b.id],
        })
        .expect(201);

      const criado = usuarioSchema.parse(res.body);
      expect(criado.profissionais).toEqual([
        { id: a.id, nome: 'Ana Fictícia' },
        { id: b.id, nome: 'Bruno Fictício' },
      ]);
      await expectAudit(prisma, {
        action: 'CREATE',
        entity: 'Usuario',
        entityId: criado.id,
        before: null,
        after: { profissionais: [{ id: a.id }, { id: b.id }] },
        userId: usuario.id,
      });
    });

    it('PATCH substitui os vínculos e audita UPDATE', async () => {
      const a = await criarProfissional('Ana Fictícia');
      const b = await criarProfissional('Bruno Fictício');
      const u = await criarNoBanco('Medico', {
        profissionais: { create: [{ profissionalId: a.id }] },
      });

      const res = await http()
        .patch(`${BASE}/${u.id}`)
        .send({ nome: 'Medico', email: u.email, profissionalIds: [b.id] })
        .expect(200);

      expect(usuarioSchema.parse(res.body).profissionais).toEqual([
        { id: b.id, nome: 'Bruno Fictício' },
      ]);
      expect(await prisma.usuarioProfissional.findMany({ where: { usuarioId: u.id } })).toEqual([
        { usuarioId: u.id, profissionalId: b.id },
      ]);
      await expectAudit(prisma, {
        action: 'UPDATE',
        entity: 'Usuario',
        entityId: u.id,
        after: { profissionais: [{ id: b.id }] },
        userId: usuario.id,
      });

      await http()
        .patch(`${BASE}/${u.id}`)
        .send({ nome: 'Medico', email: u.email, profissionalIds: [] })
        .expect(200);
      expect(await prisma.usuarioProfissional.count({ where: { usuarioId: u.id } })).toBe(0);
    });

    it('400 no campo profissionalIds com profissional inexistente, sem auditar nem gravar', async () => {
      const res = await http()
        .post(BASE)
        .send({
          nome: 'Medico',
          email: 'medico@example.com',
          senha: 'senha-123456',
          profissionalIds: [INEXISTENTE],
        })
        .expect(400);

      expect(res.body).toMatchObject({
        code: 'PROFISSIONAL_INVALIDO',
        details: [
          expect.objectContaining({
            field: 'profissionalIds',
            message: 'Profissional não encontrado',
          }),
        ],
      });
      expect(await prisma.usuario.count({ where: { email: 'medico@example.com' } })).toBe(0);
      await expectNoAudit(prisma, { entity: 'Usuario' });
    });

    it('400 com id que não é uuid', async () => {
      const res = await http()
        .post(BASE)
        .send({ nome: 'X', email: 'x@example.com', senha: 'senha-123456', profissionalIds: ['x'] })
        .expect(400);
      expect(res.body.details).toEqual([
        expect.objectContaining({ message: 'Profissional inválido' }),
      ]);
    });
  });

  describe('PATCH /:id/resetar-senha', () => {
    it('200, troca o hash e audita UPDATE sem a senha em texto puro', async () => {
      const u = await criarNoBanco('Carlos');

      await http()
        .patch(`${BASE}/${u.id}/resetar-senha`)
        .send({ senha: 'nova-senha-123' })
        .expect(200);

      const atualizado = await prisma.usuario.findUniqueOrThrow({ where: { id: u.id } });
      expect(await verificarSenha('nova-senha-123', atualizado.senhaHash)).toBe(true);
      const registro = await expectAudit(prisma, {
        action: 'UPDATE',
        entity: 'Usuario',
        entityId: u.id,
        userId: usuario.id,
      });
      expect(JSON.stringify(registro.after)).not.toContain('nova-senha-123');
    });

    it('400 com senha vazia e 404 para inexistente', async () => {
      const u = await criarNoBanco('Carlos');
      await http().patch(`${BASE}/${u.id}/resetar-senha`).send({ senha: '' }).expect(400);
      await http()
        .patch(`${BASE}/${INEXISTENTE}/resetar-senha`)
        .send({ senha: 'nova-senha-123' })
        .expect(404);
    });
  });
});
