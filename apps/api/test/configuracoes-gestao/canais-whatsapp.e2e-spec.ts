import type { INestApplication } from '@nestjs/common';
import {
  canalWhatsappPageSchema,
  canalWhatsappSchema,
  usuariosCanalWhatsappSchema,
} from '@torres/shared';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { comUsuario, criarUsuarioTeste, type UsuarioTeste } from '../utils/auth';
import { createE2eApp } from '../utils/create-e2e-app';
import { truncateAll } from '../utils/database';
import { expectAudit, expectNoAudit } from '../utils/expect-audit';

const BASE = '/api/configuracoes-gestao/canais-whatsapp';
const PERMISSOES = [
  'configuracoes-gestao.agentes-ia.ver',
  'configuracoes-gestao.agentes-ia.criar',
  'configuracoes-gestao.agentes-ia.editar',
  'configuracoes-gestao.agentes-ia.excluir',
] as const;
const INEXISTENTE = '00000000-0000-4000-8000-000000000000';
const ENTITY = 'CanalWhatsapp';
const NUMERO_DUPLICADO = 'Já existe um canal com este número';

describe('Canais WhatsApp / Agentes IA (e2e)', () => {
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

  function criarNoBanco(nome: string, numero: string, extra: { deletedAt?: Date } = {}) {
    return prisma.canalWhatsapp.create({ data: { nome, numero, status: 'CONECTADO', ...extra } });
  }

  describe('GET', () => {
    it('lista por nome, sem excluídos; busca por nome ou número', async () => {
      await criarNoBanco('Recepção', '5565998500704');
      await criarNoBanco('Gerência Geral', '5565999662691');
      await criarNoBanco('Excluído', '5511910803640', { deletedAt: new Date() });

      const todos = canalWhatsappPageSchema.parse((await http().get(BASE).expect(200)).body);
      expect(todos.data.map((c) => c.nome)).toEqual(['Gerência Geral', 'Recepção']);
      expect(todos.data[0]).toMatchObject({
        tipo: 'DINASTI_API',
        status: 'CONECTADO',
        profissionalId: null,
        usuarioIds: [],
      });

      const porNome = await http().get(BASE).query({ search: 'recep' }).expect(200);
      expect(porNome.body.data.map((c: { nome: string }) => c.nome)).toEqual(['Recepção']);
      const porNumero = await http().get(BASE).query({ search: '662691' }).expect(200);
      expect(porNumero.body.data.map((c: { nome: string }) => c.nome)).toEqual(['Gerência Geral']);
    });

    it('400 para sort fora da whitelist e 403 sem permissão', async () => {
      await http().get(BASE).query({ sort: 'numero:asc' }).expect(400);
      const semPermissao = await criarUsuarioTeste(app, { permissoes: [] });
      await comUsuario(app, semPermissao).get(BASE).expect(403);
    });

    it('GET /:id: 200, 404 (inexistente ou excluído) e 400', async () => {
      const canal = await criarNoBanco('Recepção', '5565998500704');
      const excluido = await criarNoBanco('X', '5565900000001', { deletedAt: new Date() });

      const ok = await http().get(`${BASE}/${canal.id}`).expect(200);
      expect(canalWhatsappSchema.parse(ok.body)).toMatchObject({ nome: 'Recepção' });
      const nao = await http().get(`${BASE}/${INEXISTENTE}`).expect(404);
      expect(nao.body.message).toBe('Canal não encontrado');
      await http().get(`${BASE}/${excluido.id}`).expect(404);
      await http().get(`${BASE}/abc`).expect(400);
    });

    it('GET /usuarios-disponiveis: só ativos, com e-mail e perfil', async () => {
      const inativo = await criarUsuarioTeste(app, { ativo: false });

      const res = await http().get(`${BASE}/usuarios-disponiveis`).expect(200);
      const lista = usuariosCanalWhatsappSchema.parse(res.body);

      expect(lista.map((u) => u.id)).toContain(usuario.id);
      expect(lista.map((u) => u.id)).not.toContain(inativo.id);
      expect(lista.find((u) => u.id === usuario.id)).toMatchObject({ email: usuario.email });
    });
  });

  describe('POST', () => {
    it('201: cria desconectado, normaliza o número, grava usuários e audita CREATE', async () => {
      const outro = await criarUsuarioTeste(app, { permissoes: [] });

      const res = await http()
        .post(BASE)
        .send({
          nome: '  Recepção ',
          numero: '(65) 99850-0704',
          usuarioIds: [outro.id, outro.id],
        })
        .expect(201);

      expect(canalWhatsappSchema.parse(res.body)).toMatchObject({
        nome: 'Recepção',
        numero: '5565998500704',
        tipo: 'DINASTI_API',
        status: 'DESCONECTADO',
        profissionalId: null,
        usuarioIds: [outro.id],
      });
      await expectAudit(prisma, {
        action: 'CREATE',
        entity: ENTITY,
        entityId: res.body.id,
        before: null,
        after: { id: res.body.id, nome: 'Recepção', numero: '5565998500704' },
        userId: usuario.id,
      });
    });

    it('vincula o canal a um profissional (linha do profissional); 400 se não existir', async () => {
      const profissional = await prisma.profissional.create({
        data: { nome: 'Profissional Teste' },
      });

      const ok = await http()
        .post(BASE)
        .send({ nome: 'Dr. Teste', numero: '65999990001', profissionalId: profissional.id })
        .expect(201);
      expect(ok.body).toMatchObject({
        profissionalId: profissional.id,
        profissionalNome: 'Profissional Teste',
      });

      const invalido = await http()
        .post(BASE)
        .send({ nome: 'Outro', numero: '65999990002', profissionalId: INEXISTENTE })
        .expect(400);
      expect(invalido.body).toMatchObject({
        code: 'PROFISSIONAL_INVALIDO',
        details: [
          expect.objectContaining({
            field: 'profissionalId',
            message: 'Profissional não encontrado',
          }),
        ],
      });
      // Só o CREATE do canal válido foi auditado.
      expect(await prisma.auditLog.count({ where: { entity: ENTITY } })).toBe(1);
    });

    it('400 "Nome do Canal é obrigatório." e "Número WhatsApp é obrigatório.", sem auditar', async () => {
      const res = await http().post(BASE).send({ nome: '', numero: '', tipo: 'X' }).expect(400);

      expect(res.body.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'nome', message: 'Nome do Canal é obrigatório.' }),
          expect.objectContaining({ field: 'numero', message: 'Número WhatsApp é obrigatório.' }),
          expect.objectContaining({ field: 'tipo', message: 'Campo não permitido' }),
        ]),
      );
      await expectNoAudit(prisma, { entity: ENTITY });
    });

    it('400 NUMERO_DUPLICADO; número de canal excluído fica livre', async () => {
      await criarNoBanco('Recepção', '5565998500704');
      await criarNoBanco('Antigo', '5565900000009', { deletedAt: new Date() });

      const res = await http()
        .post(BASE)
        .send({ nome: 'Outro', numero: '(65) 99850-0704' })
        .expect(400);
      expect(res.body).toMatchObject({
        code: 'NUMERO_DUPLICADO',
        details: [expect.objectContaining({ field: 'numero', message: NUMERO_DUPLICADO })],
      });
      await expectNoAudit(prisma, { entity: ENTITY });

      await http().post(BASE).send({ nome: 'Novo', numero: '5565900000009' }).expect(201);
    });

    it('400 USUARIO_INVALIDO para usuário inexistente ou inativo', async () => {
      const inativo = await criarUsuarioTeste(app, { ativo: false });
      for (const id of [INEXISTENTE, inativo.id]) {
        const res = await http()
          .post(BASE)
          .send({ nome: 'X', numero: '65999990001', usuarioIds: [id] })
          .expect(400);
        expect(res.body.code).toBe('USUARIO_INVALIDO');
      }
      expect(await prisma.canalWhatsapp.count()).toBe(0);
    });

    it('403 sem permissão de criar', async () => {
      const leitor = await criarUsuarioTeste(app, {
        permissoes: ['configuracoes-gestao.agentes-ia.ver'],
      });
      await comUsuario(app, leitor)
        .post(BASE)
        .send({ nome: 'X', numero: '65999990001' })
        .expect(403);
    });
  });

  describe('PATCH /:id', () => {
    it('200: altera nome e telefone e audita UPDATE com before e after', async () => {
      const canal = await criarNoBanco('Recepção', '5565998500704');

      const res = await http()
        .patch(`${BASE}/${canal.id}`)
        .send({ nome: 'Recepção 2', numero: '(65) 99999-1111' })
        .expect(200);

      expect(res.body).toMatchObject({ nome: 'Recepção 2', numero: '5565999991111' });
      await expectAudit(prisma, {
        action: 'UPDATE',
        entity: ENTITY,
        entityId: canal.id,
        before: { nome: 'Recepção', numero: '5565998500704' },
        after: { nome: 'Recepção 2', numero: '5565999991111' },
        userId: usuario.id,
      });
    });

    it('mantém o próprio número; 400 se for o de outro canal; 404 e 400 de validação', async () => {
      const canal = await criarNoBanco('Recepção', '5565998500704');
      await criarNoBanco('Gerência', '5565999662691');

      await http()
        .patch(`${BASE}/${canal.id}`)
        .send({ nome: 'Recepção', numero: '5565998500704' })
        .expect(200);
      const duplicado = await http()
        .patch(`${BASE}/${canal.id}`)
        .send({ nome: 'Recepção', numero: '5565999662691' })
        .expect(400);
      expect(duplicado.body.code).toBe('NUMERO_DUPLICADO');

      const vazio = await http()
        .patch(`${BASE}/${canal.id}`)
        .send({ nome: '', numero: '' })
        .expect(400);
      expect(vazio.body.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'nome', message: 'Nome do Canal é obrigatório.' }),
          expect.objectContaining({ field: 'numero', message: 'Telefone é obrigatório.' }),
        ]),
      );
      await http()
        .patch(`${BASE}/${INEXISTENTE}`)
        .send({ nome: 'X', numero: '65999990001' })
        .expect(404);
    });

    it('403 sem permissão de editar', async () => {
      const canal = await criarNoBanco('Recepção', '5565998500704');
      const leitor = await criarUsuarioTeste(app, {
        permissoes: ['configuracoes-gestao.agentes-ia.ver'],
      });
      await comUsuario(app, leitor)
        .patch(`${BASE}/${canal.id}`)
        .send({ nome: 'X', numero: '65999990001' })
        .expect(403);
    });
  });

  describe('PUT /:id/usuarios', () => {
    it('200: substitui os usuários com acesso e audita UPDATE; lista vazia libera para todos', async () => {
      const canal = await criarNoBanco('Recepção', '5565998500704');
      const outro = await criarUsuarioTeste(app, { permissoes: [] });

      const res = await http()
        .put(`${BASE}/${canal.id}/usuarios`)
        .send({ usuarioIds: [usuario.id, outro.id] })
        .expect(200);
      expect([...res.body.usuarioIds].sort()).toEqual([usuario.id, outro.id].sort());
      await expectAudit(prisma, {
        action: 'UPDATE',
        entity: ENTITY,
        entityId: canal.id,
        after: { id: canal.id },
        userId: usuario.id,
      });

      const livre = await http()
        .put(`${BASE}/${canal.id}/usuarios`)
        .send({ usuarioIds: [] })
        .expect(200);
      expect(livre.body.usuarioIds).toEqual([]);
      expect(await prisma.canalWhatsappUsuario.count()).toBe(0);
    });

    it('400 (usuário inválido), 404 e 403', async () => {
      const canal = await criarNoBanco('Recepção', '5565998500704');
      await http()
        .put(`${BASE}/${canal.id}/usuarios`)
        .send({ usuarioIds: [INEXISTENTE] })
        .expect(400);
      await http()
        .put(`${BASE}/${canal.id}/usuarios`)
        .send({ usuarioIds: ['x'] })
        .expect(400);
      await http().put(`${BASE}/${INEXISTENTE}/usuarios`).send({ usuarioIds: [] }).expect(404);
      const leitor = await criarUsuarioTeste(app, {
        permissoes: ['configuracoes-gestao.agentes-ia.ver'],
      });
      await comUsuario(app, leitor)
        .put(`${BASE}/${canal.id}/usuarios`)
        .send({ usuarioIds: [] })
        .expect(403);
    });
  });

  describe('DELETE /:id', () => {
    it('200: exclusão lógica, audita DELETE e libera o número; 404 depois', async () => {
      const canal = await criarNoBanco('Recepção', '5565998500704');

      await http().delete(`${BASE}/${canal.id}`).expect(200);

      expect(
        (await prisma.canalWhatsapp.findUnique({ where: { id: canal.id } }))?.deletedAt,
      ).not.toBeNull();
      await expectAudit(prisma, {
        action: 'DELETE',
        entity: ENTITY,
        entityId: canal.id,
        before: { id: canal.id, nome: 'Recepção' },
        after: null,
        userId: usuario.id,
      });
      await http().delete(`${BASE}/${canal.id}`).expect(404);
      await http().post(BASE).send({ nome: 'Nova', numero: '5565998500704' }).expect(201);
    });

    it('404, 400 e 403', async () => {
      await http().delete(`${BASE}/${INEXISTENTE}`).expect(404);
      await http().delete(`${BASE}/abc`).expect(400);
      const canal = await criarNoBanco('Recepção', '5565998500704');
      const leitor = await criarUsuarioTeste(app, {
        permissoes: ['configuracoes-gestao.agentes-ia.ver'],
      });
      await comUsuario(app, leitor).delete(`${BASE}/${canal.id}`).expect(403);
    });
  });
});
