import type { INestApplication } from '@nestjs/common';
import {
  bandeiraPageSchema,
  bandeiraSchema,
  formaPagamentoPageSchema,
  formaPagamentoSchema,
} from '@torres/shared';
import { Workbook } from 'exceljs';
import request from 'supertest';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { comUsuario, criarUsuarioTeste, type UsuarioTeste } from '../utils/auth';
import { createE2eApp } from '../utils/create-e2e-app';
import { truncateAll } from '../utils/database';
import { expectAudit, expectNoAudit } from '../utils/expect-audit';

const BASE = '/api/financeiro/formas-pagamento';
const BASE_BANDEIRAS = '/api/financeiro/bandeiras';
const ENTITY = 'FormaPagamento';
const PERMISSOES = [
  'financeiro.formas-pagamento.ver',
  'financeiro.formas-pagamento.criar',
  'financeiro.formas-pagamento.editar',
  'financeiro.formas-pagamento.excluir',
  'financeiro.formas-pagamento.exportar',
] as const;
const INEXISTENTE = '00000000-0000-4000-8000-000000000000';

describe('Formas de Pagamento (e2e)', () => {
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
    extra: Partial<{
      finalidade: 'RECEBER' | 'PAGAR';
      tipo: 'DINHEIRO' | 'PIX' | 'BOLETO' | 'CARTAO_CREDITO';
      prazoRecebimentoDias: number;
      maxParcelas: number;
      ativo: boolean;
      deletedAt: Date;
    }> = {},
  ) {
    return prisma.formaPagamento.create({
      data: { nome, finalidade: 'RECEBER', tipo: 'DINHEIRO', ...extra },
    });
  }

  describe('GET (listagem)', () => {
    beforeEach(async () => {
      await criarNoBanco('Dinheiro');
      await criarNoBanco('Cartão de Crédito', {
        tipo: 'CARTAO_CREDITO',
        prazoRecebimentoDias: 30,
        maxParcelas: 12,
      });
      await criarNoBanco('Boleto', {
        tipo: 'BOLETO',
        finalidade: 'PAGAR',
        maxParcelas: 3,
        ativo: false,
      });
      await criarNoBanco('Excluída', { deletedAt: new Date() });
    });

    it('padrão: nome crescente, sem excluídas, com meta de paginação', async () => {
      const res = await http().get(BASE).expect(200);

      const page = formaPagamentoPageSchema.parse(res.body);
      expect(page.data.map((f) => f.nome)).toEqual(['Boleto', 'Cartão de Crédito', 'Dinheiro']);
      expect(page.data[0]).toMatchObject({
        finalidade: 'PAGAR',
        tipo: 'BOLETO',
        prazoRecebimentoDias: 0,
        maxParcelas: 3,
        movimentaContaBancaria: true,
        ativo: false,
      });
      expect(page.meta).toEqual({ page: 1, pageSize: 10, total: 3, totalPages: 1 });
    });

    it('filtra por status, finalidade e tipo, busca por nome, ordena e pagina', async () => {
      const nomes = async (query: Record<string, string | number>) =>
        (await http().get(BASE).query(query).expect(200)).body.data.map(
          (f: { nome: string }) => f.nome,
        );

      expect(await nomes({ status: 'inativo' })).toEqual(['Boleto']);
      expect(await nomes({ status: 'ativo' })).toEqual(['Cartão de Crédito', 'Dinheiro']);
      expect(await nomes({ finalidade: 'pagar' })).toEqual(['Boleto']);
      expect(await nomes({ tipo: 'cartao_credito' })).toEqual(['Cartão de Crédito']);
      expect(await nomes({ search: 'DINH' })).toEqual(['Dinheiro']);
      expect(await nomes({ sort: 'maxParcelas:desc' })).toEqual([
        'Cartão de Crédito',
        'Boleto',
        'Dinheiro',
      ]);
      expect(await nomes({ sort: 'nome:desc', pageSize: 2, page: 2 })).toEqual(['Boleto']);
    });

    it('400 para sort fora da whitelist e filtros inválidos', async () => {
      const sort = await http().get(BASE).query({ sort: 'finalidade:asc' }).expect(400);
      expect(sort.body.details.map((d: { field: string }) => d.field)).toEqual(['sort']);

      await http().get(BASE).query({ tipo: 'outro' }).expect(400);
      await http().get(BASE).query({ status: 'x' }).expect(400);
    });
  });

  describe('GET /:id', () => {
    it('200 (inclusive inativa), 404 (inexistente ou excluída) e 400 (id inválido)', async () => {
      const inativa = await criarNoBanco('Pix', { tipo: 'PIX', ativo: false });
      const excluida = await criarNoBanco('X', { deletedAt: new Date() });

      const ok = await http().get(`${BASE}/${inativa.id}`).expect(200);
      expect(formaPagamentoSchema.parse(ok.body)).toMatchObject({ id: inativa.id, nome: 'Pix' });
      for (const id of [INEXISTENTE, excluida.id]) {
        const res = await http().get(`${BASE}/${id}`).expect(404);
        expect(res.body).toMatchObject({
          code: 'NOT_FOUND',
          message: 'Forma de pagamento não encontrada',
        });
      }
      await http().get(`${BASE}/abc`).expect(400);
    });
  });

  describe('POST (Nova Forma de Pagamento)', () => {
    it('201: só com o nome usa os padrões do modal; audita CREATE', async () => {
      const res = await http().post(BASE).send({ nome: '  teste ' }).expect(201);

      expect(formaPagamentoSchema.parse(res.body)).toMatchObject({
        nome: 'teste',
        finalidade: 'RECEBER',
        tipo: 'DINHEIRO',
        prazoRecebimentoDias: 0,
        maxParcelas: 1,
        movimentaContaBancaria: true,
        ativo: true,
      });
      await expectAudit(prisma, {
        action: 'CREATE',
        entity: ENTITY,
        entityId: res.body.id,
        before: null,
        after: { nome: 'teste', finalidade: 'RECEBER', tipo: 'DINHEIRO', ativo: true },
        userId: usuario.id,
      });
    });

    it('201 com todos os campos', async () => {
      const res = await http()
        .post(BASE)
        .send({
          nome: 'Convênio',
          finalidade: 'pagar',
          tipo: 'convenio',
          prazoRecebimentoDias: 30,
          maxParcelas: 6,
          movimentaContaBancaria: false,
        })
        .expect(201);

      expect(res.body).toMatchObject({
        finalidade: 'PAGAR',
        tipo: 'CONVENIO',
        prazoRecebimentoDias: 30,
        maxParcelas: 6,
        movimentaContaBancaria: false,
      });
    });

    it('400 "Nome é obrigatório." com o nome vazio ou ausente, sem auditar', async () => {
      for (const body of [{ nome: '' }, { nome: '   ' }, {}]) {
        const res = await http().post(BASE).send(body).expect(400);
        expect(res.body.details).toEqual([{ field: 'nome', message: 'Nome é obrigatório.' }]);
      }
      await expectNoAudit(prisma, { entity: ENTITY });
    });

    it('400 para números, enums e campo não permitido, sem auditar', async () => {
      const res = await http()
        .post(BASE)
        .send({
          nome: 'X',
          finalidade: 'x',
          tipo: 'y',
          prazoRecebimentoDias: -1,
          maxParcelas: 0,
          deletedAt: null,
        })
        .expect(400);

      expect(res.body.details.map((d: { field: string }) => d.field).sort()).toEqual([
        'deletedAt',
        'finalidade',
        'maxParcelas',
        'prazoRecebimentoDias',
        'tipo',
      ]);
      await expectNoAudit(prisma, { entity: ENTITY });
    });
  });

  describe('PATCH /:id', () => {
    it('200: altera os campos e audita UPDATE com before/after', async () => {
      const forma = await criarNoBanco('Boleto', { tipo: 'BOLETO' });

      const res = await http()
        .patch(`${BASE}/${forma.id}`)
        .send({ nome: 'Boleto bancário', maxParcelas: 3, prazoRecebimentoDias: 2 })
        .expect(200);

      expect(res.body).toMatchObject({ nome: 'Boleto bancário', maxParcelas: 3 });
      await expectAudit(prisma, {
        action: 'UPDATE',
        entity: ENTITY,
        entityId: forma.id,
        before: { nome: 'Boleto', maxParcelas: 1, prazoRecebimentoDias: 0 },
        after: { nome: 'Boleto bancário', maxParcelas: 3, prazoRecebimentoDias: 2 },
        userId: usuario.id,
      });
    });

    it('Desativar e Ativar só mudam o status e são auditados', async () => {
      const forma = await criarNoBanco('teste');

      const desativada = await http()
        .patch(`${BASE}/${forma.id}`)
        .send({ ativo: false })
        .expect(200);
      expect(desativada.body).toMatchObject({ nome: 'teste', ativo: false });
      await expectAudit(prisma, {
        action: 'UPDATE',
        entity: ENTITY,
        entityId: forma.id,
        before: { ativo: true, nome: 'teste' },
        after: { ativo: false, nome: 'teste' },
        userId: usuario.id,
      });

      const ativada = await http().patch(`${BASE}/${forma.id}`).send({ ativo: true }).expect(200);
      expect(ativada.body.ativo).toBe(true);
      expect(await prisma.auditLog.count({ where: { entity: ENTITY, action: 'UPDATE' } })).toBe(2);
    });

    it('400 sem campos ou sem nome e 404 inexistente ou excluída, sem auditar', async () => {
      const forma = await criarNoBanco('Boleto');
      const excluida = await criarNoBanco('X', { deletedAt: new Date() });

      const semCampos = await http().patch(`${BASE}/${forma.id}`).send({}).expect(400);
      expect(semCampos.body.details[0].message).toBe('Informe ao menos um campo para alterar');
      const vazio = await http().patch(`${BASE}/${forma.id}`).send({ nome: '' }).expect(400);
      expect(vazio.body.details[0].message).toBe('Nome é obrigatório.');
      for (const id of [INEXISTENTE, excluida.id]) {
        await http().patch(`${BASE}/${id}`).send({ nome: 'Y' }).expect(404);
      }
      await expectNoAudit(prisma, { entity: ENTITY });
    });
  });

  describe('DELETE /:id', () => {
    it('exclusão lógica: 200, audita DELETE e some da listagem', async () => {
      const forma = await criarNoBanco('teste');

      await http().delete(`${BASE}/${forma.id}`).expect(200);

      await expectAudit(prisma, {
        action: 'DELETE',
        entity: ENTITY,
        entityId: forma.id,
        before: { nome: 'teste', deletedAt: null },
        after: null,
        userId: usuario.id,
      });
      expect(
        (await prisma.formaPagamento.findUniqueOrThrow({ where: { id: forma.id } })).deletedAt,
      ).not.toBeNull();
      await http().get(`${BASE}/${forma.id}`).expect(404);
    });

    it('404 para já excluída e inexistente, sem auditar', async () => {
      const forma = await criarNoBanco('teste', { deletedAt: new Date() });

      await http().delete(`${BASE}/${forma.id}`).expect(404);
      await http().delete(`${BASE}/${INEXISTENTE}`).expect(404);
      await expectNoAudit(prisma, { entity: ENTITY });
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
      await criarNoBanco('Pix', { tipo: 'PIX' });
      await criarNoBanco('Dinheiro');
      await criarNoBanco('Boleto', { tipo: 'BOLETO', finalidade: 'PAGAR' });

      const res = await binary(
        http().get(`${BASE}/export`).query({
          format: 'xlsx',
          finalidade: 'receber',
          sort: 'nome:asc',
          columns: 'nome,tipo,ativo',
        }),
      ).expect(200);

      const workbook = new Workbook();
      await workbook.xlsx.load(res.body as unknown as ArrayBuffer);
      const rows: unknown[][] = [];
      workbook.worksheets[0]?.eachRow((row) => rows.push((row.values as unknown[]).slice(1)));
      expect(rows).toEqual([
        ['Nome', 'Tipo', 'Status'],
        ['Dinheiro', 'Dinheiro', 'Ativo'],
        ['Pix', 'Pix', 'Ativo'],
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

  describe('Bandeiras', () => {
    it('GET lista não excluídas por nome, com busca', async () => {
      await prisma.bandeira.createMany({
        data: [
          { nome: 'Visa', icone: 'fa-cc-visa' },
          { nome: 'Elo' },
          { nome: 'Excluída', deletedAt: new Date() },
        ],
      });

      const res = await http().get(BASE_BANDEIRAS).expect(200);
      const page = bandeiraPageSchema.parse(res.body);
      expect(page.data.map((b) => [b.nome, b.icone])).toEqual([
        ['Elo', 'fa-credit-card'],
        ['Visa', 'fa-cc-visa'],
      ]);

      const busca = await http().get(BASE_BANDEIRAS).query({ search: 'vis' }).expect(200);
      expect(busca.body.data.map((b: { nome: string }) => b.nome)).toEqual(['Visa']);
      await http().get(BASE_BANDEIRAS).query({ sort: 'icone:asc' }).expect(400);
    });

    it('POST 201 só com o nome usa o ícone padrão; audita CREATE', async () => {
      const res = await http().post(BASE_BANDEIRAS).send({ nome: ' Mastercard ' }).expect(201);

      expect(bandeiraSchema.parse(res.body)).toMatchObject({
        nome: 'Mastercard',
        icone: 'fa-credit-card',
        ativo: true,
      });
      await expectAudit(prisma, {
        action: 'CREATE',
        entity: 'Bandeira',
        entityId: res.body.id,
        before: null,
        after: { nome: 'Mastercard', icone: 'fa-credit-card' },
        userId: usuario.id,
      });
    });

    it('POST 400 sem nome ou com ícone inválido, sem auditar', async () => {
      const semNome = await http().post(BASE_BANDEIRAS).send({ nome: '' }).expect(400);
      expect(semNome.body.details).toEqual([{ field: 'nome', message: 'Nome é obrigatório.' }]);
      await http().post(BASE_BANDEIRAS).send({ nome: 'X', icone: 'fa credit' }).expect(400);
      await expectNoAudit(prisma, { entity: 'Bandeira' });
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
      { metodo: 'get', caminho: BASE_BANDEIRAS, permissao: 'ver' },
      { metodo: 'post', caminho: BASE_BANDEIRAS, permissao: 'criar' },
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
        await expectNoAudit(prisma, { entity: 'Bandeira' });
      },
    );
  });
});
