import type { INestApplication } from '@nestjs/common';
import { pedidoCompraPageSchema, pedidoCompraSchema } from '@torres/shared';
import { Workbook } from 'exceljs';
import request from 'supertest';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { comUsuario, criarUsuarioTeste, type UsuarioTeste } from '../utils/auth';
import { createE2eApp } from '../utils/create-e2e-app';
import { truncateAll } from '../utils/database';
import { expectAudit, expectNoAudit } from '../utils/expect-audit';

const BASE = '/api/compras-estoque/pedidos-compra';
const ENTITY = 'PedidoCompra';
const PERMISSOES = [
  'compras-estoque.pedidos-transito.ver',
  'compras-estoque.pedidos-transito.criar',
  'compras-estoque.pedidos-transito.editar',
  'compras-estoque.pedidos-transito.excluir',
  'compras-estoque.pedidos-transito.exportar',
] as const;
const INEXISTENTE = '00000000-0000-4000-8000-000000000000';

describe('Pedidos em Trânsito (e2e)', () => {
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

  const estoque = async (id: string) =>
    Number((await prisma.produto.findUniqueOrThrow({ where: { id } })).estoqueAtual);

  async function corpo(extra: Record<string, unknown> = {}) {
    const fornecedor = await prisma.fornecedor.create({ data: { nome: 'Distribuidora Alfa' } });
    const produto = await prisma.produto.create({
      data: { nome: 'Luva', tipo: 'PRODUTO', controlaEstoque: true },
    });
    return {
      fornecedor,
      produto,
      body: {
        fornecedorId: fornecedor.id,
        numeroNf: '4321',
        dataPedido: '2026-11-18',
        dataPrevisao: '2026-11-30',
        observacoes: 'Entrega no térreo',
        itens: [{ produtoId: produto.id, quantidade: 3, valorUnitario: 12.5 }],
        ...extra,
      },
    };
  }

  async function criar(extra: Record<string, unknown> = {}) {
    const { body, produto, fornecedor } = await corpo(extra);
    const res = await http().post(BASE).send(body).expect(201);
    return { pedido: res.body as { id: string }, produto, fornecedor, body };
  }

  describe('POST (Novo Pedido)', () => {
    it('201: nasce Em Transito, soma os itens ("Auto") e audita CREATE', async () => {
      const { body, produto } = await corpo();
      const res = await http().post(BASE).send(body).expect(201);
      expect(pedidoCompraSchema.parse(res.body)).toMatchObject({
        status: 'EM_TRANSITO',
        valorTotal: '37.5',
        valorTotalInformado: false,
        qtdItens: 1,
        fornecedorNome: 'Distribuidora Alfa',
        dataPrevisao: '2026-11-30',
        itens: [{ produtoNome: 'Luva', quantidade: '3', valorTotal: '37.5' }],
      });
      // Pedido não movimenta o estoque.
      expect(await estoque(produto.id)).toBe(0);
      await expectAudit(prisma, {
        action: 'CREATE',
        entity: ENTITY,
        entityId: res.body.id,
        before: null,
        after: { numeroNf: '4321', status: 'EM_TRANSITO' },
        userId: usuario.id,
      });
    });

    it('201 sem itens, com Valor Total digitado e data do pedido de hoje quando vazia', async () => {
      const { body } = await corpo({ itens: [], valorTotal: 980.4, dataPedido: null });
      const res = await http().post(BASE).send(body).expect(201);
      expect(res.body).toMatchObject({
        valorTotal: '980.4',
        valorTotalInformado: true,
        qtdItens: 0,
        dataPedido: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      });
    });

    it('400: fornecedor é obrigatório, sem auditar', async () => {
      const res = await http().post(BASE).send({}).expect(400);
      expect(res.body.details).toEqual([
        { field: 'fornecedorId', message: 'Fornecedor é obrigatório.' },
      ]);
      await expectNoAudit(prisma, { entity: ENTITY });
    });

    it('400 com item sem produto ou quantidade zero', async () => {
      const { body } = await corpo({ itens: [{ produtoId: '', quantidade: 0, valorUnitario: 1 }] });
      const res = await http().post(BASE).send(body).expect(400);
      expect(res.body.details).toEqual(
        expect.arrayContaining([
          { field: 'itens.0.produtoId', message: 'Produto é obrigatório.' },
          { field: 'itens.0.quantidade', message: 'A quantidade deve ser maior que zero' },
        ]),
      );
    });

    it('404 com fornecedor ou produto inexistente', async () => {
      const { body } = await corpo();
      await http()
        .post(BASE)
        .send({ ...body, fornecedorId: INEXISTENTE })
        .expect(404);
      await http()
        .post(BASE)
        .send({ ...body, itens: [{ ...body.itens[0], produtoId: INEXISTENTE }] })
        .expect(404);
      await expectNoAudit(prisma, { entity: ENTITY });
    });

    it('403 sem a permissão de criar', async () => {
      const sem = await criarUsuarioTeste(app, {
        permissoes: ['compras-estoque.pedidos-transito.ver'],
      });
      await comUsuario(app, sem).post(BASE).send({}).expect(403);
    });
  });

  describe('GET (listagem) e GET /:id', () => {
    it('lista sem excluídos; filtra por status, busca por NF ou fornecedor e ordena', async () => {
      const { pedido } = await criar();
      await http().post(`${BASE}/${pedido.id}/receber`).expect(200);
      const outro = await criar({ numeroNf: '9999', itens: [] });
      const excluido = await criar();
      await http().delete(`${BASE}/${excluido.pedido.id}`).expect(200);

      const todos = await http().get(BASE).expect(200);
      expect(pedidoCompraPageSchema.parse(todos.body).meta.total).toBe(2);

      const transito = await http().get(BASE).query({ status: 'EM_TRANSITO' }).expect(200);
      expect(transito.body.data.map((p: { id: string }) => p.id)).toEqual([outro.pedido.id]);
      const recebidos = await http().get(BASE).query({ status: 'RECEBIDO' }).expect(200);
      expect(recebidos.body.data).toHaveLength(1);

      expect((await http().get(BASE).query({ search: '9999' }).expect(200)).body.data).toHaveLength(
        1,
      );
      expect((await http().get(BASE).query({ search: 'alfa' }).expect(200)).body.data).toHaveLength(
        2,
      );

      const porItens = await http().get(BASE).query({ sort: 'qtdItens:asc' }).expect(200);
      expect(porItens.body.data.map((p: { qtdItens: number }) => p.qtdItens)).toEqual([0, 1]);
      for (const sort of ['numeroNf', 'fornecedor', 'dataPrevisao', 'valorTotal', 'status']) {
        await http()
          .get(BASE)
          .query({ sort: `${sort}:desc` })
          .expect(200);
      }
      await http().get(BASE).query({ status: 'x' }).expect(400);
    });

    it('detalhe 200; 404 para inexistente', async () => {
      const { pedido } = await criar();
      const ok = await http().get(`${BASE}/${pedido.id}`).expect(200);
      expect(pedidoCompraSchema.parse(ok.body).itens).toHaveLength(1);
      await http().get(`${BASE}/${INEXISTENTE}`).expect(404);
    });

    it('403 sem a permissão de ver', async () => {
      const sem = await criarUsuarioTeste(app, { permissoes: [] });
      await comUsuario(app, sem).get(BASE).expect(403);
    });
  });

  describe('PATCH /:id', () => {
    it('altera e troca os itens; audita UPDATE com before/after', async () => {
      const { pedido, produto, body } = await criar();
      const res = await http()
        .patch(`${BASE}/${pedido.id}`)
        .send({
          ...body,
          numeroNf: '5555',
          valorTotal: null,
          itens: [{ produtoId: produto.id, quantidade: 2, valorUnitario: 4 }],
        })
        .expect(200);
      expect(res.body).toMatchObject({ numeroNf: '5555', valorTotal: '8', qtdItens: 1 });
      await expectAudit(prisma, {
        action: 'UPDATE',
        entity: ENTITY,
        entityId: pedido.id,
        before: { numeroNf: '4321' },
        after: { numeroNf: '5555' },
        userId: usuario.id,
      });
    });

    it('422 em pedido recebido; 400 inválido; 404 inexistente; 403 sem editar', async () => {
      const { pedido, body } = await criar();
      await http().patch(`${BASE}/${pedido.id}`).send({}).expect(400);
      await http().patch(`${BASE}/${INEXISTENTE}`).send(body).expect(404);
      const sem = await criarUsuarioTeste(app, {
        permissoes: ['compras-estoque.pedidos-transito.ver'],
      });
      await comUsuario(app, sem).patch(`${BASE}/${pedido.id}`).send(body).expect(403);
      await http().post(`${BASE}/${pedido.id}/receber`).expect(200);
      const res = await http().patch(`${BASE}/${pedido.id}`).send(body).expect(422);
      expect(res.body.message).toBe('Não é possível editar um pedido recebido.');
    });
  });

  describe('POST /:id/receber e /:id/cancelar', () => {
    it('receber: status Recebido sem mexer no estoque; audita UPDATE; 422 de novo', async () => {
      const { pedido, produto } = await criar();
      const res = await http().post(`${BASE}/${pedido.id}/receber`).expect(200);
      expect(res.body.status).toBe('RECEBIDO');
      expect(await estoque(produto.id)).toBe(0);
      await expectAudit(prisma, {
        action: 'UPDATE',
        entity: ENTITY,
        entityId: pedido.id,
        before: { status: 'EM_TRANSITO' },
        after: { status: 'RECEBIDO' },
        userId: usuario.id,
      });
      await http().post(`${BASE}/${pedido.id}/receber`).expect(422);
      await http().post(`${BASE}/${pedido.id}/cancelar`).expect(422);
    });

    it('cancelar: status Cancelado e audita UPDATE; 404 inexistente', async () => {
      const { pedido } = await criar();
      const res = await http().post(`${BASE}/${pedido.id}/cancelar`).expect(200);
      expect(res.body.status).toBe('CANCELADO');
      await expectAudit(prisma, {
        action: 'UPDATE',
        entity: ENTITY,
        entityId: pedido.id,
        before: { status: 'EM_TRANSITO' },
        after: { status: 'CANCELADO' },
        userId: usuario.id,
      });
      await http().post(`${BASE}/${INEXISTENTE}/cancelar`).expect(404);
    });
  });

  describe('DELETE /:id', () => {
    it('exclusão lógica e audita DELETE', async () => {
      const { pedido } = await criar();
      await http().delete(`${BASE}/${pedido.id}`).expect(200);
      const banco = await prisma.pedidoCompra.findUniqueOrThrow({ where: { id: pedido.id } });
      expect(banco.deletedAt).not.toBeNull();
      await http().get(`${BASE}/${pedido.id}`).expect(404);
      await expectAudit(prisma, {
        action: 'DELETE',
        entity: ENTITY,
        entityId: pedido.id,
        before: { numeroNf: '4321' },
        after: null,
        userId: usuario.id,
      });
    });

    it('404 para inexistente; 403 sem excluir', async () => {
      await http().delete(`${BASE}/${INEXISTENTE}`).expect(404);
      const { pedido } = await criar();
      const sem = await criarUsuarioTeste(app, {
        permissoes: ['compras-estoque.pedidos-transito.ver'],
      });
      await comUsuario(app, sem).delete(`${BASE}/${pedido.id}`).expect(403);
    });
  });

  describe('GET /export (Excel/PDF)', () => {
    it('xlsx com os pedidos e audita EXPORT', async () => {
      await criar();
      const res = await http()
        .get(`${BASE}/export`)
        .query({ format: 'xlsx' })
        .buffer(true)
        .parse(binario)
        .expect(200);
      const wb = new Workbook();
      await wb.xlsx.load(res.body);
      const conteudo = JSON.stringify(wb.worksheets[0]?.getSheetValues() ?? []);
      expect(conteudo).toContain('4321');
      expect(conteudo).toContain('Em Transito');
      const auditoria = await prisma.auditLog.findMany({
        where: { entity: ENTITY, action: 'EXPORT' },
      });
      expect(auditoria).toHaveLength(1);
    });

    it('400 sem formato; 403 sem exportar', async () => {
      await http().get(`${BASE}/export`).expect(400);
      const sem = await criarUsuarioTeste(app, {
        permissoes: ['compras-estoque.pedidos-transito.ver'],
      });
      await comUsuario(app, sem).get(`${BASE}/export`).query({ format: 'xlsx' }).expect(403);
    });
  });
});

function binario(res: request.Response, cb: (err: Error | null, body: Buffer) => void) {
  const chunks: Buffer[] = [];
  res.on('data', (c: Buffer) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
}
