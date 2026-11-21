import type { INestApplication } from '@nestjs/common';
import { catalogoRelatoriosSchema, paginaRelatorioSchema, type Permissao } from '@torres/shared';
import request from 'supertest';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { ENTIDADE_RELATORIO } from '../../src/common/relatorios/relatorios.controller';
import { comUsuario, criarUsuarioTeste, type UsuarioTeste } from '../utils/auth';
import { createE2eApp } from '../utils/create-e2e-app';
import { truncateAll } from '../utils/database';
import { expectAudit } from '../utils/expect-audit';

const BASE = '/api/compras-estoque/relatorios';
const TELA_VER = 'compras-estoque.relatorios.ver';
const TODAS: readonly Permissao[] = [
  TELA_VER,
  'compras-estoque.relatorios.exportar',
  'compras-estoque.estoque.ver',
  'compras-estoque.lotes-validade.ver',
  'compras-estoque.entrada-compras.ver',
];

const DIA_MS = 86_400_000;
const diaIso = (dias: number) => new Date(Date.now() + dias * DIA_MS).toISOString().slice(0, 10);
const data = (dias: number) => new Date(`${diaIso(dias)}T00:00:00Z`);
/** Janela larga: do ano passado até o próximo. */
const PERIODO = { de: diaIso(-400), ate: diaIso(400) };

describe('Relatórios de Estoque (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let usuario: UsuarioTeste;

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await truncateAll(prisma);
    usuario = await criarUsuarioTeste(app, { permissoes: TODAS });
  });

  afterAll(async () => {
    await app.close();
  });

  const http = (quem: UsuarioTeste = usuario) => comUsuario(app, quem);

  const produto = (nome: string, extra: Record<string, unknown> = {}) =>
    prisma.produto.create({ data: { nome, tipo: 'PRODUTO', ...extra } as never });
  const fornecedor = (nome: string) => prisma.fornecedor.create({ data: { nome } });
  const lote = (produtoId: string, numero: string, dias: number, quantidade = 5) =>
    prisma.lote.create({ data: { produtoId, numero, dataVencimento: data(dias), quantidade } });
  const movimentacao = (
    produtoId: string,
    tipo: 'ENTRADA' | 'SAIDA',
    quantidade: number,
    dias = 0,
  ) =>
    prisma.movimentacaoEstoque.create({
      data: { produtoId, tipo, quantidade, createdAt: new Date(Date.now() + dias * DIA_MS) },
    });
  const compra = (
    fornecedorId: string,
    produtoId: string,
    dias: number,
    qtd: number,
    valor: number,
  ) =>
    prisma.compra.create({
      data: {
        fornecedorId,
        dataEntrada: data(dias),
        valorTotal: qtd * valor,
        itens: { create: { produtoId, descricao: 'Item', quantidade: qtd, valorUnitario: valor } },
      },
    });
  const consultar = (id: string, extra: Record<string, string> = {}) =>
    http()
      .get(`${BASE}/${id}`)
      .query({ ...PERIODO, ...extra });

  describe('GET /relatorios (catálogo)', () => {
    it('lista os relatórios de estoque com colunas e filtros', async () => {
      const res = await http().get(BASE).expect(200);

      const { data: relatorios } = catalogoRelatoriosSchema.parse(res.body);
      expect(relatorios.map((r) => r.id)).toEqual([
        'EST-01',
        'EST-04',
        'EST-05',
        'EST-06',
        'EST-07',
        'EST-08',
        'EST-09',
        'EST-10',
        'EST-11',
        'EST-12',
        'EST-13',
        'EST-14',
      ]);
      expect(relatorios.find((r) => r.id === 'EST-13')?.filtros[0]?.parametro).toBe('agrupar');
      expect(relatorios.find((r) => r.id === 'EST-14')?.filtros[0]?.parametro).toBe('cobertura');
    });

    it('só mostra os relatórios cuja tela dona dos dados o usuário vê', async () => {
      const soLotes = await criarUsuarioTeste(app, {
        permissoes: [TELA_VER, 'compras-estoque.lotes-validade.ver'],
      });
      const res = await http(soLotes).get(BASE).expect(200);
      expect(res.body.data.map((r: { id: string }) => r.id)).toEqual(['EST-01', 'EST-04']);
    });

    it('403 sem a permissão da tela', async () => {
      const semTela = await criarUsuarioTeste(app, { permissoes: [] });
      await http(semTela).get(BASE).expect(403);
    });
  });

  describe('lotes', () => {
    it('EST-01: lotes que vencem dentro de 60 dias, com o nome do produto', async () => {
      const soro = await produto('Soro Fisiológico');
      await lote(soro.id, 'L-PROX', 10);
      await lote(soro.id, 'L-LONGE', 90);
      await lote(soro.id, 'L-VENCIDO', -5);
      await lote(soro.id, 'L-ZERADO', 10, 0);
      await prisma.lote.create({
        data: {
          produtoId: soro.id,
          numero: 'L-DEL',
          dataVencimento: data(10),
          quantidade: 1,
          deletedAt: new Date(),
        },
      });

      const res = await consultar('EST-01').expect(200);

      const { data: linhas } = paginaRelatorioSchema.parse(res.body);
      expect(linhas).toEqual([
        expect.objectContaining({
          produto: 'Soro Fisiológico',
          lote: 'L-PROX',
          diasParaVencer: 10,
          quantidade: 5,
        }),
      ]);
    });

    it('EST-04: lotes já vencidos no período e o valor perdido pelo custo', async () => {
      const luva = await produto('Luva', { precoCusto: 2.5 });
      await lote(luva.id, 'L-VENCIDO', -5, 10);
      await lote(luva.id, 'L-FUTURO', 5, 10);

      const res = await consultar('EST-04').expect(200);

      expect(res.body.data).toEqual([
        expect.objectContaining({
          produto: 'Luva',
          lote: 'L-VENCIDO',
          custoUnitario: 2.5,
          valorPerdido: 25,
        }),
      ]);
    });
  });

  describe('saldo', () => {
    it('EST-05: posição com valor em estoque, sem serviços nem inativos', async () => {
      await produto('Agulha', { estoqueAtual: 4, precoCusto: 3 });
      await produto('Consulta', { tipo: 'SERVICO' });
      await produto('Descontinuado', { ativo: false });

      const res = await consultar('EST-05').expect(200);

      expect(res.body.data).toEqual([
        expect.objectContaining({
          produto: 'Agulha',
          categoria: 'Sem categoria',
          saldo: 4,
          valorEmEstoque: 12,
        }),
      ]);
    });

    it('EST-06: só os produtos abaixo do mínimo, com a falta', async () => {
      await produto('Gaze', { estoqueAtual: 2, estoqueMinimo: 10 });
      await produto('Seringa', { estoqueAtual: 10, estoqueMinimo: 10 });

      const res = await consultar('EST-06').expect(200);

      expect(res.body.data).toEqual([
        expect.objectContaining({ produto: 'Gaze', saldo: 2, estoqueMinimo: 10, falta: 8 }),
      ]);
    });

    it('EST-07: movimentações do período, paginadas e ordenadas', async () => {
      const gaze = await produto('Gaze');
      await movimentacao(gaze.id, 'ENTRADA', 10, -1);
      await movimentacao(gaze.id, 'SAIDA', 3, 0);
      await movimentacao(gaze.id, 'SAIDA', 1, -800);

      const res = await consultar('EST-07', { pageSize: '1', sort: 'quantidade:desc' }).expect(200);

      expect(res.body.meta.total).toBe(2);
      expect(res.body.data).toEqual([
        expect.objectContaining({ produto: 'Gaze', tipo: 'ENTRADA', quantidade: 10 }),
      ]);
    });

    it('EST-11: produtos sem movimentação no período, com a última movimentação', async () => {
      const parado = await produto('Parado');
      const ativo = await produto('Ativo');
      await movimentacao(parado.id, 'ENTRADA', 1, -800);
      await movimentacao(ativo.id, 'ENTRADA', 1, -1);

      const res = await consultar('EST-11').expect(200);

      expect(res.body.data).toEqual([
        expect.objectContaining({ produto: 'Parado', ultimaMovimentacao: expect.any(String) }),
      ]);
    });
  });

  describe('compras', () => {
    it('EST-08: compras recebidas por fornecedor, sem canceladas', async () => {
      const f1 = await fornecedor('Distribuidora Alfa');
      const f2 = await fornecedor('Distribuidora Beta');
      const gaze = await produto('Gaze');
      await compra(f1.id, gaze.id, -3, 10, 5);
      await compra(f1.id, gaze.id, -2, 10, 5);
      await compra(f2.id, gaze.id, -1, 1, 1);
      await prisma.compra.create({
        data: { fornecedorId: f2.id, dataEntrada: data(-1), valorTotal: 999, status: 'CANCELADA' },
      });

      const res = await consultar('EST-08').expect(200);

      expect(res.body.data).toEqual([
        { fornecedor: 'Distribuidora Alfa', compras: 2, valor: 100, ticketMedio: 50 },
        { fornecedor: 'Distribuidora Beta', compras: 1, valor: 1, ticketMedio: 1 },
      ]);
    });

    it('EST-09: compras por produto com o custo médio', async () => {
      const f = await fornecedor('Alfa');
      const gaze = await produto('Gaze');
      await compra(f.id, gaze.id, -3, 10, 2);
      await compra(f.id, gaze.id, -2, 10, 4);

      const res = await consultar('EST-09').expect(200);

      expect(res.body.data).toEqual([
        { produto: 'Gaze', quantidade: 20, valor: 60, custoMedio: 3 },
      ]);
    });

    it('EST-10: curva ABC pelo valor comprado', async () => {
      const f = await fornecedor('Alfa');
      const a = await produto('Item A');
      const b = await produto('Item B');
      const c = await produto('Item C');
      await compra(f.id, a.id, -3, 1, 85);
      await compra(f.id, b.id, -3, 1, 12);
      await compra(f.id, c.id, -3, 1, 3);

      const res = await consultar('EST-10').expect(200);

      expect(res.body.data).toEqual([
        { produto: 'Item A', valor: 85, participacao: 85, acumulado: 85, classe: 'A' },
        { produto: 'Item B', valor: 12, participacao: 12, acumulado: 97, classe: 'B' },
        { produto: 'Item C', valor: 3, participacao: 3, acumulado: 100, classe: 'C' },
      ]);
    });

    it('EST-12: valor comprado por mês, com a variação sobre o mês anterior', async () => {
      const f = await fornecedor('Alfa');
      const gaze = await produto('Gaze');
      const mes = (n: number) => new Date(Date.UTC(2026, n, 15));
      for (const [n, valor] of [
        [0, 100],
        [1, 150],
      ] as const) {
        await prisma.compra.create({
          data: {
            fornecedorId: f.id,
            dataEntrada: mes(n),
            valorTotal: valor,
            itens: {
              create: { produtoId: gaze.id, descricao: 'x', quantidade: 1, valorUnitario: valor },
            },
          },
        });
      }

      const res = await http()
        .get(`${BASE}/EST-12`)
        .query({ de: '2026-01-01', ate: '2026-12-31' })
        .expect(200);

      expect(res.body.data).toEqual([
        { mes: '2026-01', compras: 1, valor: 100, variacao: null },
        { mes: '2026-02', compras: 1, valor: 150, variacao: 50 },
      ]);
    });
  });

  describe('consumo e previsão', () => {
    it('EST-13: consumo do período contra a média dos 90 dias anteriores, por produto e por categoria', async () => {
      const categoria = await prisma.categoria.create({
        data: { nome: 'Descartáveis', tipo: 'PRODUTO' } as never,
      });
      const gaze = await produto('Gaze', { categoriaId: categoria.id });
      await movimentacao(gaze.id, 'SAIDA', 30, -10);
      await movimentacao(gaze.id, 'SAIDA', 90, -60);
      await movimentacao(gaze.id, 'ENTRADA', 500, -10);
      const periodo = { de: diaIso(-30), ate: diaIso(0) };

      const porProduto = await http().get(`${BASE}/EST-13`).query(periodo).expect(200);
      const porCategoria = await http()
        .get(`${BASE}/EST-13`)
        .query({ ...periodo, agrupar: 'categoria' })
        .expect(200);

      // média diária 90/90 = 1 × 31 dias = 31 esperados; consumo 30 → -3,2%
      expect(porProduto.body.data).toEqual([
        { item: 'Gaze', categoria: 'Descartáveis', consumo: 30, mediaEsperada: 31, variacao: -3.2 },
      ]);
      expect(porCategoria.body.data[0]).toMatchObject({ item: 'Descartáveis', consumo: 30 });
      await http()
        .get(`${BASE}/EST-13`)
        .query({ ...periodo, agrupar: 'x' })
        .expect(400);
    });

    it('EST-14: sugere a compra pela cobertura desejada e descarta quem já está coberto', async () => {
      const gaze = await produto('Gaze', { estoqueAtual: 10 });
      const coberto = await produto('Coberto', { estoqueAtual: 1000 });
      await movimentacao(gaze.id, 'SAIDA', 90, -5);
      await movimentacao(coberto.id, 'SAIDA', 90, -5);

      const padrao = await consultar('EST-14').expect(200);
      const sessenta = await consultar('EST-14', { cobertura: '60' }).expect(200);

      // 90 saídas / 90 dias = 1 por dia × 30 dias − saldo 10 = 20
      expect(padrao.body.data).toEqual([
        {
          produto: 'Gaze',
          saldo: 10,
          consumoDiario: 1,
          diasDeEstoque: 10,
          necessidade: 20,
          sugestao: 20,
        },
      ]);
      expect(sessenta.body.data[0]).toMatchObject({ produto: 'Gaze', necessidade: 50 });
      await consultar('EST-14', { cobertura: '7' }).expect(400);
    });
  });

  describe('validação, permissão e exportação', () => {
    it('400 com período invertido; 404 para relatório inexistente (inclui EST-02 e EST-03 pendentes)', async () => {
      await http().get(`${BASE}/EST-05`).query({ de: '2026-10-31', ate: '2026-10-01' }).expect(400);
      await http().get(`${BASE}/EST-99`).query(PERIODO).expect(404);
      await http().get(`${BASE}/EST-02`).query(PERIODO).expect(404);
    });

    it('400 ao ordenar por campo fora da lista', async () => {
      await consultar('EST-12', { sort: 'variacao:asc' }).expect(400);
    });

    it('403 no relatório cuja tela dona dos dados o usuário não vê', async () => {
      const soTela = await criarUsuarioTeste(app, { permissoes: [TELA_VER] });
      await http(soTela).get(`${BASE}/EST-05`).query(PERIODO).expect(403);
    });

    it('exporta Excel e grava a ação EXPORT no audit_log', async () => {
      await produto('Gaze', { estoqueAtual: 1 });

      await http()
        .get(`${BASE}/EST-05/export`)
        .query({ ...PERIODO, format: 'xlsx' })
        .buffer(true)
        .parse(binario)
        .expect(200);

      await expectAudit(prisma, {
        action: 'EXPORT',
        entity: ENTIDADE_RELATORIO,
        entityId: 'EST-05',
        userId: usuario.id,
      });
    });

    it('403 ao exportar sem a permissão exportar da tela', async () => {
      const soVer = await criarUsuarioTeste(app, {
        permissoes: [TELA_VER, 'compras-estoque.estoque.ver'],
      });
      await http(soVer)
        .get(`${BASE}/EST-05/export`)
        .query({ ...PERIODO, format: 'xlsx' })
        .expect(403);
    });
  });
});

function binario(res: request.Response, callback: (erro: Error | null, corpo: Buffer) => void) {
  const partes: Buffer[] = [];
  res.on('data', (parte: Buffer) => partes.push(parte));
  res.on('end', () => callback(null, Buffer.concat(partes)));
}
