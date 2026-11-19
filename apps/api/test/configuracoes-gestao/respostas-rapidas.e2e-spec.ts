import type { INestApplication } from '@nestjs/common';
import { respostaRapidaPageSchema, respostaRapidaSchema } from '@torres/shared';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { comUsuario, criarUsuarioTeste, type UsuarioTeste } from '../utils/auth';
import { createE2eApp } from '../utils/create-e2e-app';
import { truncateAll } from '../utils/database';
import { expectAudit, expectNoAudit } from '../utils/expect-audit';

const BASE = '/api/configuracoes-gestao/respostas-rapidas';
const PERMISSOES = [
  'configuracoes-gestao.respostas-rapidas.ver',
  'configuracoes-gestao.respostas-rapidas.criar',
  'configuracoes-gestao.respostas-rapidas.editar',
  'configuracoes-gestao.respostas-rapidas.excluir',
] as const;
const INEXISTENTE = '00000000-0000-4000-8000-000000000000';
const ENTITY = 'RespostaRapida';
const ATALHO_DUPLICADO = 'Já existe uma resposta rápida com este atalho';

describe('Respostas Rápidas (e2e)', () => {
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

  function criarNoBanco(
    titulo: string,
    extra: { atalho?: string; categoria?: string; mensagem?: string; deletedAt?: Date } = {},
  ) {
    return prisma.respostaRapida.create({
      data: { titulo, mensagem: `Mensagem de ${titulo}`, ...extra },
    });
  }

  describe('GET', () => {
    it('lista por título, sem excluídas; busca em título, mensagem, categoria e atalho', async () => {
      await criarNoBanco('Retorno', { categoria: 'Agenda', atalho: '/retorno' });
      await criarNoBanco('Boas-vindas', { mensagem: 'Seja bem-vindo à clínica' });
      await criarNoBanco('Excluída', { deletedAt: new Date() });

      const todos = await http().get(BASE).expect(200);
      const page = respostaRapidaPageSchema.parse(todos.body);
      expect(page.data.map((r) => r.titulo)).toEqual(['Boas-vindas', 'Retorno']);
      expect(page.data[0]).toMatchObject({ categoria: 'Geral', atalho: null });

      const buscar = async (search: string) =>
        (await http().get(BASE).query({ search }).expect(200)).body.data.map(
          (r: { titulo: string }) => r.titulo,
        );
      expect(await buscar('ret')).toEqual(['Retorno']);
      expect(await buscar('BEM-VINDO')).toEqual(['Boas-vindas']);
      expect(await buscar('agenda')).toEqual(['Retorno']);
      expect(await buscar('/ret')).toEqual(['Retorno']);
    });

    it('400 para sort fora da whitelist', async () => {
      const res = await http().get(BASE).query({ sort: 'mensagem:asc' }).expect(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('403 sem permissão', async () => {
      const semPermissao = await criarUsuarioTeste(app, { permissoes: [] });
      await comUsuario(app, semPermissao).get(BASE).expect(403);
    });
  });

  describe('GET /:id', () => {
    it('200, 404 (inexistente ou excluída) e 400', async () => {
      const resposta = await criarNoBanco('Retorno');
      const excluida = await criarNoBanco('X', { deletedAt: new Date() });

      const ok = await http().get(`${BASE}/${resposta.id}`).expect(200);
      expect(respostaRapidaSchema.parse(ok.body)).toMatchObject({ titulo: 'Retorno' });
      const nao = await http().get(`${BASE}/${INEXISTENTE}`).expect(404);
      expect(nao.body.message).toBe('Resposta rápida não encontrada');
      await http().get(`${BASE}/${excluida.id}`).expect(404);
      await http().get(`${BASE}/abc`).expect(400);
    });
  });

  describe('POST', () => {
    it('201 com categoria padrão "Geral" e audita CREATE', async () => {
      const res = await http()
        .post(BASE)
        .send({ titulo: '  Boas-vindas ', mensagem: 'Olá!', categoria: '', atalho: '/boasvindas' })
        .expect(201);

      expect(respostaRapidaSchema.parse(res.body)).toMatchObject({
        titulo: 'Boas-vindas',
        mensagem: 'Olá!',
        categoria: 'Geral',
        atalho: '/boasvindas',
      });
      await expectAudit(prisma, {
        action: 'CREATE',
        entity: ENTITY,
        entityId: res.body.id,
        before: null,
        after: { id: res.body.id, titulo: 'Boas-vindas', atalho: '/boasvindas' },
        userId: usuario.id,
      });
    });

    it('400 "Título é obrigatório." e "Mensagem é obrigatória.", sem auditar', async () => {
      const res = await http()
        .post(BASE)
        .send({ titulo: '', mensagem: '', atalho: 'sem barra', extra: 1 })
        .expect(400);

      expect(res.body.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'titulo', message: 'Título é obrigatório.' }),
          expect.objectContaining({ field: 'mensagem', message: 'Mensagem é obrigatória.' }),
          {
            field: 'atalho',
            message:
              'O atalho deve começar com "/" e ter só letras, números, "-" ou "_", sem espaços',
          },
          expect.objectContaining({ field: 'extra', message: 'Campo não permitido' }),
        ]),
      );
      await expectNoAudit(prisma, { entity: ENTITY });
    });

    it('400 ATALHO_DUPLICADO (sem diferenciar maiúsculas); atalho de excluída fica livre', async () => {
      await criarNoBanco('Retorno', { atalho: '/retorno' });
      await criarNoBanco('Antiga', { atalho: '/antiga', deletedAt: new Date() });

      const res = await http()
        .post(BASE)
        .send({ titulo: 'Outra', mensagem: 'X', atalho: '/RETORNO' })
        .expect(400);
      expect(res.body).toMatchObject({
        code: 'ATALHO_DUPLICADO',
        details: [expect.objectContaining({ field: 'atalho', message: ATALHO_DUPLICADO })],
      });
      await expectNoAudit(prisma, { entity: ENTITY });

      await http()
        .post(BASE)
        .send({ titulo: 'Nova', mensagem: 'X', atalho: '/antiga' })
        .expect(201);
    });

    it('aceita títulos repetidos e várias respostas sem atalho', async () => {
      await criarNoBanco('Retorno');
      await http().post(BASE).send({ titulo: 'Retorno', mensagem: 'X' }).expect(201);
      await http().post(BASE).send({ titulo: 'Retorno', mensagem: 'Y', atalho: '' }).expect(201);
    });

    it('403 sem permissão de criar', async () => {
      const leitor = await criarUsuarioTeste(app, {
        permissoes: ['configuracoes-gestao.respostas-rapidas.ver'],
      });
      await comUsuario(app, leitor).post(BASE).send({ titulo: 'X', mensagem: 'Y' }).expect(403);
    });
  });

  describe('PATCH /:id', () => {
    it('200 e audita UPDATE com before/after; pode manter o próprio atalho', async () => {
      const resposta = await criarNoBanco('Retorno', { atalho: '/retorno' });

      const res = await http()
        .patch(`${BASE}/${resposta.id}`)
        .send({
          titulo: 'Retorno 2',
          mensagem: 'Novo texto',
          categoria: 'Agenda',
          atalho: '/Retorno',
        })
        .expect(200);

      expect(res.body).toMatchObject({
        titulo: 'Retorno 2',
        categoria: 'Agenda',
        atalho: '/Retorno',
      });
      await expectAudit(prisma, {
        action: 'UPDATE',
        entity: ENTITY,
        entityId: resposta.id,
        before: { titulo: 'Retorno', categoria: 'Geral', atalho: '/retorno' },
        after: { titulo: 'Retorno 2', categoria: 'Agenda', atalho: '/Retorno' },
        userId: usuario.id,
      });
    });

    it('400 com atalho de outra resposta, 400 sem campos obrigatórios e 404, sem auditar', async () => {
      await criarNoBanco('Boas-vindas', { atalho: '/boasvindas' });
      const resposta = await criarNoBanco('Retorno');

      const dup = await http()
        .patch(`${BASE}/${resposta.id}`)
        .send({ titulo: 'Retorno', mensagem: 'X', atalho: '/boasvindas' })
        .expect(400);
      expect(dup.body.code).toBe('ATALHO_DUPLICADO');
      await http().patch(`${BASE}/${resposta.id}`).send({}).expect(400);
      await http().patch(`${BASE}/${INEXISTENTE}`).send({ titulo: 'X', mensagem: 'Y' }).expect(404);
      await expectNoAudit(prisma, { entity: ENTITY });
    });

    it('403 sem permissão de editar', async () => {
      const resposta = await criarNoBanco('Retorno');
      const leitor = await criarUsuarioTeste(app, {
        permissoes: ['configuracoes-gestao.respostas-rapidas.ver'],
      });
      await comUsuario(app, leitor)
        .patch(`${BASE}/${resposta.id}`)
        .send({ titulo: 'X', mensagem: 'Y' })
        .expect(403);
    });
  });

  describe('DELETE /:id', () => {
    it('exclusão lógica: 200, audita DELETE e some da listagem', async () => {
      const resposta = await criarNoBanco('Retorno');

      await http().delete(`${BASE}/${resposta.id}`).expect(200);

      await expectAudit(prisma, {
        action: 'DELETE',
        entity: ENTITY,
        entityId: resposta.id,
        before: { titulo: 'Retorno', deletedAt: null },
        after: null,
        userId: usuario.id,
      });
      expect(
        (await prisma.respostaRapida.findUniqueOrThrow({ where: { id: resposta.id } })).deletedAt,
      ).not.toBeNull();
      expect((await http().get(BASE).expect(200)).body.meta.total).toBe(0);
    });

    it('404 para inexistente ou já excluída, sem auditar', async () => {
      const excluida = await criarNoBanco('X', { deletedAt: new Date() });
      await http().delete(`${BASE}/${excluida.id}`).expect(404);
      await http().delete(`${BASE}/${INEXISTENTE}`).expect(404);
      await expectNoAudit(prisma, { entity: ENTITY });
    });

    it('403 sem permissão de excluir', async () => {
      const resposta = await criarNoBanco('Retorno');
      const leitor = await criarUsuarioTeste(app, {
        permissoes: ['configuracoes-gestao.respostas-rapidas.ver'],
      });
      await comUsuario(app, leitor).delete(`${BASE}/${resposta.id}`).expect(403);
    });
  });
});
