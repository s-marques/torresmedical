import type { INestApplication } from '@nestjs/common';
import { caixaPageSchema, caixaSchema } from '@torres/shared';
import request from 'supertest';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { comUsuario, criarUsuarioTeste, type UsuarioTeste } from '../utils/auth';
import { createE2eApp } from '../utils/create-e2e-app';
import { truncateAll } from '../utils/database';
import { expectAudit, expectNoAudit } from '../utils/expect-audit';

const BASE = '/api/financeiro/caixas';
const ENTITY = 'Caixa';
const PERMISSOES = [
  'financeiro.caixas.ver',
  'financeiro.caixas.criar',
  'financeiro.caixas.exportar',
] as const;

describe('Caixas (e2e)', () => {
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
    nome: string,
    extra: Partial<{ status: 'ABERTO' | 'FECHADO'; valorAbertura: number; deletedAt: Date }> = {},
  ) {
    return prisma.caixa.create({
      data: { nome, operadorId: usuario.id, valorAbertura: 100, ...extra },
    });
  }

  describe('GET (listagem)', () => {
    beforeEach(async () => {
      await criarNoBanco('Caixa A');
      await criarNoBanco('Caixa B', { status: 'FECHADO', valorAbertura: 50 });
      await criarNoBanco('Excluído', { deletedAt: new Date() });
    });

    it('200: lista com o operador, sem excluídos, com meta', async () => {
      const res = await http().get(BASE).expect(200);
      const page = caixaPageSchema.parse(res.body);
      expect(page.data.map((c) => c.nome).sort()).toEqual(['Caixa A', 'Caixa B']);
      const operador = await prisma.usuario.findUniqueOrThrow({ where: { id: usuario.id } });
      expect(page.data[0]?.operador).toBe(operador.nome);
      expect(page.meta).toEqual({ page: 1, pageSize: 10, total: 2, totalPages: 1 });
    });

    it('filtra por status, busca, ordena e pagina', async () => {
      const nomes = async (query: Record<string, string | number>) =>
        (await http().get(BASE).query(query).expect(200)).body.data.map(
          (c: { nome: string }) => c.nome,
        );
      expect(await nomes({ status: 'aberto' })).toEqual(['Caixa A']);
      expect(await nomes({ status: 'fechado' })).toEqual(['Caixa B']);
      expect(await nomes({ search: 'caixa b' })).toEqual(['Caixa B']);
      expect(await nomes({ sort: 'valorAbertura:asc' })).toEqual(['Caixa B', 'Caixa A']);
      expect(await nomes({ sort: 'operador:asc', pageSize: 1, page: 2 })).toHaveLength(1);
    });

    it('400 para sort e status inválidos', async () => {
      await http().get(BASE).query({ sort: 'x:asc' }).expect(400);
      await http().get(BASE).query({ status: 'x' }).expect(400);
    });

    it('403 sem permissão e 401 sem login', async () => {
      const sem = await criarUsuarioTeste(app, { permissoes: [] });
      await comUsuario(app, sem).get(BASE).expect(403);
      await request(app.getHttpServer()).get(BASE).expect(401);
    });
  });

  describe('POST (Abrir Caixa)', () => {
    it('201: abre para o usuário logado e audita CREATE', async () => {
      const res = await http().post(BASE).send({ nome: ' Caixa 1 ', valorAbertura: 150.5 }).expect(201);

      expect(caixaSchema.parse(res.body)).toMatchObject({
        nome: 'Caixa 1',
        status: 'ABERTO',
        operadorId: usuario.id,
        valorAbertura: '150.5',
        dataFechamento: null,
      });
      await expectAudit(prisma, {
        action: 'CREATE',
        entity: ENTITY,
        entityId: res.body.id,
        before: null,
        after: { nome: 'Caixa 1', status: 'ABERTO' },
        userId: usuario.id,
      });
    });

    it('400 "Nome é obrigatório." e "Valor de abertura é obrigatório.", sem auditar', async () => {
      const res = await http().post(BASE).send({}).expect(400);
      expect(res.body.details).toEqual(
        expect.arrayContaining([
          { field: 'nome', message: 'Nome é obrigatório.' },
          { field: 'valorAbertura', message: 'Valor de abertura é obrigatório.' },
        ]),
      );
      await http().post(BASE).send({ nome: 'X', valorAbertura: -1 }).expect(400);
      await expectNoAudit(prisma, { entity: ENTITY });
    });

    it('409 se o operador já tem caixa aberto', async () => {
      await criarNoBanco('Aberto');
      const res = await http().post(BASE).send({ nome: 'Outro', valorAbertura: 10 }).expect(409);
      expect(res.body.code).toBe('CAIXA_JA_ABERTO');
      await expectNoAudit(prisma, { entity: ENTITY });
    });

    it('403 sem permissão de abrir', async () => {
      const sem = await criarUsuarioTeste(app, {
        permissoes: ['financeiro.caixas.ver'],
      });
      await comUsuario(app, sem).post(BASE).send({ nome: 'X', valorAbertura: 1 }).expect(403);
    });
  });

  describe('GET /export', () => {
    it('200 xlsx e audita EXPORT; 400 formato inválido; 403 sem permissão', async () => {
      await criarNoBanco('Caixa A');
      const res = await http()
        .get(`${BASE}/export`)
        .query({ format: 'xlsx' })
        .buffer(true)
        .parse((r, callback) => {
          const chunks: Buffer[] = [];
          r.on('data', (chunk: Buffer) => chunks.push(chunk));
          r.on('end', () => callback(null, Buffer.concat(chunks)));
        })
        .expect(200);
      expect(res.headers['content-type']).toContain('spreadsheetml');
      await expectAudit(prisma, { action: 'EXPORT', entity: ENTITY, entityId: '*', userId: usuario.id });
      await http().get(`${BASE}/export`).query({ format: 'doc' }).expect(400);
      const sem = await criarUsuarioTeste(app, {
        permissoes: ['financeiro.caixas.ver'],
      });
      await comUsuario(app, sem).get(`${BASE}/export`).query({ format: 'xlsx' }).expect(403);
    });
  });
});
