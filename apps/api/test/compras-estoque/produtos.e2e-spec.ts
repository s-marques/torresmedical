import type { INestApplication } from '@nestjs/common';
import { produtoPageSchema, produtoSchema } from '@torres/shared';
import { Workbook } from 'exceljs';
import request from 'supertest';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { comUsuario, criarUsuarioTeste, type UsuarioTeste } from '../utils/auth';
import { createE2eApp } from '../utils/create-e2e-app';
import { truncateAll } from '../utils/database';
import { expectAudit, expectNoAudit } from '../utils/expect-audit';

const BASE = '/api/compras-estoque/produtos';
const BASE_UNIDADES = '/api/compras-estoque/unidades-medida';
const ENTITY = 'Produto';
const PERMISSOES = [
  'compras-estoque.produtos-servicos.ver',
  'compras-estoque.produtos-servicos.criar',
  'compras-estoque.produtos-servicos.editar',
  'compras-estoque.produtos-servicos.excluir',
  'compras-estoque.produtos-servicos.exportar',
] as const;
const INEXISTENTE = '00000000-0000-4000-8000-000000000000';

type TipoBanco = 'PRODUTO' | 'REVENDA' | 'USO_CONSUMO' | 'SERVICO';

describe('Produtos/Serviços (e2e)', () => {
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
    tipo: TipoBanco = 'PRODUTO',
    extra: Record<string, unknown> = {},
  ) {
    return prisma.produto.create({ data: { nome, tipo, precoVenda: 10, ...extra } });
  }

  function nomes(body: { data: { nome: string }[] }) {
    return body.data.map((p) => p.nome);
  }

  describe('GET (listagem)', () => {
    beforeEach(async () => {
      await criarNoBanco('Soro', 'PRODUTO', { sku: 'B-2', precoVenda: 5, estoqueAtual: 3 });
      await criarNoBanco('Luva', 'USO_CONSUMO', { codigoBarras: '789', precoVenda: 20 });
      await criarNoBanco('Camiseta', 'REVENDA', { sku: 'A-1', precoVenda: 50 });
      await criarNoBanco('Consulta', 'SERVICO', { precoVenda: 300 });
      await criarNoBanco('Excluído', 'PRODUTO', { deletedAt: new Date() });
    });

    it('padrão: nome crescente, sem excluídos, com meta e decimais exatos', async () => {
      const res = await http().get(BASE).expect(200);

      const page = produtoPageSchema.parse(res.body);
      expect(page.data.map((p) => p.nome)).toEqual(['Camiseta', 'Consulta', 'Luva', 'Soro']);
      expect(page.data.find((p) => p.nome === 'Soro')).toMatchObject({
        precoVenda: '5',
        estoqueAtual: '3',
        estoqueMinimo: '0',
        controlaEstoque: true,
        ativo: true,
      });
      expect(page.meta).toEqual({ page: 1, pageSize: 10, total: 4, totalPages: 1 });
    });

    it('chips: Produtos agrupa Produto, Revenda e Uso e Consumo; Serviços só serviço', async () => {
      const produtos = await http().get(BASE).query({ tipo: 'produto' }).expect(200);
      expect(nomes(produtos.body)).toEqual(['Camiseta', 'Luva', 'Soro']);

      const servicos = await http().get(BASE).query({ tipo: 'servico' }).expect(200);
      expect(nomes(servicos.body)).toEqual(['Consulta']);
    });

    it('busca por nome, SKU ou código de barras', async () => {
      for (const [search, esperado] of [
        ['SOR', 'Soro'],
        ['a-1', 'Camiseta'],
        ['789', 'Luva'],
      ] as const) {
        const res = await http().get(BASE).query({ search }).expect(200);
        expect(nomes(res.body)).toEqual([esperado]);
      }
    });

    it('ordena por colunas do grid (código = SKU) e pagina', async () => {
      const preco = await http().get(BASE).query({ sort: 'precoVenda:desc' }).expect(200);
      expect(nomes(preco.body)).toEqual(['Consulta', 'Camiseta', 'Luva', 'Soro']);

      const codigo = await http().get(BASE).query({ sort: 'codigo:asc', pageSize: 2 }).expect(200);
      expect(nomes(codigo.body)).toEqual(['Camiseta', 'Soro']);
      expect(codigo.body.meta).toEqual({ page: 1, pageSize: 2, total: 4, totalPages: 2 });

      const pagina2 = await http().get(BASE).query({ pageSize: 3, page: 2 }).expect(200);
      expect(nomes(pagina2.body)).toEqual(['Soro']);
    });

    it('400 para sort fora da whitelist e tipo inválido', async () => {
      const sort = await http().get(BASE).query({ sort: 'ncm:asc' }).expect(400);
      expect(sort.body.details.map((d: { field: string }) => d.field)).toEqual(['sort']);

      await http().get(BASE).query({ tipo: 'revenda' }).expect(400);
    });
  });

  describe('GET /:id', () => {
    it('200, 404 (inexistente ou excluído) e 400 (id inválido)', async () => {
      const produto = await criarNoBanco('Soro');
      const excluido = await criarNoBanco('X', 'PRODUTO', { deletedAt: new Date() });

      const ok = await http().get(`${BASE}/${produto.id}`).expect(200);
      expect(produtoSchema.parse(ok.body)).toMatchObject({ id: produto.id, nome: 'Soro' });
      for (const id of [INEXISTENTE, excluido.id]) {
        const res = await http().get(`${BASE}/${id}`).expect(404);
        expect(res.body).toMatchObject({ code: 'NOT_FOUND', message: 'Produto não encontrado' });
      }
      await http().get(`${BASE}/abc`).expect(400);
    });
  });

  describe('POST (Novo Produto/Serviço)', () => {
    it('201: só nome e preço de venda usam os padrões; audita CREATE', async () => {
      const res = await http().post(BASE).send({ nome: '  Soro ', precoVenda: 12.5 }).expect(201);

      expect(produtoSchema.parse(res.body)).toMatchObject({
        nome: 'Soro',
        tipo: 'PRODUTO',
        precoVenda: '12.5',
        precoCusto: null,
        estoqueMinimo: '0',
        estoqueAtual: '0',
        controlaEstoque: true,
        ativo: true,
        sku: null,
      });
      await expectAudit(prisma, {
        action: 'CREATE',
        entity: ENTITY,
        entityId: res.body.id,
        before: null,
        after: { nome: 'Soro', tipo: 'PRODUTO', precoVenda: '12.5', controlaEstoque: true },
        userId: usuario.id,
      });
    });

    it('201 com todos os campos, categoria e unidade; vazios viram null', async () => {
      const categoria = await prisma.categoria.create({
        data: { nome: 'Insumos', tipo: 'PRODUTO' },
      });
      const unidade = await prisma.unidadeMedida.create({ data: { nome: 'Caixa', sigla: 'CX' } });

      const res = await http()
        .post(BASE)
        .send({
          nome: 'Luva',
          tipo: 'uso-consumo',
          categoriaId: categoria.id,
          unidadeMedidaId: unidade.id,
          marca: 'Descarpack',
          codigoBarras: '7891234567895',
          sku: 'LUV-01',
          precoCusto: 20,
          precoVenda: 35.9,
          estoqueMinimo: 4.5,
          controlaEstoque: false,
          ncm: '40151100',
          descricao: '',
        })
        .expect(201);

      expect(res.body).toMatchObject({
        tipo: 'USO_CONSUMO',
        categoriaId: categoria.id,
        unidadeMedidaId: unidade.id,
        marca: 'Descarpack',
        precoCusto: '20',
        precoVenda: '35.9',
        estoqueMinimo: '4.5',
        controlaEstoque: false,
        ncm: '40151100',
        descricao: null,
      });
    });

    it('400 "Nome é obrigatório." com o nome vazio ou ausente, sem auditar', async () => {
      for (const body of [
        { nome: '', precoVenda: 1 },
        { nome: '   ', precoVenda: 1 },
        { precoVenda: 1 },
      ]) {
        const res = await http().post(BASE).send(body).expect(400);
        expect(res.body.details).toEqual([
          expect.objectContaining({ field: 'nome', message: 'Nome é obrigatório.' }),
        ]);
      }
      await expectNoAudit(prisma, { entity: ENTITY });
    });

    it('400 sem preço de venda ou com valor negativo, sem auditar', async () => {
      const ausente = await http().post(BASE).send({ nome: 'X' }).expect(400);
      expect(ausente.body.details).toEqual([
        expect.objectContaining({ field: 'precoVenda', message: 'Preço de venda é obrigatório.' }),
      ]);

      const negativo = await http()
        .post(BASE)
        .send({ nome: 'X', precoVenda: -1, precoCusto: -2, estoqueMinimo: -3 })
        .expect(400);
      expect(negativo.body.details.map((d: { field: string }) => d.field).sort()).toEqual([
        'estoqueMinimo',
        'precoCusto',
        'precoVenda',
      ]);
      await expectNoAudit(prisma, { entity: ENTITY });
    });

    it('400 para tipo inválido, campo não permitido e categoria ou unidade inexistentes', async () => {
      const invalido = await http()
        .post(BASE)
        .send({ nome: 'X', precoVenda: 1, tipo: 'outro', estoqueAtual: 9 })
        .expect(400);
      expect(invalido.body.details.map((d: { field: string }) => d.field).sort()).toEqual([
        'estoqueAtual',
        'tipo',
      ]);

      const categoria = await http()
        .post(BASE)
        .send({ nome: 'X', precoVenda: 1, categoriaId: INEXISTENTE })
        .expect(400);
      expect(categoria.body.code).toBe('CATEGORIA_INVALIDA');

      const unidade = await http()
        .post(BASE)
        .send({ nome: 'X', precoVenda: 1, unidadeMedidaId: INEXISTENTE })
        .expect(400);
      expect(unidade.body.code).toBe('UNIDADE_MEDIDA_INVALIDA');
      await expectNoAudit(prisma, { entity: ENTITY });
    });
  });

  describe('PATCH /:id (Editar Produto)', () => {
    it('200: altera os campos e audita UPDATE com before/after', async () => {
      const produto = await criarNoBanco('Soro', 'PRODUTO', { precoCusto: 4 });

      const res = await http()
        .patch(`${BASE}/${produto.id}`)
        .send({ nome: 'Soro 500ml', tipo: 'revenda', precoCusto: null, precoVenda: 11 })
        .expect(200);

      expect(res.body).toMatchObject({ nome: 'Soro 500ml', tipo: 'REVENDA', precoCusto: null });
      await expectAudit(prisma, {
        action: 'UPDATE',
        entity: ENTITY,
        entityId: produto.id,
        before: { nome: 'Soro', tipo: 'PRODUTO', precoCusto: '4' },
        after: { nome: 'Soro 500ml', tipo: 'REVENDA', precoCusto: null, precoVenda: '11' },
        userId: usuario.id,
      });
    });

    it('não altera o estoque atual', async () => {
      const produto = await criarNoBanco('Soro', 'PRODUTO', { estoqueAtual: 7 });

      await http().patch(`${BASE}/${produto.id}`).send({ nome: 'Soro', precoVenda: 1 }).expect(200);

      expect(
        (
          await prisma.produto.findUniqueOrThrow({ where: { id: produto.id } })
        ).estoqueAtual.toString(),
      ).toBe('7');
    });

    it('400 sem nome e 404 inexistente ou excluído, sem auditar', async () => {
      const produto = await criarNoBanco('Soro');
      const excluido = await criarNoBanco('X', 'PRODUTO', { deletedAt: new Date() });

      const vazio = await http()
        .patch(`${BASE}/${produto.id}`)
        .send({ nome: '', precoVenda: 1 })
        .expect(400);
      expect(vazio.body.details[0].message).toBe('Nome é obrigatório.');
      for (const id of [INEXISTENTE, excluido.id]) {
        await http().patch(`${BASE}/${id}`).send({ nome: 'Y', precoVenda: 1 }).expect(404);
      }
      await expectNoAudit(prisma, { entity: ENTITY });
    });
  });

  describe('DELETE /:id', () => {
    it('exclusão lógica: 200, audita DELETE e some da listagem', async () => {
      const produto = await criarNoBanco('teste');

      await http().delete(`${BASE}/${produto.id}`).expect(200);

      await expectAudit(prisma, {
        action: 'DELETE',
        entity: ENTITY,
        entityId: produto.id,
        before: { nome: 'teste', deletedAt: null },
        after: null,
        userId: usuario.id,
      });
      expect(
        (await prisma.produto.findUniqueOrThrow({ where: { id: produto.id } })).deletedAt,
      ).not.toBeNull();
      await http().get(`${BASE}/${produto.id}`).expect(404);
    });

    it('404 para já excluído ou inexistente, sem auditar', async () => {
      const produto = await criarNoBanco('teste', 'PRODUTO', { deletedAt: new Date() });

      await http().delete(`${BASE}/${produto.id}`).expect(404);
      await http().delete(`${BASE}/${INEXISTENTE}`).expect(404);
      await expectNoAudit(prisma, { entity: ENTITY });
    });
  });

  describe('POST unidades-medida (Incluir)', () => {
    it('201: sigla em maiúsculas; audita CREATE; some o excluído do lookup', async () => {
      const res = await http()
        .post(BASE_UNIDADES)
        .send({ nome: ' Mililitro ', sigla: 'ml' })
        .expect(201);

      expect(res.body).toMatchObject({ nome: 'Mililitro', sigla: 'ML' });
      await expectAudit(prisma, {
        action: 'CREATE',
        entity: 'UnidadeMedida',
        entityId: res.body.id,
        before: null,
        after: { nome: 'Mililitro', sigla: 'ML' },
        userId: usuario.id,
      });
    });

    it('400 sem nome ou sigla, sem auditar', async () => {
      const res = await http().post(BASE_UNIDADES).send({ nome: '', sigla: '' }).expect(400);

      expect(res.body.details).toEqual([
        expect.objectContaining({ field: 'nome', message: 'O nome é obrigatório.' }),
        expect.objectContaining({ field: 'sigla', message: 'A sigla é obrigatória.' }),
      ]);
      await expectNoAudit(prisma, { entity: 'UnidadeMedida' });
    });

    it('403 sem a permissão criar', async () => {
      const semPermissao = await criarUsuarioTeste(app, {
        permissoes: ['compras-estoque.produtos-servicos.ver'],
      });

      await comUsuario(app, semPermissao)
        .post(BASE_UNIDADES)
        .send({ nome: 'Caixa', sigla: 'CX' })
        .expect(403);
      await expectNoAudit(prisma, { entity: 'UnidadeMedida' });
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
      await criarNoBanco('Soro', 'PRODUTO', { sku: 'S-1' });
      await criarNoBanco('Camiseta', 'REVENDA', { sku: 'C-1' });
      await criarNoBanco('Consulta', 'SERVICO');

      const res = await binary(
        http().get(`${BASE}/export`).query({
          format: 'xlsx',
          tipo: 'produto',
          sort: 'nome:asc',
          columns: 'nome,tipo,codigo',
        }),
      ).expect(200);

      const workbook = new Workbook();
      await workbook.xlsx.load(res.body as unknown as ArrayBuffer);
      const rows: unknown[][] = [];
      workbook.worksheets[0]?.eachRow((row) => rows.push((row.values as unknown[]).slice(1)));
      expect(rows).toEqual([
        ['Produto/Serviço', 'Tipo', 'Código'],
        ['Camiseta', 'Revenda', 'C-1'],
        ['Soro', 'Produto', 'S-1'],
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
