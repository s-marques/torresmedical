import type { INestApplication } from '@nestjs/common';
import {
  alertasEstoqueSchema,
  movimentacaoEstoquePageSchema,
  movimentacaoEstoqueSchema,
  posicaoEstoquePageSchema,
  resumoEstoqueSchema,
  somarDias,
  sugestaoCompraPageSchema,
} from '@torres/shared';
import { Workbook } from 'exceljs';
import request from 'supertest';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { hojeNaClinica } from '../../src/modules/compras-estoque/estoque/estoque-filtros';
import { comUsuario, criarUsuarioTeste, type UsuarioTeste } from '../utils/auth';
import { createE2eApp } from '../utils/create-e2e-app';
import { truncateAll } from '../utils/database';
import { expectAudit, expectNoAudit } from '../utils/expect-audit';

const BASE = '/api/compras-estoque/estoque';
const ENTITY = 'MovimentacaoEstoque';
const PERMISSOES = [
  'compras-estoque.estoque.ver',
  'compras-estoque.estoque.criar',
  'compras-estoque.estoque.editar',
  'compras-estoque.estoque.exportar',
  // Integração: registrar e cancelar compras.
  'compras-estoque.entrada-compras.criar',
  'compras-estoque.entrada-compras.editar',
] as const;
const INEXISTENTE = '00000000-0000-4000-8000-000000000000';

interface OpcoesProduto {
  sku?: string;
  controla?: boolean;
  atual?: number;
  minimo?: number;
  custo?: number;
  categoriaId?: string;
  tipo?: 'PRODUTO' | 'SERVICO';
}

describe('Estoque (e2e)', () => {
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
  const semPermissao = async (...permissoes: (typeof PERMISSOES)[number][]) =>
    comUsuario(app, await criarUsuarioTeste(app, { permissoes }));

  const criarProduto = (nome: string, o: OpcoesProduto = {}) =>
    prisma.produto.create({
      data: {
        nome,
        tipo: o.tipo ?? 'PRODUTO',
        sku: o.sku,
        controlaEstoque: o.controla ?? true,
        estoqueAtual: o.atual ?? 0,
        estoqueMinimo: o.minimo ?? 0,
        precoCusto: o.custo,
        categoriaId: o.categoriaId,
      },
    });

  const saldo = async (id: string) =>
    Number((await prisma.produto.findUniqueOrThrow({ where: { id } })).estoqueAtual);

  describe('POST /entradas (Entrada Manual)', () => {
    it('201: soma no saldo, grava a movimentação com responsável e audita CREATE', async () => {
      const produto = await criarProduto('Luva', { sku: 'LUV-1', atual: 3 });
      const fornecedor = await prisma.fornecedor.create({ data: { nome: 'Distribuidora Alfa' } });
      const res = await http()
        .post(`${BASE}/entradas`)
        .send({
          produtoId: produto.id,
          quantidade: 5,
          custoUnitario: 2.5,
          motivo: 'DOACAO',
          lote: 'L-01',
          validade: '2027-01-31',
          documento: 'NF 10',
          fornecedorId: fornecedor.id,
        })
        .expect(201);
      expect(movimentacaoEstoqueSchema.parse(res.body)).toMatchObject({
        tipo: 'ENTRADA',
        produtoNome: 'Luva',
        produtoSku: 'LUV-1',
        quantidade: '5',
        saldoAnterior: '3',
        saldoPosterior: '8',
        motivo: 'Doação',
        custoUnitario: '2.5',
        lote: 'L-01',
        validade: '2027-01-31',
        fornecedorNome: 'Distribuidora Alfa',
        usuarioId: usuario.id,
      });
      expect(await saldo(produto.id)).toBe(8);
      await expectAudit(prisma, {
        action: 'CREATE',
        entity: ENTITY,
        entityId: res.body.id,
        before: null,
        after: { tipo: 'ENTRADA', quantidade: '5', produtoId: produto.id },
        userId: usuario.id,
      });
    });

    it('400: produto, quantidade e motivo obrigatórios, sem auditar', async () => {
      const res = await http().post(`${BASE}/entradas`).send({}).expect(400);
      expect(res.body.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'produtoId', message: 'Produto é obrigatório.' }),
          expect.objectContaining({ field: 'quantidade', message: 'Quantidade é obrigatória.' }),
          expect.objectContaining({ field: 'motivo', message: 'Motivo é obrigatório.' }),
        ]),
      );
      await expectNoAudit(prisma, { entity: ENTITY });
    });

    it('400 para produto sem controle de estoque; 404 para produto ou fornecedor inexistente', async () => {
      const sem = await criarProduto('Brinde', { controla: false });
      const r = await http()
        .post(`${BASE}/entradas`)
        .send({ produtoId: sem.id, quantidade: 1, motivo: 'COMPRA' })
        .expect(400);
      expect(r.body).toMatchObject({ code: 'ESTOQUE_NAO_CONTROLADO' });

      await http()
        .post(`${BASE}/entradas`)
        .send({ produtoId: INEXISTENTE, quantidade: 1, motivo: 'COMPRA' })
        .expect(404);
      const produto = await criarProduto('Luva');
      await http()
        .post(`${BASE}/entradas`)
        .send({ produtoId: produto.id, quantidade: 1, motivo: 'COMPRA', fornecedorId: INEXISTENTE })
        .expect(404);
      expect(await saldo(produto.id)).toBe(0);
      await expectNoAudit(prisma, { entity: ENTITY });
    });

    it('serviço não entra no estoque (404)', async () => {
      const servico = await criarProduto('Consulta', { tipo: 'SERVICO' });
      await http()
        .post(`${BASE}/entradas`)
        .send({ produtoId: servico.id, quantidade: 1, motivo: 'COMPRA' })
        .expect(404);
    });

    it('403 sem a permissão de criar', async () => {
      await (
        await semPermissao('compras-estoque.estoque.ver')
      )
        .post(`${BASE}/entradas`)
        .send({})
        .expect(403);
    });
  });

  describe('POST /saidas (Saída Manual)', () => {
    it('201: subtrai do saldo e audita CREATE', async () => {
      const produto = await criarProduto('Luva', { atual: 10 });
      const res = await http()
        .post(`${BASE}/saidas`)
        .send({ produtoId: produto.id, quantidade: 4, motivo: 'USO_INTERNO', documento: 'Sala 3' })
        .expect(201);
      expect(res.body).toMatchObject({
        tipo: 'SAIDA',
        quantidade: '4',
        saldoAnterior: '10',
        saldoPosterior: '6',
        motivo: 'Uso Interno',
        documento: 'Sala 3',
      });
      expect(await saldo(produto.id)).toBe(6);
      await expectAudit(prisma, {
        action: 'CREATE',
        entity: ENTITY,
        entityId: res.body.id,
        before: null,
        after: { tipo: 'SAIDA', quantidade: '4' },
        userId: usuario.id,
      });
    });

    it('400 ESTOQUE_INSUFICIENTE sem mexer no saldo nem auditar', async () => {
      const produto = await criarProduto('Luva', { atual: 2 });
      const res = await http()
        .post(`${BASE}/saidas`)
        .send({ produtoId: produto.id, quantidade: 3, motivo: 'PERDA_AVARIA' })
        .expect(400);
      expect(res.body).toMatchObject({
        code: 'ESTOQUE_INSUFICIENTE',
        message: 'Estoque insuficiente. Saldo atual: 2.',
        details: [
          expect.objectContaining({
            field: 'quantidade',
            message: 'Estoque insuficiente. Saldo atual: 2.',
          }),
        ],
      });
      expect(await saldo(produto.id)).toBe(2);
      await expectNoAudit(prisma, { entity: ENTITY });
    });

    it('400 com motivo de entrada; 404 com produto inexistente', async () => {
      const produto = await criarProduto('Luva', { atual: 2 });
      await http()
        .post(`${BASE}/saidas`)
        .send({ produtoId: produto.id, quantidade: 1, motivo: 'COMPRA' })
        .expect(400);
      await http()
        .post(`${BASE}/saidas`)
        .send({ produtoId: INEXISTENTE, quantidade: 1, motivo: 'USO_INTERNO' })
        .expect(404);
    });

    it('403 sem a permissão de criar', async () => {
      await (
        await semPermissao('compras-estoque.estoque.ver')
      )
        .post(`${BASE}/saidas`)
        .send({})
        .expect(403);
    });
  });

  describe('POST /ajustes (Ajuste Individual)', () => {
    it('201: o saldo vira a quantidade real e audita CREATE', async () => {
      const produto = await criarProduto('Luva', { atual: 10 });
      const res = await http()
        .post(`${BASE}/ajustes`)
        .send({ produtoId: produto.id, quantidadeReal: 7, motivo: 'Contagem de inventário' })
        .expect(201);
      expect(res.body).toMatchObject({
        tipo: 'AJUSTE',
        quantidade: '3',
        saldoAnterior: '10',
        saldoPosterior: '7',
        motivo: 'Contagem de inventário',
      });
      expect(await saldo(produto.id)).toBe(7);
      await expectAudit(prisma, {
        action: 'CREATE',
        entity: ENTITY,
        entityId: res.body.id,
        before: null,
        after: { tipo: 'AJUSTE', saldoPosterior: '7' },
        userId: usuario.id,
      });
    });

    it('400 quando a quantidade real é igual ao saldo ou falta o motivo', async () => {
      const produto = await criarProduto('Luva', { atual: 5 });
      const igual = await http()
        .post(`${BASE}/ajustes`)
        .send({ produtoId: produto.id, quantidadeReal: 5, motivo: 'x' })
        .expect(400);
      expect(igual.body.code).toBe('AJUSTE_SEM_DIFERENCA');
      const semMotivo = await http()
        .post(`${BASE}/ajustes`)
        .send({ produtoId: produto.id, quantidadeReal: 1, motivo: '' })
        .expect(400);
      expect(semMotivo.body.details).toEqual([
        expect.objectContaining({ field: 'motivo', message: 'Motivo é obrigatório.' }),
      ]);
      await expectNoAudit(prisma, { entity: ENTITY });
    });

    it('404 com produto inexistente', async () => {
      await http()
        .post(`${BASE}/ajustes`)
        .send({ produtoId: INEXISTENTE, quantidadeReal: 1, motivo: 'x' })
        .expect(404);
    });

    it('403 sem a permissão de editar', async () => {
      await (
        await semPermissao('compras-estoque.estoque.ver', 'compras-estoque.estoque.criar')
      )
        .post(`${BASE}/ajustes`)
        .send({})
        .expect(403);
    });
  });

  describe('GET /posicao', () => {
    it('lista produtos com status, valor e último movimento; filtra por status, categoria e busca', async () => {
      const categoria = await prisma.categoria.create({
        data: { nome: 'Limpeza', tipo: 'PRODUTO' },
      });
      const ok = await criarProduto('Alcool', { sku: 'ALC', atual: 10, minimo: 2, custo: 3 });
      await criarProduto('Detergente', { atual: 2, minimo: 5, categoriaId: categoria.id });
      await criarProduto('Esponja', { atual: 0 });
      await criarProduto('Brinde', { controla: false, atual: 4 });
      await criarProduto('Consulta', { tipo: 'SERVICO' });
      await http()
        .post(`${BASE}/saidas`)
        .send({ produtoId: ok.id, quantidade: 1, motivo: 'USO_INTERNO' })
        .expect(201);

      const todos = posicaoEstoquePageSchema.parse((await http().get(`${BASE}/posicao`)).body);
      expect(todos.meta.total).toBe(4);
      expect(todos.data.map((p) => [p.nome, p.status])).toEqual([
        ['Alcool', 'OK'],
        ['Brinde', 'SEM_CONTROLE'],
        ['Detergente', 'BAIXO'],
        ['Esponja', 'ZERADO'],
      ]);
      expect(todos.data[0]).toMatchObject({ sku: 'ALC', estoqueAtual: '9', valorEstoque: '27' });
      expect(todos.data[0]?.ultimaMovimentacao).not.toBeNull();
      expect(todos.data[2]).toMatchObject({ categoriaNome: 'Limpeza', valorEstoque: null });

      const nomes = async (query: Record<string, string>) =>
        (await http().get(`${BASE}/posicao`).query(query).expect(200)).body.data.map(
          (p: { nome: string }) => p.nome,
        );
      expect(await nomes({ status: 'OK' })).toEqual(['Alcool']);
      expect(await nomes({ status: 'BAIXO' })).toEqual(['Detergente']);
      expect(await nomes({ status: 'ZERADO' })).toEqual(['Esponja']);
      expect(await nomes({ categoriaId: categoria.id })).toEqual(['Detergente']);
      expect(await nomes({ search: 'alc' })).toEqual(['Alcool']);
      expect(await nomes({ sort: 'estoqueAtual:desc' })).toEqual([
        'Alcool',
        'Brinde',
        'Detergente',
        'Esponja',
      ]);
      await http().get(`${BASE}/posicao`).query({ status: 'SEM_CONTROLE' }).expect(400);
    });

    it('403 sem a permissão de ver', async () => {
      await (await semPermissao()).get(`${BASE}/posicao`).expect(403);
    });
  });

  describe('GET /movimentacoes', () => {
    it('lista com o nome do produto; filtra por tipo, busca e período', async () => {
      const luva = await criarProduto('Luva', { sku: 'LUV', atual: 5 });
      const gaze = await criarProduto('Gaze', { atual: 5 });
      await http()
        .post(`${BASE}/entradas`)
        .send({ produtoId: luva.id, quantidade: 1, motivo: 'COMPRA' })
        .expect(201);
      await http()
        .post(`${BASE}/saidas`)
        .send({ produtoId: gaze.id, quantidade: 1, motivo: 'USO_INTERNO' })
        .expect(201);

      const todas = movimentacaoEstoquePageSchema.parse(
        (await http().get(`${BASE}/movimentacoes`).expect(200)).body,
      );
      expect(todas.meta.total).toBe(2);
      expect(todas.data.every((m) => m.produtoNome.length > 0)).toBe(true);

      const tipos = await http().get(`${BASE}/movimentacoes`).query({ tipo: 'SAIDA' }).expect(200);
      expect(tipos.body.data.map((m: { produtoNome: string }) => m.produtoNome)).toEqual(['Gaze']);
      const busca = await http().get(`${BASE}/movimentacoes`).query({ search: 'luv' }).expect(200);
      expect(busca.body.data).toHaveLength(1);

      const passado = await http()
        .get(`${BASE}/movimentacoes`)
        .query({ de: '2020-01-01', ate: '2020-01-31' })
        .expect(200);
      expect(passado.body.meta.total).toBe(0);
      const desde = await http().get(`${BASE}/movimentacoes`).query({ de: '2020-01-01' });
      expect(desde.body.meta.total).toBe(2);
      await http().get(`${BASE}/movimentacoes`).query({ de: '31/01/2020' }).expect(400);
    });

    it('403 sem a permissão de ver', async () => {
      await (await semPermissao()).get(`${BASE}/movimentacoes`).expect(403);
    });
  });

  describe('GET /resumo e /alertas', () => {
    it('conta produtos, controlados, abaixo do mínimo, zerados, valor e movimentações em 24 h', async () => {
      const luva = await criarProduto('Luva', { atual: 10, custo: 2 });
      await criarProduto('Gaze', { atual: 1, minimo: 3, custo: 1.5 });
      await criarProduto('Esponja', { atual: 0, minimo: 1 });
      await criarProduto('Brinde', { controla: false, atual: 50, custo: 100 });
      await http()
        .post(`${BASE}/saidas`)
        .send({ produtoId: luva.id, quantidade: 1, motivo: 'USO_INTERNO' })
        .expect(201);
      // Lotes (tela Lotes / Validade): vencido, vencendo em 10 e 45 dias, válido e excluído.
      const hoje = hojeNaClinica();
      const lote = (numero: string, dias: number, deletedAt?: Date) =>
        prisma.lote.create({
          data: {
            produtoId: luva.id,
            numero,
            dataVencimento: new Date(`${somarDias(hoje, dias)}T00:00:00Z`),
            quantidade: 1,
            deletedAt,
          },
        });
      await lote('L-VENCIDO', -1);
      await lote('L-45', 45);
      await lote('L-10', 10);
      await lote('L-HOJE', 0);
      await lote('L-VALIDO', 61);
      await lote('L-EXCLUIDO', 5, new Date());

      const resumo = resumoEstoqueSchema.parse(
        (await http().get(`${BASE}/resumo`).expect(200)).body,
      );
      expect(resumo).toEqual({
        totalProdutos: 4,
        controlados: 3,
        abaixoMinimo: 2,
        zerados: 1,
        valorEstoque: '19.5',
        vencendo30d: 2,
        vencidos: 1,
        movimentacoes24h: 1,
      });

      const alertas = alertasEstoqueSchema.parse(
        (await http().get(`${BASE}/alertas`).expect(200)).body,
      );
      expect(alertas.abaixoMinimo.map((p) => p.nome)).toEqual(['Esponja', 'Gaze']);
      expect(alertas.lotesVencendo.map((l) => [l.numero, l.status])).toEqual([
        ['L-HOJE', 'VENCENDO'],
        ['L-10', 'VENCENDO'],
        ['L-45', 'VENCENDO'],
      ]);
    });

    it('403 sem a permissão de ver', async () => {
      const sem = await semPermissao();
      await sem.get(`${BASE}/resumo`).expect(403);
      await sem.get(`${BASE}/alertas`).expect(403);
    });
  });

  describe('GET /sugestao e /sugestao/export', () => {
    it('sugere pelo consumo médio e mínimo, com custo e fornecedor da última compra', async () => {
      const fornecedor = await prisma.fornecedor.create({ data: { nome: 'Distribuidora Alfa' } });
      const luva = await criarProduto('Luva', { sku: 'LUV', atual: 100, minimo: 10, custo: 1 });
      await criarProduto('Gaze', { atual: 0, minimo: 5, custo: 2 });
      await criarProduto('Brinde', { controla: false });
      // 90 unidades em 90 dias = 1/dia.
      await http()
        .post(`${BASE}/saidas`)
        .send({ produtoId: luva.id, quantidade: 90, motivo: 'USO_INTERNO' })
        .expect(201);
      await http()
        .post('/api/compras-estoque/compras')
        .send({
          fornecedorId: fornecedor.id,
          dataEntrada: '2026-11-05',
          itens: [{ produtoId: luva.id, descricao: 'Luva', quantidade: 2, valorUnitario: 1.25 }],
        })
        .expect(201);

      const page = sugestaoCompraPageSchema.parse(
        (await http().get(`${BASE}/sugestao`).expect(200)).body,
      );
      expect(page.meta.total).toBe(2);
      expect(page.data).toEqual([
        expect.objectContaining({
          nome: 'Gaze',
          prioridade: 'CRITICO',
          qtdSugerida: 5,
          diasParaAcabar: null,
          custoUnitario: '2',
          custoTotal: '10',
          fornecedorNome: null,
        }),
        expect.objectContaining({
          nome: 'Luva',
          sku: 'LUV',
          prioridade: 'URGENTE',
          estoqueAtual: '12',
          qtdSugerida: 28,
          diasParaAcabar: 12,
          custoUnitario: '1.25',
          custoTotal: '35',
          fornecedorNome: 'Distribuidora Alfa',
        }),
      ]);

      const urgentes = await http()
        .get(`${BASE}/sugestao`)
        .query({ prioridade: 'URGENTE' })
        .expect(200);
      expect(urgentes.body.data.map((s: { nome: string }) => s.nome)).toEqual(['Luva']);
      await http().get(`${BASE}/sugestao`).query({ prioridade: 'x' }).expect(400);
    });

    it('xlsx com o nome do produto e audita EXPORT; 403 sem exportar', async () => {
      await criarProduto('Luva Nitrílica', { atual: 0, minimo: 2 });
      const res = await http()
        .get(`${BASE}/sugestao/export`)
        .query({ format: 'xlsx' })
        .buffer(true)
        .parse(binario)
        .expect(200);
      const wb = new Workbook();
      await wb.xlsx.load(res.body);
      expect(JSON.stringify(wb.worksheets[0]?.getSheetValues() ?? [])).toContain('Luva Nitrílica');
      expect(
        await prisma.auditLog.count({ where: { entity: 'SugestaoCompra', action: 'EXPORT' } }),
      ).toBe(1);

      await (
        await semPermissao('compras-estoque.estoque.ver')
      )
        .get(`${BASE}/sugestao/export`)
        .query({ format: 'xlsx' })
        .expect(403);
      await http().get(`${BASE}/sugestao/export`).expect(400);
    });
  });

  describe('integração com a Entrada de Compras', () => {
    it('registrar e cancelar a compra gera entrada e estorno nas movimentações', async () => {
      const fornecedor = await prisma.fornecedor.create({ data: { nome: 'Distribuidora Alfa' } });
      const produto = await criarProduto('Cadeira');
      const compra = await http()
        .post('/api/compras-estoque/compras')
        .send({
          fornecedorId: fornecedor.id,
          numeroNf: '55252',
          dataEntrada: '2026-11-05',
          itens: [
            { produtoId: produto.id, descricao: 'Cadeira', quantidade: 2, valorUnitario: 10 },
          ],
        })
        .expect(201);
      await http().post(`/api/compras-estoque/compras/${compra.body.id}/cancelar`).expect(200);

      const movs = await http().get(`${BASE}/movimentacoes`).query({ sort: 'data:asc' });
      expect(movs.body.data).toEqual([
        expect.objectContaining({
          tipo: 'ENTRADA',
          motivo: 'Entrada por compra NF 55252',
          saldoAnterior: '0',
          saldoPosterior: '2',
          compraId: compra.body.id,
          fornecedorNome: 'Distribuidora Alfa',
        }),
        expect.objectContaining({
          tipo: 'SAIDA',
          motivo: 'Estorno da compra NF 55252',
          saldoAnterior: '2',
          saldoPosterior: '0',
        }),
      ]);
      expect(await saldo(produto.id)).toBe(0);
    });
  });
});

function binario(res: request.Response, cb: (err: Error | null, body: Buffer) => void) {
  const chunks: Buffer[] = [];
  res.on('data', (c: Buffer) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
}
