import type { INestApplication } from '@nestjs/common';
import { lotePageSchema, loteSchema, resumoLotesSchema, somarDias } from '@torres/shared';
import { Workbook } from 'exceljs';
import request from 'supertest';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { hojeNaClinica } from '../../src/modules/compras-estoque/estoque/estoque-filtros';
import { comUsuario, criarUsuarioTeste, type UsuarioTeste } from '../utils/auth';
import { createE2eApp } from '../utils/create-e2e-app';
import { truncateAll } from '../utils/database';
import { expectAudit, expectNoAudit } from '../utils/expect-audit';

const BASE = '/api/compras-estoque/lotes';
const ENTITY = 'Lote';
const PERMISSOES = [
  'compras-estoque.lotes-validade.ver',
  'compras-estoque.lotes-validade.criar',
  'compras-estoque.lotes-validade.exportar',
] as const;
const INEXISTENTE = '00000000-0000-4000-8000-000000000000';

describe('Lotes / Validade (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let usuario: UsuarioTeste;
  let hoje: string;

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await truncateAll(prisma);
    usuario = await criarUsuarioTeste(app, { permissoes: PERMISSOES });
    hoje = hojeNaClinica();
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => comUsuario(app, usuario);

  const criarProduto = (
    nome: string,
    o: { sku?: string; tipo?: 'PRODUTO' | 'SERVICO'; atual?: number; minimo?: number } = {},
  ) =>
    prisma.produto.create({
      data: {
        nome,
        sku: o.sku,
        tipo: o.tipo ?? 'PRODUTO',
        estoqueAtual: o.atual ?? 0,
        estoqueMinimo: o.minimo ?? 0,
      },
    });

  const criarLote = (
    produtoId: string,
    numero: string,
    dias: number,
    o: { quantidade?: number; deletedAt?: Date } = {},
  ) =>
    prisma.lote.create({
      data: {
        produtoId,
        numero,
        dataVencimento: new Date(`${somarDias(hoje, dias)}T00:00:00Z`),
        quantidade: o.quantidade ?? 10,
        deletedAt: o.deletedAt,
      },
    });

  describe('POST / (Novo Lote)', () => {
    it('201: cadastra, calcula o status, não mexe no saldo do produto e audita CREATE', async () => {
      const produto = await criarProduto('Luva', { sku: 'LUV-1', atual: 7 });
      const vencimento = somarDias(hoje, 30);

      const res = await http()
        .post(BASE)
        .send({
          produtoId: produto.id,
          numero: ' LOT-2026-001 ',
          dataVencimento: vencimento,
          quantidade: 12.5,
        })
        .expect(201);

      expect(loteSchema.parse(res.body)).toMatchObject({
        produtoId: produto.id,
        produtoNome: 'Luva',
        produtoSku: 'LUV-1',
        numero: 'LOT-2026-001',
        dataVencimento: vencimento,
        quantidade: '12.5',
        status: 'VENCENDO',
      });
      const salvo = await prisma.produto.findUniqueOrThrow({ where: { id: produto.id } });
      expect(Number(salvo.estoqueAtual)).toBe(7);
      expect(await prisma.movimentacaoEstoque.count()).toBe(0);
      await expectAudit(prisma, {
        action: 'CREATE',
        entity: ENTITY,
        entityId: res.body.id,
        before: null,
        after: { numero: 'LOT-2026-001', quantidade: '12.5', produtoId: produto.id },
        userId: usuario.id,
      });
    });

    it('400: campos obrigatórios com as mensagens do formulário, sem auditar', async () => {
      const res = await http().post(BASE).send({}).expect(400);
      expect(res.body.details).toEqual(
        expect.arrayContaining([
          { field: 'produtoId', message: 'Produto é obrigatório.' },
          { field: 'numero', message: 'Número do Lote é obrigatório.' },
          { field: 'dataVencimento', message: 'Data de Vencimento é obrigatória.' },
          { field: 'quantidade', message: 'Quantidade é obrigatória.' },
        ]),
      );
      await expectNoAudit(prisma, { entity: ENTITY });
    });

    it('400: quantidade deve ser maior que zero', async () => {
      const produto = await criarProduto('Luva');
      const res = await http()
        .post(BASE)
        .send({ produtoId: produto.id, numero: 'L1', dataVencimento: hoje, quantidade: 0 })
        .expect(400);
      expect(res.body.details).toEqual([
        { field: 'quantidade', message: 'A quantidade deve ser maior que zero' },
      ]);
    });

    it('404 para produto inexistente, excluído ou serviço, sem auditar', async () => {
      const servico = await criarProduto('Consulta', { tipo: 'SERVICO' });
      const excluido = await prisma.produto.create({
        data: { nome: 'Antigo', tipo: 'PRODUTO', deletedAt: new Date() },
      });
      for (const produtoId of [INEXISTENTE, servico.id, excluido.id]) {
        const res = await http()
          .post(BASE)
          .send({ produtoId, numero: 'L1', dataVencimento: hoje, quantidade: 1 })
          .expect(404);
        expect(res.body).toMatchObject({ code: 'NOT_FOUND', message: 'Produto não encontrado' });
      }
      await expectNoAudit(prisma, { entity: ENTITY });
    });
  });

  describe('GET / (grid)', () => {
    it('lista com status, filtros por produto, "Apenas com saldo" e busca', async () => {
      const luva = await criarProduto('Luva', { sku: 'LUV-1' });
      const gaze = await criarProduto('Gaze', { sku: 'GAZ-9' });
      await criarLote(luva.id, 'A-VENCIDO', -1);
      await criarLote(luva.id, 'B-VENCENDO', 60);
      await criarLote(gaze.id, 'C-VALIDO', 61, { quantidade: 0 });
      await criarLote(gaze.id, 'D-EXCLUIDO', 10, { deletedAt: new Date() });

      const todos = lotePageSchema.parse((await http().get(BASE).expect(200)).body);
      expect(todos.meta).toEqual({ page: 1, pageSize: 10, total: 3, totalPages: 1 });
      expect(todos.data.map((l) => [l.numero, l.status])).toEqual([
        ['A-VENCIDO', 'VENCIDO'],
        ['B-VENCENDO', 'VENCENDO'],
        ['C-VALIDO', 'VALIDO'],
      ]);

      const numeros = async (query: Record<string, string>) =>
        lotePageSchema
          .parse((await http().get(BASE).query(query).expect(200)).body)
          .data.map((l) => l.numero);
      expect(await numeros({ produtoId: gaze.id })).toEqual(['C-VALIDO']);
      expect(await numeros({ comSaldo: 'true' })).toEqual(['A-VENCIDO', 'B-VENCENDO']);
      expect(await numeros({ search: 'vencendo' })).toEqual(['B-VENCENDO']);
      expect(await numeros({ search: 'gaz-9' })).toEqual(['C-VALIDO']);
      expect(await numeros({ search: 'gaze', comSaldo: 'true' })).toEqual([]);
    });

    it('ordena pelas colunas do grid e pagina no servidor', async () => {
      const luva = await criarProduto('Luva');
      const gaze = await criarProduto('Gaze');
      await criarLote(luva.id, 'L-2', 20, { quantidade: 5 });
      await criarLote(gaze.id, 'L-1', 90, { quantidade: 50 });
      await criarLote(luva.id, 'L-3', -5, { quantidade: 1 });

      const numeros = async (sort: string, extra: Record<string, string> = {}) =>
        lotePageSchema
          .parse(
            (
              await http()
                .get(BASE)
                .query({ sort, ...extra })
                .expect(200)
            ).body,
          )
          .data.map((l) => l.numero);
      expect(await numeros('produto:asc')).toEqual(['L-1', 'L-3', 'L-2']);
      expect(await numeros('lote:desc')).toEqual(['L-3', 'L-2', 'L-1']);
      expect(await numeros('quantidade:desc')).toEqual(['L-1', 'L-2', 'L-3']);
      expect(await numeros('vencimento:desc')).toEqual(['L-1', 'L-2', 'L-3']);
      expect(await numeros('status:asc')).toEqual(['L-3', 'L-2', 'L-1']);
      expect(await numeros('vencimento:asc', { page: '2', pageSize: '2' })).toEqual(['L-1']);
    });

    it('400 para filtro ou ordenação fora da whitelist', async () => {
      await http().get(BASE).query({ sort: 'createdAt:asc' }).expect(400);
      await http().get(BASE).query({ produtoId: 'x' }).expect(400);
      await http().get(BASE).query({ comSaldo: 'sim' }).expect(400);
    });
  });

  describe('GET /resumo (cards)', () => {
    it('conta lotes vencidos, vencendo em 60 dias e produtos abaixo do mínimo', async () => {
      const luva = await criarProduto('Luva', { atual: 1, minimo: 5 });
      await criarProduto('Gaze', { atual: 10, minimo: 5 });
      await criarLote(luva.id, 'V1', -10);
      await criarLote(luva.id, 'V2', -1);
      await criarLote(luva.id, 'H', 0);
      await criarLote(luva.id, 'S60', 60);
      await criarLote(luva.id, 'S61', 61);
      await criarLote(luva.id, 'X', -3, { deletedAt: new Date() });

      const resumo = resumoLotesSchema.parse((await http().get(`${BASE}/resumo`).expect(200)).body);
      expect(resumo).toEqual({ vencidos: 2, vencendo: 2, abaixoMinimo: 1 });
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
      const luva = await criarProduto('Luva');
      await criarLote(luva.id, 'L-B', 100, { quantidade: 3 });
      await criarLote(luva.id, 'L-A', -2, { quantidade: 4 });
      await criarLote(luva.id, 'L-ZERO', 5, { quantidade: 0 });

      const res = await binary(
        http().get(`${BASE}/export`).query({
          format: 'xlsx',
          comSaldo: 'true',
          sort: 'lote:asc',
          columns: 'produto,lote,quantidade,status',
        }),
      ).expect(200);

      const workbook = new Workbook();
      await workbook.xlsx.load(res.body as unknown as ArrayBuffer);
      const rows: unknown[][] = [];
      workbook.worksheets[0]?.eachRow((row) => rows.push((row.values as unknown[]).slice(1)));
      expect(rows).toEqual([
        ['Produto', 'Lote', 'Quantidade', 'Status'],
        ['Luva', 'L-A', 4, 'Vencido'],
        ['Luva', 'L-B', 3, 'Válido'],
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
        .query({ format: 'xlsx', columns: 'id' })
        .expect(400);
      expect(res.body.details[0].field).toBe('columns');
      await expectNoAudit(prisma, { entity: ENTITY, action: 'EXPORT' });
    });
  });

  describe('acesso', () => {
    const ROTAS = [
      { metodo: 'get', caminho: BASE, permissao: 'ver' },
      { metodo: 'get', caminho: `${BASE}/resumo`, permissao: 'ver' },
      { metodo: 'get', caminho: `${BASE}/export?format=xlsx`, permissao: 'exportar' },
      { metodo: 'post', caminho: BASE, permissao: 'criar' },
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
