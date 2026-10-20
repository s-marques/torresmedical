import type { INestApplication } from '@nestjs/common';
import { categoriaPageSchema, categoriaSchema } from '@torres/shared';
import { Workbook } from 'exceljs';
import request from 'supertest';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { comUsuario, criarUsuarioTeste, type UsuarioTeste } from '../utils/auth';
import { createE2eApp } from '../utils/create-e2e-app';
import { truncateAll } from '../utils/database';
import { expectAudit, expectNoAudit } from '../utils/expect-audit';

const BASE = '/api/compras-estoque/categorias';
const ENTITY = 'Categoria';
const PERMISSOES = [
  'compras-estoque.categorias.ver',
  'compras-estoque.categorias.criar',
  'compras-estoque.categorias.editar',
  'compras-estoque.categorias.excluir',
  'compras-estoque.categorias.exportar',
] as const;
const INEXISTENTE = '00000000-0000-4000-8000-000000000000';
const COR = '#6366f1';

describe('Categorias (e2e)', () => {
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

  function http() {
    return comUsuario(app, usuario);
  }

  function criarNoBanco(
    nome: string,
    tipo: 'PRODUTO' | 'SERVICO' = 'SERVICO',
    extra: { descricao?: string; deletedAt?: Date } = {},
  ) {
    return prisma.categoria.create({ data: { nome, tipo, cor: COR, ...extra } });
  }

  describe('GET (listagem)', () => {
    beforeEach(async () => {
      await criarNoBanco('Estética', 'SERVICO', { descricao: 'Procedimentos' });
      await criarNoBanco('Insumos', 'PRODUTO');
      await criarNoBanco('Consultas', 'SERVICO');
      await criarNoBanco('Excluída', 'SERVICO', { deletedAt: new Date() });
    });

    it('padrão: nome crescente, sem excluídas, com meta de paginação', async () => {
      const res = await http().get(BASE).expect(200);

      const page = categoriaPageSchema.parse(res.body);
      expect(page.data.map((c) => [c.nome, c.tipo, c.cor])).toEqual([
        ['Consultas', 'SERVICO', COR],
        ['Estética', 'SERVICO', COR],
        ['Insumos', 'PRODUTO', COR],
      ]);
      expect(page.meta).toEqual({ page: 1, pageSize: 10, total: 3, totalPages: 1 });
    });

    it('filtra por tipo, busca por nome ou descrição, ordena e pagina', async () => {
      const produtos = await http().get(BASE).query({ tipo: 'produto' }).expect(200);
      expect(produtos.body.data.map((c: { nome: string }) => c.nome)).toEqual(['Insumos']);

      const busca = await http().get(BASE).query({ search: 'PROCEDIM' }).expect(200);
      expect(busca.body.data.map((c: { nome: string }) => c.nome)).toEqual(['Estética']);

      const porNome = await http()
        .get(BASE)
        .query({ sort: 'nome:desc', pageSize: 2, page: 2 })
        .expect(200);
      expect(porNome.body.data.map((c: { nome: string }) => c.nome)).toEqual(['Consultas']);
      expect(porNome.body.meta).toEqual({ page: 2, pageSize: 2, total: 3, totalPages: 2 });
    });

    it('400 para sort fora da whitelist e tipo inválido', async () => {
      const sort = await http().get(BASE).query({ sort: 'cor:asc' }).expect(400);
      expect(sort.body.details.map((d: { field: string }) => d.field)).toEqual(['sort']);

      await http().get(BASE).query({ tipo: 'outro' }).expect(400);
    });
  });

  describe('GET /:id', () => {
    it('200, 404 (inexistente ou excluída) e 400 (id inválido)', async () => {
      const categoria = await criarNoBanco('Estética');
      const excluida = await criarNoBanco('X', 'SERVICO', { deletedAt: new Date() });

      const ok = await http().get(`${BASE}/${categoria.id}`).expect(200);
      expect(categoriaSchema.parse(ok.body)).toMatchObject({ id: categoria.id, nome: 'Estética' });
      for (const id of [INEXISTENTE, excluida.id]) {
        const res = await http().get(`${BASE}/${id}`).expect(404);
        expect(res.body).toMatchObject({ code: 'NOT_FOUND', message: 'Categoria não encontrada' });
      }
      await http().get(`${BASE}/abc`).expect(400);
    });
  });

  describe('POST (Nova Categoria)', () => {
    it('201: só com o nome usa serviço e a primeira cor; audita CREATE', async () => {
      const res = await http().post(BASE).send({ nome: '  Estética ' }).expect(201);

      expect(categoriaSchema.parse(res.body)).toMatchObject({
        nome: 'Estética',
        tipo: 'SERVICO',
        cor: COR,
        descricao: null,
      });
      await expectAudit(prisma, {
        action: 'CREATE',
        entity: ENTITY,
        entityId: res.body.id,
        before: null,
        after: { nome: 'Estética', tipo: 'SERVICO', cor: COR, descricao: null },
        userId: usuario.id,
      });
    });

    it('201 com todos os campos e nome repetido (permitido)', async () => {
      await criarNoBanco('Insumos', 'PRODUTO');

      const res = await http()
        .post(BASE)
        .send({ nome: 'Insumos', tipo: 'produto', cor: '#22c55e', descricao: 'Material' })
        .expect(201);

      expect(res.body).toMatchObject({ tipo: 'PRODUTO', cor: '#22c55e', descricao: 'Material' });
      expect(await prisma.categoria.count({ where: { nome: 'Insumos' } })).toBe(2);
    });

    it('400 "O nome da categoria é obrigatório." com o nome vazio ou ausente, sem auditar', async () => {
      for (const body of [{ nome: '' }, { nome: '   ' }, {}]) {
        const res = await http().post(BASE).send(body).expect(400);
        expect(res.body.details).toEqual([
          { field: 'nome', message: 'O nome da categoria é obrigatório.' },
        ]);
      }
      await expectNoAudit(prisma, { entity: ENTITY });
    });

    it('400 para tipo, cor inválida e campo não permitido', async () => {
      const res = await http()
        .post(BASE)
        .send({ nome: 'X', tipo: 'outro', cor: 'azul', deletedAt: null })
        .expect(400);

      expect(res.body.details.map((d: { field: string }) => d.field).sort()).toEqual([
        'cor',
        'deletedAt',
        'tipo',
      ]);
      await expectNoAudit(prisma, { entity: ENTITY });
    });
  });

  describe('PATCH /:id (Editar Categoria)', () => {
    it('200: altera os campos e audita UPDATE com before/after', async () => {
      const categoria = await criarNoBanco('Marketing');

      const res = await http()
        .patch(`${BASE}/${categoria.id}`)
        .send({ nome: 'Marketing digital', tipo: 'produto', cor: '#14b8a6', descricao: 'Anúncios' })
        .expect(200);

      expect(res.body).toMatchObject({ nome: 'Marketing digital', tipo: 'PRODUTO' });
      await expectAudit(prisma, {
        action: 'UPDATE',
        entity: ENTITY,
        entityId: categoria.id,
        before: { nome: 'Marketing', tipo: 'SERVICO', cor: COR },
        after: {
          nome: 'Marketing digital',
          tipo: 'PRODUTO',
          cor: '#14b8a6',
          descricao: 'Anúncios',
        },
        userId: usuario.id,
      });
    });

    it('400 sem nome e 404 inexistente ou excluída, sem auditar', async () => {
      const categoria = await criarNoBanco('Marketing');
      const excluida = await criarNoBanco('X', 'SERVICO', { deletedAt: new Date() });

      const vazio = await http().patch(`${BASE}/${categoria.id}`).send({ nome: '' }).expect(400);
      expect(vazio.body.details[0].message).toBe('O nome da categoria é obrigatório.');
      for (const id of [INEXISTENTE, excluida.id]) {
        await http().patch(`${BASE}/${id}`).send({ nome: 'Y' }).expect(404);
      }
      await expectNoAudit(prisma, { entity: ENTITY });
    });
  });

  describe('DELETE /:id', () => {
    it('exclusão lógica: 200, audita DELETE e some da listagem', async () => {
      const categoria = await criarNoBanco('teste');

      await http().delete(`${BASE}/${categoria.id}`).expect(200);

      await expectAudit(prisma, {
        action: 'DELETE',
        entity: ENTITY,
        entityId: categoria.id,
        before: { nome: 'teste', deletedAt: null },
        after: null,
        userId: usuario.id,
      });
      expect(
        (await prisma.categoria.findUniqueOrThrow({ where: { id: categoria.id } })).deletedAt,
      ).not.toBeNull();
      await http().get(`${BASE}/${categoria.id}`).expect(404);
    });

    it('409 CATEGORIA_EM_USO quando um produto usa a categoria, sem auditar', async () => {
      const categoria = await criarNoBanco('Insumos', 'PRODUTO');
      await prisma.produto.create({
        data: { nome: 'Luva', tipo: 'PRODUTO', categoriaId: categoria.id },
      });

      const res = await http().delete(`${BASE}/${categoria.id}`).expect(409);

      expect(res.body.code).toBe('CATEGORIA_EM_USO');
      await expectNoAudit(prisma, { entity: ENTITY });
    });

    it('produtos excluídos não bloqueiam; 404 para já excluída', async () => {
      const categoria = await criarNoBanco('Insumos', 'PRODUTO');
      await prisma.produto.create({
        data: { nome: 'Luva', tipo: 'PRODUTO', categoriaId: categoria.id, deletedAt: new Date() },
      });

      await http().delete(`${BASE}/${categoria.id}`).expect(200);
      await http().delete(`${BASE}/${categoria.id}`).expect(404);
      await http().delete(`${BASE}/${INEXISTENTE}`).expect(404);
    });
  });

  describe('GET /export', () => {
    function binary(req: request.Test) {
      return req.buffer(true).parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      });
    }

    it('xlsx com filtro, ordenação e colunas visíveis; audita EXPORT', async () => {
      await criarNoBanco('Estética', 'SERVICO');
      await criarNoBanco('Consultas', 'SERVICO');
      await criarNoBanco('Insumos', 'PRODUTO');

      const res = await binary(
        http()
          .get(`${BASE}/export`)
          .query({ format: 'xlsx', tipo: 'servico', sort: 'nome:asc', columns: 'nome,tipo' }),
      ).expect(200);

      const workbook = new Workbook();
      await workbook.xlsx.load(res.body as unknown as ArrayBuffer);
      const rows: unknown[][] = [];
      workbook.worksheets[0]?.eachRow((row) => rows.push((row.values as unknown[]).slice(1)));
      expect(rows).toEqual([
        ['Nome', 'Tipo'],
        ['Consultas', 'Serviço'],
        ['Estética', 'Serviço'],
      ]);
      await expectAudit(prisma, {
        action: 'EXPORT',
        entity: ENTITY,
        entityId: '*',
        userId: usuario.id,
      });
    });

    it('400 para colunas inválidas, sem auditar', async () => {
      const res = await http()
        .get(`${BASE}/export`)
        .query({ format: 'xlsx', columns: 'senha' })
        .expect(400);

      expect(res.body.details[0].field).toBe('columns');
      await expectNoAudit(prisma, { entity: ENTITY, action: 'EXPORT' });
    });
  });

  describe('acesso', () => {
    const ROTAS = [
      { metodo: 'get', caminho: BASE, permissao: 'ver' },
      { metodo: 'get', caminho: `${BASE}/export?format=xlsx`, permissao: 'exportar' },
      { metodo: 'get', caminho: `${BASE}/${INEXISTENTE}`, permissao: 'ver' },
      { metodo: 'post', caminho: BASE, permissao: 'criar' },
      { metodo: 'patch', caminho: `${BASE}/${INEXISTENTE}`, permissao: 'editar' },
      { metodo: 'delete', caminho: `${BASE}/${INEXISTENTE}`, permissao: 'excluir' },
    ] as const;

    it.each(ROTAS)('$metodo $caminho sem token responde 401', async ({ metodo, caminho }) => {
      await request(app.getHttpServer())[metodo](caminho).send({}).expect(401);
    });

    it.each(ROTAS)(
      '$metodo $caminho sem a permissão $permissao responde 403, sem auditar',
      async ({ metodo, caminho, permissao }) => {
        const outras = PERMISSOES.filter((p) => !p.endsWith(`.${permissao}`));
        const semPermissao = await criarUsuarioTeste(app, { permissoes: outras });

        const res = await comUsuario(app, semPermissao)[metodo](caminho).send({}).expect(403);

        expect(res.body).toMatchObject({ code: 'FORBIDDEN', message: 'Sem permissão' });
        await expectNoAudit(prisma, { entity: ENTITY });
      },
    );
  });
});
