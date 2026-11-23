import type { INestApplication } from '@nestjs/common';
import { bemPageSchema, bemSchema, resumoPatrimonioSchema } from '@torres/shared';
import { Workbook } from 'exceljs';
import request from 'supertest';
import type { Prisma } from '../../src/generated/prisma/client';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { comUsuario, criarUsuarioTeste, type UsuarioTeste } from '../utils/auth';
import { createE2eApp } from '../utils/create-e2e-app';
import { truncateAll } from '../utils/database';
import { expectAudit, expectNoAudit } from '../utils/expect-audit';

const BASE = '/api/patrimonio-pessoal/patrimonio';
const ENTITY = 'Bem';
const PERMISSOES = [
  'patrimonio-pessoal.patrimonio.ver',
  'patrimonio-pessoal.patrimonio.criar',
  'patrimonio-pessoal.patrimonio.editar',
  'patrimonio-pessoal.patrimonio.excluir',
  'patrimonio-pessoal.patrimonio.exportar',
] as const;
const INEXISTENTE = '00000000-0000-4000-8000-000000000000';
const MSG_DESCRICAO = 'Descrição é obrigatória.';

describe('Patrimônio (e2e)', () => {
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

  const criarNoBanco = (descricao: string, extra: Omit<Prisma.BemCreateInput, 'descricao'> = {}) =>
    prisma.bem.create({ data: { descricao, ...extra } });

  const descricoes = (body: { data: { descricao: string }[] }) => body.data.map((b) => b.descricao);

  describe('GET (listagem)', () => {
    beforeEach(async () => {
      await criarNoBanco('Corolla 2024', {
        tipo: 'AUTOMOVEL',
        placa: 'ABC-1D23',
        valorCompra: '150000',
        dataAquisicao: new Date('2024-01-10T00:00:00.000Z'),
      });
      await criarNoBanco('Sala Comercial', { tipo: 'IMOVEL_URBANO', valorCompra: '400000' });
      await criarNoBanco('Fazenda', { tipo: 'IMOVEL_RURAL', valorCompra: '900000' });
      await criarNoBanco('Excluído', { deletedAt: new Date() });
    });

    it('padrão: descrição crescente, sem excluídos, Impostos Pend. zerado', async () => {
      const res = await http().get(BASE).expect(200);

      const page = bemPageSchema.parse(res.body);
      expect(descricoes(page)).toEqual(['Corolla 2024', 'Fazenda', 'Sala Comercial']);
      expect(page.meta).toEqual({ page: 1, pageSize: 10, total: 3, totalPages: 1 });
      expect(page.data[0]).toMatchObject({
        valorCompra: 150_000,
        valorAtual: null,
        dataAquisicao: '2024-01-10',
        impostosPendentes: 0,
      });
    });

    it('a busca procura na descrição e na placa; o filtro Tipo restringe', async () => {
      for (const [query, esperado] of [
        [{ search: 'coroll' }, ['Corolla 2024']],
        [{ search: 'abc-1d' }, ['Corolla 2024']],
        [{ tipo: 'IMOVEL_RURAL' }, ['Fazenda']],
        [{ tipo: 'BEM_MOVEL' }, []],
      ] as const) {
        const res = await http().get(BASE).query(query).expect(200);
        expect(descricoes(res.body)).toEqual(esperado);
      }
    });

    it('ordena por valor e data, e pagina', async () => {
      const valor = await http().get(BASE).query({ sort: 'valorCompra:desc' }).expect(200);
      expect(descricoes(valor.body)).toEqual(['Fazenda', 'Sala Comercial', 'Corolla 2024']);

      const pagina = await http()
        .get(BASE)
        .query({ sort: 'descricao:desc', pageSize: 2, page: 2 })
        .expect(200);
      expect(descricoes(pagina.body)).toEqual(['Corolla 2024']);
      expect(pagina.body.meta).toEqual({ page: 2, pageSize: 2, total: 3, totalPages: 2 });
    });

    it('400 para sort fora da whitelist e tipo inválido', async () => {
      await http().get(BASE).query({ sort: 'impostosPendentes:asc' }).expect(400);
      await http().get(BASE).query({ tipo: 'NAVIO' }).expect(400);
    });
  });

  describe('GET /resumo', () => {
    it('soma o valor atual (ou o de compra) dos bens não excluídos', async () => {
      await criarNoBanco('A', { valorCompra: '100.10', valorAtual: '80.05' });
      await criarNoBanco('B', { valorCompra: '200' });
      await criarNoBanco('C', { valorCompra: '999', deletedAt: new Date() });

      const res = await http().get(`${BASE}/resumo`).expect(200);

      expect(resumoPatrimonioSchema.parse(res.body)).toEqual({
        valorTotal: 280.05,
        impostosPendentes: 0,
        alertasProximos: 0,
      });
    });

    it('zerado sem bens', async () => {
      const res = await http().get(`${BASE}/resumo`).expect(200);
      expect(res.body.valorTotal).toBe(0);
    });
  });

  describe('GET /:id', () => {
    it('200, 404 (inexistente ou excluído) e 400 (id inválido)', async () => {
      const bem = await criarNoBanco('Carro', { marca: 'Marca X', ano: 2024 });
      const excluido = await criarNoBanco('X', { deletedAt: new Date() });

      const ok = await http().get(`${BASE}/${bem.id}`).expect(200);
      expect(bemSchema.parse(ok.body)).toMatchObject({ descricao: 'Carro', marca: 'Marca X' });
      for (const id of [INEXISTENTE, excluido.id]) {
        const res = await http().get(`${BASE}/${id}`).expect(404);
        expect(res.body).toMatchObject({ code: 'NOT_FOUND', message: 'Bem não encontrado' });
      }
      await http().get(`${BASE}/abc`).expect(400);
    });
  });

  describe('POST (Novo Bem)', () => {
    it('201: só com a descrição o Tipo é Automóvel; audita CREATE', async () => {
      const res = await http().post(BASE).send({ descricao: '  Corolla 2024 ' }).expect(201);

      expect(bemSchema.parse(res.body)).toMatchObject({
        descricao: 'Corolla 2024',
        tipo: 'AUTOMOVEL',
        valorCompra: null,
        financiado: false,
        possuiSeguro: false,
      });
      await expectAudit(prisma, {
        action: 'CREATE',
        entity: ENTITY,
        entityId: res.body.id,
        before: null,
        after: { descricao: 'Corolla 2024', tipo: 'AUTOMOVEL' },
        userId: usuario.id,
      });
    });

    it('201 Automóvel com Dados do Veículo', async () => {
      const completo = {
        descricao: 'Carro Teste',
        tipo: 'AUTOMOVEL',
        valorCompra: 120_000.5,
        dataAquisicao: '2024-05-20',
        marca: 'Marca X',
        modelo: 'Modelo Y',
        ano: 2024,
        placa: 'ABC-1D23',
        renavam: '12345678901',
        financiado: true,
        possuiSeguro: true,
      };

      const res = await http().post(BASE).send(completo).expect(201);

      expect(bemSchema.parse(res.body)).toMatchObject(completo);
    });

    it('201: nos outros tipos os Dados do Veículo são descartados', async () => {
      const res = await http()
        .post(BASE)
        .send({ descricao: 'Terreno', tipo: 'IMOVEL_RURAL', marca: 'X', placa: 'Y', financiado: true })
        .expect(201);

      expect(res.body).toMatchObject({ marca: null, placa: null, financiado: false });
    });

    it(`400 "${MSG_DESCRICAO}" com a descrição vazia ou ausente, sem auditar`, async () => {
      for (const body of [{ descricao: '' }, { descricao: '   ' }, {}]) {
        const res = await http().post(BASE).send(body).expect(400);
        expect(res.body.details).toEqual([
          expect.objectContaining({ field: 'descricao', message: MSG_DESCRICAO }),
        ]);
      }
      await expectNoAudit(prisma, { entity: ENTITY });
    });

    it('400 para tipo, valor negativo, data inválida e campo não permitido', async () => {
      const res = await http()
        .post(BASE)
        .send({
          descricao: 'X',
          tipo: 'NAVIO',
          valorCompra: -1,
          dataAquisicao: '2024-02-31',
          valorAtual: 10,
        })
        .expect(400);

      expect(res.body.details.map((d: { field: string }) => d.field).sort()).toEqual([
        'dataAquisicao',
        'tipo',
        'valorAtual',
        'valorCompra',
      ]);
      await expectNoAudit(prisma, { entity: ENTITY });
    });
  });

  describe('PATCH /:id (Editar Bem)', () => {
    it('200: altera os campos e audita UPDATE com before/after', async () => {
      const bem = await criarNoBanco('Carro', { valorCompra: '100' });

      const res = await http()
        .patch(`${BASE}/${bem.id}`)
        .send({ descricao: 'Carro novo', tipo: 'BEM_MOVEL', valorCompra: 150 })
        .expect(200);

      expect(res.body).toMatchObject({ descricao: 'Carro novo', tipo: 'BEM_MOVEL', valorCompra: 150 });
      await expectAudit(prisma, {
        action: 'UPDATE',
        entity: ENTITY,
        entityId: bem.id,
        before: { descricao: 'Carro', tipo: 'AUTOMOVEL' },
        after: { descricao: 'Carro novo', tipo: 'BEM_MOVEL' },
        userId: usuario.id,
      });
    });

    it('400 sem descrição e 404 inexistente ou excluído, sem auditar', async () => {
      const bem = await criarNoBanco('Carro');
      const excluido = await criarNoBanco('X', { deletedAt: new Date() });

      const vazio = await http().patch(`${BASE}/${bem.id}`).send({ descricao: '' }).expect(400);
      expect(vazio.body.details[0].message).toBe(MSG_DESCRICAO);
      for (const id of [INEXISTENTE, excluido.id]) {
        await http().patch(`${BASE}/${id}`).send({ descricao: 'Y' }).expect(404);
      }
      await expectNoAudit(prisma, { entity: ENTITY });
    });
  });

  describe('DELETE /:id', () => {
    it('exclusão lógica: 200, audita DELETE e some da listagem', async () => {
      const bem = await criarNoBanco('Carro');

      await http().delete(`${BASE}/${bem.id}`).expect(200);

      await expectAudit(prisma, {
        action: 'DELETE',
        entity: ENTITY,
        entityId: bem.id,
        before: { descricao: 'Carro', deletedAt: null },
        after: null,
        userId: usuario.id,
      });
      expect((await prisma.bem.findUniqueOrThrow({ where: { id: bem.id } })).deletedAt).not.toBeNull();
      await http().get(`${BASE}/${bem.id}`).expect(404);
      expect(descricoes((await http().get(BASE).expect(200)).body)).toEqual([]);
    });

    it('404 para já excluído e inexistente, sem auditar', async () => {
      const excluido = await criarNoBanco('X', { deletedAt: new Date() });

      await http().delete(`${BASE}/${excluido.id}`).expect(404);
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

    it('xlsx com filtro, ordenação e colunas; audita EXPORT', async () => {
      await criarNoBanco('Carro B', { valorCompra: '200' });
      await criarNoBanco('Carro A', { valorCompra: '100' });
      await criarNoBanco('Fazenda', { tipo: 'IMOVEL_RURAL' });

      const res = await binary(
        http().get(`${BASE}/export`).query({
          format: 'xlsx',
          tipo: 'AUTOMOVEL',
          sort: 'descricao:asc',
          columns: 'descricao,tipo,valorCompra,impostosPendentes',
        }),
      ).expect(200);

      const workbook = new Workbook();
      await workbook.xlsx.load(res.body as unknown as ArrayBuffer);
      const rows: unknown[][] = [];
      workbook.worksheets[0]?.eachRow((row) => rows.push((row.values as unknown[]).slice(1)));
      expect(rows[0]).toEqual(['Descrição', 'Tipo', 'Valor Compra', 'Impostos Pend.']);
      expect(rows.slice(1)).toEqual([
        ['Carro A', 'Automóvel', 100, 0],
        ['Carro B', 'Automóvel', 200, 0],
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
        .query({ format: 'xlsx', columns: 'marca' })
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
