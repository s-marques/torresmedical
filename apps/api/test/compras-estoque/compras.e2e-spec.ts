import type { INestApplication } from '@nestjs/common';
import { compraPageSchema, compraSchema, compraXmlPreviaSchema } from '@torres/shared';
import { Workbook } from 'exceljs';
import request from 'supertest';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { comUsuario, criarUsuarioTeste, type UsuarioTeste } from '../utils/auth';
import { createE2eApp } from '../utils/create-e2e-app';
import { truncateAll } from '../utils/database';
import { expectAudit, expectNoAudit } from '../utils/expect-audit';

const BASE = '/api/compras-estoque/compras';
const ENTITY = 'Compra';
const PERMISSOES = [
  'compras-estoque.entrada-compras.ver',
  'compras-estoque.entrada-compras.criar',
  'compras-estoque.entrada-compras.editar',
  'compras-estoque.entrada-compras.excluir',
  'compras-estoque.entrada-compras.exportar',
] as const;
const INEXISTENTE = '00000000-0000-4000-8000-000000000000';

const XML = `<?xml version="1.0"?><nfeProc xmlns="http://www.portalfiscal.inf.br/nfe"><NFe><infNFe>
<ide><serie>1</serie><nNF>55252</nNF><dhEmi>2026-11-04T10:00:00-04:00</dhEmi></ide>
<emit><CNPJ>12345678000190</CNPJ><xNome>Fornecedor Teste</xNome></emit>
<det nItem="1"><prod><cProd>SKU-1</cProd><cEAN>SEM GTIN</cEAN><xProd>Cadeira</xProd><qCom>1.0000</qCom><vUnCom>892.51</vUnCom></prod></det>
<det nItem="2"><prod><cProd>SKU-X</cProd><cEAN>SEM GTIN</cEAN><xProd>Sem cadastro</xProd><qCom>2.0000</qCom><vUnCom>10.00</vUnCom></prod></det>
<total><ICMSTot><vFrete>0.00</vFrete><vDesc>0.00</vDesc></ICMSTot></total></infNFe></NFe></nfeProc>`;

describe('Entrada de Compras (e2e)', () => {
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

  const criarFornecedor = (nome = 'Distribuidora Alfa', documento?: string) =>
    prisma.fornecedor.create({ data: { nome, documento } });

  const criarProduto = (nome = 'Cadeira', extra: { sku?: string; controla?: boolean } = {}) =>
    prisma.produto.create({
      data: {
        nome,
        tipo: 'PRODUTO',
        sku: extra.sku,
        controlaEstoque: extra.controla ?? true,
      },
    });

  const estoque = async (id: string) =>
    Number((await prisma.produto.findUniqueOrThrow({ where: { id } })).estoqueAtual);

  async function corpo(extra: Record<string, unknown> = {}) {
    const fornecedor = await criarFornecedor();
    const produto = await criarProduto();
    return {
      fornecedor,
      produto,
      body: {
        fornecedorId: fornecedor.id,
        numeroNf: '55252',
        serieNf: '1',
        dataEmissao: '2026-11-04',
        dataEntrada: '2026-11-05',
        frete: 10,
        desconto: 5,
        itens: [
          { produtoId: produto.id, descricao: 'Cadeira Goah', quantidade: 2, valorUnitario: 100 },
        ],
        ...extra,
      },
    };
  }

  async function registrar() {
    const { body, produto, fornecedor } = await corpo();
    const res = await http().post(BASE).send(body).expect(201);
    return { compra: res.body as { id: string }, produto, fornecedor, body };
  }

  describe('POST (Nova Compra)', () => {
    it('201: grava a compra Recebida, calcula o total, dá entrada no estoque e audita CREATE', async () => {
      const { body, produto } = await corpo();
      const res = await http().post(BASE).send(body).expect(201);
      expect(compraSchema.parse(res.body)).toMatchObject({
        status: 'RECEBIDA',
        valorTotal: '205',
        fornecedorNome: 'Distribuidora Alfa',
        itens: [{ descricao: 'Cadeira Goah', quantidade: '2', valorTotal: '200' }],
      });
      expect(await estoque(produto.id)).toBe(2);
      await expectAudit(prisma, {
        action: 'CREATE',
        entity: ENTITY,
        entityId: res.body.id,
        before: null,
        after: { numeroNf: '55252', status: 'RECEBIDA' },
        userId: usuario.id,
      });
    });

    it('não mexe no estoque de produto que não controla estoque', async () => {
      const fornecedor = await criarFornecedor();
      const produto = await criarProduto('Serviço', { controla: false });
      await http()
        .post(BASE)
        .send({
          fornecedorId: fornecedor.id,
          dataEntrada: '2026-11-05',
          itens: [{ produtoId: produto.id, descricao: 'X', quantidade: 3, valorUnitario: 1 }],
        })
        .expect(201);
      expect(await estoque(produto.id)).toBe(0);
    });

    it('400: fornecedor e produto são obrigatórios, sem auditar', async () => {
      const res = await http().post(BASE).send({ dataEntrada: '2026-11-05' }).expect(400);
      expect(res.body.details).toEqual(
        expect.arrayContaining([
          { field: 'fornecedorId', message: 'Fornecedor é obrigatório.' },
          { field: 'itens', message: 'Adicione pelo menos um produto.' },
        ]),
      );
      await expectNoAudit(prisma, { entity: ENTITY });
    });

    it('400 com item sem produto', async () => {
      const { body } = await corpo({
        itens: [{ descricao: 'Cadeira', quantidade: 1, valorUnitario: 10 }],
      });
      const res = await http().post(BASE).send(body).expect(400);
      expect(res.body.details).toEqual(
        expect.arrayContaining([{ field: 'itens.0.produtoId', message: 'Produto é obrigatório.' }]),
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
    });

    it('403 sem a permissão de criar', async () => {
      const sem = await criarUsuarioTeste(app, {
        permissoes: ['compras-estoque.entrada-compras.ver'],
      });
      await comUsuario(app, sem).post(BASE).send({}).expect(403);
    });
  });

  describe('GET (listagem) e GET /:id', () => {
    it('lista sem excluídas; filtra por status e busca por NF ou fornecedor', async () => {
      const { compra } = await registrar();
      await http().post(`${BASE}/${compra.id}/cancelar`).expect(200);
      await registrar();

      const todas = await http().get(BASE).expect(200);
      expect(compraPageSchema.parse(todas.body).meta.total).toBe(2);

      const recebidas = await http().get(BASE).query({ status: 'RECEBIDA' }).expect(200);
      expect(recebidas.body.data).toHaveLength(1);
      const canceladas = await http().get(BASE).query({ status: 'CANCELADA' }).expect(200);
      expect(canceladas.body.data).toHaveLength(1);

      expect(
        (await http().get(BASE).query({ search: '55252' }).expect(200)).body.data,
      ).toHaveLength(2);
      expect((await http().get(BASE).query({ search: 'alfa' }).expect(200)).body.data).toHaveLength(
        2,
      );
      expect((await http().get(BASE).query({ search: 'zzz' }).expect(200)).body.data).toHaveLength(
        0,
      );
      await http().get(BASE).query({ sort: 'fornecedor:asc' }).expect(200);
      await http().get(BASE).query({ status: 'x' }).expect(400);
    });

    it('detalhe 200; 404 para inexistente', async () => {
      const { compra } = await registrar();
      const ok = await http().get(`${BASE}/${compra.id}`).expect(200);
      expect(compraSchema.parse(ok.body).itens).toHaveLength(1);
      await http().get(`${BASE}/${INEXISTENTE}`).expect(404);
    });

    it('403 sem a permissão de ver', async () => {
      const sem = await criarUsuarioTeste(app, { permissoes: [] });
      await comUsuario(app, sem).get(BASE).expect(403);
    });
  });

  describe('PATCH /:id', () => {
    it('refaz a entrada no estoque e audita UPDATE com before/after', async () => {
      const { compra, produto, body } = await registrar();
      expect(await estoque(produto.id)).toBe(2);
      const res = await http()
        .patch(`${BASE}/${compra.id}`)
        .send({
          ...body,
          numeroNf: '999',
          itens: [
            { produtoId: produto.id, descricao: 'Cadeira', quantidade: 5, valorUnitario: 10 },
          ],
        })
        .expect(200);
      expect(res.body).toMatchObject({ numeroNf: '999', valorTotal: '55' });
      expect(await estoque(produto.id)).toBe(5);
      await expectAudit(prisma, {
        action: 'UPDATE',
        entity: ENTITY,
        entityId: compra.id,
        before: { numeroNf: '55252' },
        after: { numeroNf: '999' },
        userId: usuario.id,
      });
    });

    it('422 em compra cancelada; 404 para inexistente', async () => {
      const { compra, body } = await registrar();
      await http().post(`${BASE}/${compra.id}/cancelar`).expect(200);
      await http().patch(`${BASE}/${compra.id}`).send(body).expect(422);
      await http().patch(`${BASE}/${INEXISTENTE}`).send(body).expect(404);
    });
  });

  describe('POST /:id/cancelar', () => {
    it('devolve a entrada do estoque e audita UPDATE; 422 ao cancelar de novo', async () => {
      const { compra, produto } = await registrar();
      const res = await http().post(`${BASE}/${compra.id}/cancelar`).expect(200);
      expect(res.body.status).toBe('CANCELADA');
      expect(await estoque(produto.id)).toBe(0);
      await expectAudit(prisma, {
        action: 'UPDATE',
        entity: ENTITY,
        entityId: compra.id,
        before: { status: 'RECEBIDA' },
        after: { status: 'CANCELADA' },
        userId: usuario.id,
      });
      await http().post(`${BASE}/${compra.id}/cancelar`).expect(422);
    });
  });

  describe('DELETE /:id', () => {
    it('exclusão lógica, devolve o estoque e audita DELETE', async () => {
      const { compra, produto } = await registrar();
      await http().delete(`${BASE}/${compra.id}`).expect(200);
      const banco = await prisma.compra.findUniqueOrThrow({ where: { id: compra.id } });
      expect(banco.deletedAt).not.toBeNull();
      expect(await estoque(produto.id)).toBe(0);
      await http().get(`${BASE}/${compra.id}`).expect(404);
      await expectAudit(prisma, {
        action: 'DELETE',
        entity: ENTITY,
        entityId: compra.id,
        before: { numeroNf: '55252' },
        after: null,
        userId: usuario.id,
      });
    });

    it('404 para inexistente', async () => {
      await http().delete(`${BASE}/${INEXISTENTE}`).expect(404);
    });
  });

  describe('POST /importar-xml', () => {
    it('devolve a prévia, casando fornecedor por CNPJ e produto por SKU; não grava', async () => {
      const fornecedor = await criarFornecedor('Fornecedor Teste', '12345678000190');
      const produto = await criarProduto('Cadeira', { sku: 'SKU-1' });
      const res = await http().post(`${BASE}/importar-xml`).send({ xml: XML }).expect(200);
      const previa = compraXmlPreviaSchema.parse(res.body);
      expect(previa).toMatchObject({
        numeroNf: '55252',
        serieNf: '1',
        dataEmissao: '2026-11-04',
        fornecedorId: fornecedor.id,
      });
      expect(previa.itens.map((i) => i.produtoId)).toEqual([produto.id, null]);
      expect(await prisma.compra.count()).toBe(0);
    });

    it('422 para arquivo que não é NF-e; 400 sem xml', async () => {
      await http().post(`${BASE}/importar-xml`).send({ xml: '<a/>' }).expect(422);
      await http().post(`${BASE}/importar-xml`).send({}).expect(400);
    });
  });

  describe('GET /export (Excel/PDF)', () => {
    it('xlsx com as compras e audita EXPORT', async () => {
      await registrar();
      const res = await http()
        .get(`${BASE}/export`)
        .query({ format: 'xlsx' })
        .buffer(true)
        .parse(binario)
        .expect(200);
      const wb = new Workbook();
      await wb.xlsx.load(res.body);
      expect(JSON.stringify(wb.worksheets[0]?.getSheetValues() ?? [])).toContain('55252');
      const auditoria = await prisma.auditLog.findMany({
        where: { entity: ENTITY, action: 'EXPORT' },
      });
      expect(auditoria).toHaveLength(1);
    });

    it('400 sem formato', async () => {
      await http().get(`${BASE}/export`).expect(400);
    });
  });
});

function binario(res: request.Response, cb: (err: Error | null, body: Buffer) => void) {
  const chunks: Buffer[] = [];
  res.on('data', (c: Buffer) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
}
