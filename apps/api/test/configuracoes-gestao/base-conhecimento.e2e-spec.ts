import type { INestApplication } from '@nestjs/common';
import { documentoConhecimentoPageSchema, documentoConhecimentoSchema } from '@torres/shared';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { comUsuario, criarUsuarioTeste, type UsuarioTeste } from '../utils/auth';
import { createE2eApp } from '../utils/create-e2e-app';
import { truncateAll } from '../utils/database';
import { expectAudit, expectNoAudit } from '../utils/expect-audit';

const BASE = '/api/configuracoes-gestao/base-conhecimento';
const PERMISSOES = [
  'configuracoes-gestao.base-conhecimento.ver',
  'configuracoes-gestao.base-conhecimento.criar',
  'configuracoes-gestao.base-conhecimento.editar',
] as const;
const INEXISTENTE = '00000000-0000-4000-8000-000000000000';
const ENTITY = 'DocumentoConhecimento';

describe('Base de Conhecimento (e2e)', () => {
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
    extra: {
      profissionalId?: string;
      categoria?: string;
      conteudo?: string;
      deletedAt?: Date;
    } = {},
  ) {
    return prisma.documentoConhecimento.create({
      data: { titulo, conteudo: `Conteúdo de ${titulo}`, ...extra },
    });
  }

  describe('GET', () => {
    it('lista por título, sem excluídos; busca em título e conteúdo', async () => {
      await criarNoBanco('Retorno', { categoria: 'Orientação' });
      await criarNoBanco('Preparo', { conteudo: 'Jejum de 8 horas' });
      await criarNoBanco('Excluído', { deletedAt: new Date() });

      const todos = await http().get(BASE).expect(200);
      const page = documentoConhecimentoPageSchema.parse(todos.body);
      expect(page.data.map((d) => d.titulo)).toEqual(['Preparo', 'Retorno']);
      expect(page.data[0]).toMatchObject({ categoria: 'Geral', profissionalId: null });

      const buscar = async (query: Record<string, string>) =>
        (await http().get(BASE).query(query).expect(200)).body.data.map(
          (d: { titulo: string }) => d.titulo,
        );
      expect(await buscar({ search: 'RETO' })).toEqual(['Retorno']);
      expect(await buscar({ search: 'jejum' })).toEqual(['Preparo']);
      expect(await buscar({ categoria: 'Orientação' })).toEqual(['Retorno']);
    });

    it('filtro de profissional traz os dele e os gerais, combinado com a busca', async () => {
      const profissional = await prisma.profissional.create({ data: { nome: 'Profissional A' } });
      const outro = await prisma.profissional.create({ data: { nome: 'Profissional B' } });
      await criarNoBanco('Geral');
      await criarNoBanco('Do A', { profissionalId: profissional.id });
      await criarNoBanco('Do B', { profissionalId: outro.id });

      const res = await http().get(BASE).query({ profissionalId: profissional.id }).expect(200);
      expect(res.body.data.map((d: { titulo: string }) => d.titulo)).toEqual(['Do A', 'Geral']);

      const busca = await http()
        .get(BASE)
        .query({ profissionalId: profissional.id, search: 'geral' })
        .expect(200);
      expect(busca.body.data.map((d: { titulo: string }) => d.titulo)).toEqual(['Geral']);
    });

    it('400 para sort fora da whitelist, categoria inválida e profissional inválido', async () => {
      await http().get(BASE).query({ sort: 'conteudo:asc' }).expect(400);
      await http().get(BASE).query({ categoria: 'Outra' }).expect(400);
      await http().get(BASE).query({ profissionalId: 'abc' }).expect(400);
    });

    it('403 sem permissão', async () => {
      const semPermissao = await criarUsuarioTeste(app, { permissoes: [] });
      await comUsuario(app, semPermissao).get(BASE).expect(403);
    });
  });

  describe('GET /:id', () => {
    it('200, 404 (inexistente ou excluído) e 400', async () => {
      const documento = await criarNoBanco('Retorno');
      const excluido = await criarNoBanco('X', { deletedAt: new Date() });

      const ok = await http().get(`${BASE}/${documento.id}`).expect(200);
      expect(documentoConhecimentoSchema.parse(ok.body)).toMatchObject({ titulo: 'Retorno' });
      const nao = await http().get(`${BASE}/${INEXISTENTE}`).expect(404);
      expect(nao.body.message).toBe('Documento não encontrado');
      await http().get(`${BASE}/${excluido.id}`).expect(404);
      await http().get(`${BASE}/abc`).expect(400);
    });
  });

  describe('POST', () => {
    it('201 indexado, com categoria "Geral" e sem profissional; audita CREATE', async () => {
      const res = await http()
        .post(BASE)
        .send({ titulo: '  Preparo de exame ', conteudo: 'Jejum.' })
        .expect(201);

      expect(documentoConhecimentoSchema.parse(res.body)).toMatchObject({
        titulo: 'Preparo de exame',
        categoria: 'Geral',
        profissionalId: null,
        conteudo: 'Jejum.',
      });
      expect(res.body.indexadoEm).not.toBeNull();
      await expectAudit(prisma, {
        action: 'CREATE',
        entity: ENTITY,
        entityId: res.body.id,
        before: null,
        after: { id: res.body.id, titulo: 'Preparo de exame', categoria: 'Geral' },
        userId: usuario.id,
      });
    });

    it('201 vinculado a um profissional', async () => {
      const profissional = await prisma.profissional.create({ data: { nome: 'Profissional A' } });
      const res = await http()
        .post(BASE)
        .send({
          titulo: 'FAQ',
          conteudo: 'X',
          categoria: 'Pergunta Frequente',
          profissionalId: profissional.id,
        })
        .expect(201);
      expect(res.body).toMatchObject({
        profissionalId: profissional.id,
        categoria: 'Pergunta Frequente',
      });
    });

    it('400 "Título é obrigatório." e "Conteúdo é obrigatório.", sem auditar', async () => {
      const res = await http()
        .post(BASE)
        .send({ titulo: '', conteudo: '', categoria: 'Outra', extra: 1 })
        .expect(400);

      expect(res.body.details).toEqual(
        expect.arrayContaining([
          { field: 'titulo', message: 'Título é obrigatório.' },
          { field: 'conteudo', message: 'Conteúdo é obrigatório.' },
          { field: 'categoria', message: 'Categoria inválida' },
          { field: 'extra', message: 'Campo não permitido' },
        ]),
      );
      await expectNoAudit(prisma, { entity: ENTITY });
    });

    it('400 PROFISSIONAL_INVALIDO quando o profissional não existe', async () => {
      const res = await http()
        .post(BASE)
        .send({ titulo: 'FAQ', conteudo: 'X', profissionalId: INEXISTENTE })
        .expect(400);
      expect(res.body).toMatchObject({
        code: 'PROFISSIONAL_INVALIDO',
        details: [{ field: 'profissionalId', message: 'Profissional não encontrado' }],
      });
      await expectNoAudit(prisma, { entity: ENTITY });
    });

    it('403 sem permissão de criar', async () => {
      const leitor = await criarUsuarioTeste(app, {
        permissoes: ['configuracoes-gestao.base-conhecimento.ver'],
      });
      await comUsuario(app, leitor).post(BASE).send({ titulo: 'X', conteudo: 'Y' }).expect(403);
    });
  });

  describe('PATCH /:id', () => {
    it('200, reindexa e audita UPDATE com before/after', async () => {
      const documento = await criarNoBanco('Retorno');

      const res = await http()
        .patch(`${BASE}/${documento.id}`)
        .send({ titulo: 'Retorno 2', conteudo: 'Novo texto', categoria: 'Convênio' })
        .expect(200);

      expect(res.body).toMatchObject({ titulo: 'Retorno 2', categoria: 'Convênio' });
      expect(res.body.indexadoEm).not.toBeNull();
      await expectAudit(prisma, {
        action: 'UPDATE',
        entity: ENTITY,
        entityId: documento.id,
        before: { titulo: 'Retorno', categoria: 'Geral', indexadoEm: null },
        after: { titulo: 'Retorno 2', categoria: 'Convênio' },
        userId: usuario.id,
      });
    });

    it('substituir sem profissional volta o documento para "Geral"', async () => {
      const profissional = await prisma.profissional.create({ data: { nome: 'Profissional A' } });
      const documento = await criarNoBanco('FAQ', { profissionalId: profissional.id });
      const res = await http()
        .patch(`${BASE}/${documento.id}`)
        .send({ titulo: 'FAQ', conteudo: 'X' })
        .expect(200);
      expect(res.body.profissionalId).toBeNull();
    });

    it('404 inexistente/excluído, 400 validação e 403 sem permissão', async () => {
      const excluido = await criarNoBanco('X', { deletedAt: new Date() });
      await http()
        .patch(`${BASE}/${INEXISTENTE}`)
        .send({ titulo: 'A', conteudo: 'B' })
        .expect(404);
      await http().patch(`${BASE}/${excluido.id}`).send({ titulo: 'A', conteudo: 'B' }).expect(404);

      const documento = await criarNoBanco('Retorno');
      await http().patch(`${BASE}/${documento.id}`).send({ titulo: '', conteudo: 'B' }).expect(400);
      await expectNoAudit(prisma, { entity: ENTITY });

      const leitor = await criarUsuarioTeste(app, {
        permissoes: ['configuracoes-gestao.base-conhecimento.ver'],
      });
      await comUsuario(app, leitor)
        .patch(`${BASE}/${documento.id}`)
        .send({ titulo: 'A', conteudo: 'B' })
        .expect(403);
    });
  });
});
