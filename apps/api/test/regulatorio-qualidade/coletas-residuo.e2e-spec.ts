import type { INestApplication } from '@nestjs/common';
import { coletaResiduoPageSchema, coletaResiduoSchema } from '@torres/shared';
import { Workbook } from 'exceljs';
import request from 'supertest';
import type { Prisma } from '../../src/generated/prisma/client';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { comUsuario, criarUsuarioTeste, type UsuarioTeste } from '../utils/auth';
import { createE2eApp } from '../utils/create-e2e-app';
import { truncateAll } from '../utils/database';
import { expectAudit, expectNoAudit } from '../utils/expect-audit';

const BASE = '/api/regulatorio-qualidade/coletas-residuo';
const ENTITY = 'ColetaResiduo';
const PERMISSOES = [
  'regulatorio-qualidade.coleta-residuos.ver',
  'regulatorio-qualidade.coleta-residuos.criar',
  'regulatorio-qualidade.coleta-residuos.editar',
  'regulatorio-qualidade.coleta-residuos.excluir',
  'regulatorio-qualidade.coleta-residuos.exportar',
] as const;
const INEXISTENTE = '00000000-0000-4000-8000-000000000000';
const MSG_DATA = 'Data Coleta é obrigatória.';
const MSG_TIPO = 'Tipo Resíduo é obrigatório.';

describe('Coleta Resíduos (e2e)', () => {
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
    dataColeta: string,
    extra: Partial<Omit<Prisma.ColetaResiduoUncheckedCreateInput, 'dataColeta'>> = {},
  ) {
    return prisma.coletaResiduo.create({
      data: {
        dataColeta: new Date(`${dataColeta}T00:00:00.000Z`),
        tipoResiduo: 'INFECTANTE',
        ...extra,
      },
    });
  }

  const datas = (body: { data: { dataColeta: string }[] }) => body.data.map((c) => c.dataColeta);

  describe('GET (listagem)', () => {
    beforeEach(async () => {
      await criarNoBanco('2026-10-01', {
        empresaColetora: 'Recicla Teste',
        manifestoMtr: 'MTR-100',
        pesoKg: '10.5',
        tipoResiduo: 'QUIMICO',
        responsavel: 'Ana Teste',
        proximaColeta: new Date('2026-11-01T00:00:00.000Z'),
      });
      await criarNoBanco('2026-11-15', {
        empresaColetora: 'Ambiental Fictícia',
        manifestoMtr: 'MTR-200',
        pesoKg: '30',
        tipoResiduo: 'PERFUROCORTANTE',
        responsavel: 'Bruno Teste',
      });
      await criarNoBanco('2026-09-20', { empresaColetora: 'Zeta Coletas', pesoKg: '2' });
      await criarNoBanco('2026-08-01', { deletedAt: new Date() });
    });

    it('padrão: data da coleta decrescente, sem excluídas, com decimais convertidos', async () => {
      const res = await http().get(BASE).expect(200);

      const page = coletaResiduoPageSchema.parse(res.body);
      expect(datas(page)).toEqual(['2026-11-15', '2026-10-01', '2026-09-20']);
      expect(page.meta).toEqual({ page: 1, pageSize: 10, total: 3, totalPages: 1 });
      expect(page.data[1]).toMatchObject({
        proximaColeta: '2026-11-01',
        empresaColetora: 'Recicla Teste',
        manifestoMtr: 'MTR-100',
        pesoKg: 10.5,
        tipoResiduo: 'QUIMICO',
      });
      expect(page.data[0]?.proximaColeta).toBeNull();
    });

    it('a busca procura na empresa coletora, no MTR e no responsável', async () => {
      for (const [search, esperado] of [
        ['recicla', ['2026-10-01']],
        ['mtr-200', ['2026-11-15']],
        ['BRUNO', ['2026-11-15']],
        ['nada', []],
      ] as const) {
        const res = await http().get(BASE).query({ search }).expect(200);
        expect(datas(res.body)).toEqual(esperado);
      }
    });

    it('ordena por cada coluna do inventário e pagina', async () => {
      const casos = [
        ['dataColeta:asc', ['2026-09-20', '2026-10-01', '2026-11-15']],
        ['pesoKg:desc', ['2026-11-15', '2026-10-01', '2026-09-20']],
        ['empresaColetora:desc', ['2026-09-20', '2026-10-01', '2026-11-15']],
        ['tipoResiduo:asc', ['2026-09-20', '2026-11-15', '2026-10-01']],
      ] as const;
      for (const [sort, esperado] of casos) {
        const res = await http().get(BASE).query({ sort }).expect(200);
        expect(datas(res.body)).toEqual(esperado);
      }
      for (const sort of ['proximaColeta:asc', 'manifestoMtr:asc', 'responsavel:asc']) {
        await http().get(BASE).query({ sort }).expect(200);
      }

      const pagina = await http()
        .get(BASE)
        .query({ sort: 'dataColeta:asc', pageSize: 2, page: 2 })
        .expect(200);
      expect(datas(pagina.body)).toEqual(['2026-11-15']);
      expect(pagina.body.meta).toEqual({ page: 2, pageSize: 2, total: 3, totalPages: 2 });
    });

    it('400 para sort fora da whitelist', async () => {
      const res = await http().get(BASE).query({ sort: 'observacoes:asc' }).expect(400);
      expect(res.body.details.map((d: { field: string }) => d.field)).toEqual(['sort']);
    });
  });

  describe('GET /:id', () => {
    it('200, 404 (inexistente ou excluída) e 400 (id inválido)', async () => {
      const coleta = await criarNoBanco('2026-10-01', { pesoKg: '7.25' });
      const excluida = await criarNoBanco('2026-10-02', { deletedAt: new Date() });

      const ok = await http().get(`${BASE}/${coleta.id}`).expect(200);
      expect(coletaResiduoSchema.parse(ok.body)).toMatchObject({
        id: coleta.id,
        dataColeta: '2026-10-01',
        pesoKg: 7.25,
      });
      for (const id of [INEXISTENTE, excluida.id]) {
        const res = await http().get(`${BASE}/${id}`).expect(404);
        expect(res.body).toMatchObject({ code: 'NOT_FOUND', message: 'Coleta não encontrada' });
      }
      await http().get(`${BASE}/abc`).expect(400);
    });
  });

  describe('POST (Nova Coleta)', () => {
    it('201: só com Data Coleta e Tipo Resíduo; audita CREATE', async () => {
      const res = await http()
        .post(BASE)
        .send({ dataColeta: '2026-11-10', tipoResiduo: 'INFECTANTE' })
        .expect(201);

      expect(coletaResiduoSchema.parse(res.body)).toMatchObject({
        dataColeta: '2026-11-10',
        tipoResiduo: 'INFECTANTE',
        proximaColeta: null,
        pesoKg: null,
      });
      await expectAudit(prisma, {
        action: 'CREATE',
        entity: ENTITY,
        entityId: res.body.id,
        before: null,
        after: { tipoResiduo: 'INFECTANTE' },
        userId: usuario.id,
      });
    });

    it('201 com todos os campos do modal', async () => {
      const completo = {
        dataColeta: '2026-11-10',
        proximaColeta: '2026-12-10',
        empresaColetora: 'Coletora Fictícia',
        manifestoMtr: 'MTR-777',
        pesoKg: 42.5,
        tipoResiduo: 'PERFUROCORTANTE',
        responsavel: 'Carla Teste',
        observacoes: 'Coleta mensal',
      };

      const res = await http().post(BASE).send(completo).expect(201);

      expect(coletaResiduoSchema.parse(res.body)).toMatchObject(completo);
    });

    it(`400 "${MSG_DATA}" e "${MSG_TIPO}" com os obrigatórios vazios ou ausentes, sem auditar`, async () => {
      for (const body of [{}, { dataColeta: '', tipoResiduo: '' }]) {
        const res = await http().post(BASE).send(body).expect(400);
        expect(res.body.details).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ field: 'dataColeta', message: MSG_DATA }),
            expect.objectContaining({ field: 'tipoResiduo', message: MSG_TIPO }),
          ]),
        );
      }
      await expectNoAudit(prisma, { entity: ENTITY });
    });

    it('400 para tipo desconhecido, peso negativo, data inválida e campo não permitido', async () => {
      const res = await http()
        .post(BASE)
        .send({
          dataColeta: '2026-02-31',
          tipoResiduo: 'COMUM',
          pesoKg: -1,
          proximaColeta: '10/12/2026',
          status: 'X',
        })
        .expect(400);

      expect(res.body.details.map((d: { field: string }) => d.field).sort()).toEqual([
        'dataColeta',
        'pesoKg',
        'proximaColeta',
        'status',
        'tipoResiduo',
      ]);
      await expectNoAudit(prisma, { entity: ENTITY });
    });
  });

  describe('PATCH /:id (Editar Coleta)', () => {
    it('200: altera os campos e audita UPDATE com before/after', async () => {
      const coleta = await criarNoBanco('2026-10-01', { empresaColetora: 'Antiga' });

      const res = await http()
        .patch(`${BASE}/${coleta.id}`)
        .send({
          dataColeta: '2026-10-05',
          tipoResiduo: 'QUIMICO',
          empresaColetora: 'Nova',
          pesoKg: 5,
        })
        .expect(200);

      expect(res.body).toMatchObject({
        dataColeta: '2026-10-05',
        tipoResiduo: 'QUIMICO',
        empresaColetora: 'Nova',
        pesoKg: 5,
      });
      await expectAudit(prisma, {
        action: 'UPDATE',
        entity: ENTITY,
        entityId: coleta.id,
        before: { tipoResiduo: 'INFECTANTE', empresaColetora: 'Antiga' },
        after: { tipoResiduo: 'QUIMICO', empresaColetora: 'Nova' },
        userId: usuario.id,
      });
    });

    it('400 sem os obrigatórios e 404 inexistente ou excluída, sem auditar', async () => {
      const coleta = await criarNoBanco('2026-10-01');
      const excluida = await criarNoBanco('2026-10-02', { deletedAt: new Date() });

      const vazio = await http().patch(`${BASE}/${coleta.id}`).send({}).expect(400);
      expect(vazio.body.details.map((d: { message: string }) => d.message).sort()).toEqual([
        MSG_DATA,
        MSG_TIPO,
      ]);
      for (const id of [INEXISTENTE, excluida.id]) {
        await http()
          .patch(`${BASE}/${id}`)
          .send({ dataColeta: '2026-10-03', tipoResiduo: 'QUIMICO' })
          .expect(404);
      }
      await expectNoAudit(prisma, { entity: ENTITY });
    });
  });

  describe('DELETE /:id', () => {
    it('exclusão lógica: 200, audita DELETE e some da listagem', async () => {
      const coleta = await criarNoBanco('2026-10-01', { empresaColetora: 'Teste' });

      await http().delete(`${BASE}/${coleta.id}`).expect(200);

      await expectAudit(prisma, {
        action: 'DELETE',
        entity: ENTITY,
        entityId: coleta.id,
        before: { empresaColetora: 'Teste', deletedAt: null },
        after: null,
        userId: usuario.id,
      });
      expect(
        (await prisma.coletaResiduo.findUniqueOrThrow({ where: { id: coleta.id } })).deletedAt,
      ).not.toBeNull();
      await http().get(`${BASE}/${coleta.id}`).expect(404);
      const lista = await http().get(BASE).expect(200);
      expect(datas(lista.body)).toEqual([]);
    });

    it('404 para já excluída e inexistente, sem auditar', async () => {
      const excluida = await criarNoBanco('2026-10-01', { deletedAt: new Date() });

      await http().delete(`${BASE}/${excluida.id}`).expect(404);
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

    it('xlsx com busca, ordenação e colunas visíveis; audita EXPORT', async () => {
      await criarNoBanco('2026-10-01', {
        empresaColetora: 'Recicla Teste',
        pesoKg: '10.5',
        tipoResiduo: 'QUIMICO',
      });
      await criarNoBanco('2026-11-15', {
        empresaColetora: 'Recicla Outra',
        pesoKg: '30',
        proximaColeta: new Date('2026-12-15T00:00:00.000Z'),
      });
      await criarNoBanco('2026-09-20', { empresaColetora: 'Zeta Coletas' });

      const res = await binary(
        http().get(`${BASE}/export`).query({
          format: 'xlsx',
          search: 'recicla',
          sort: 'dataColeta:asc',
          columns: 'dataColeta,proximaColeta,pesoKg,tipoResiduo',
        }),
      ).expect(200);

      const workbook = new Workbook();
      await workbook.xlsx.load(res.body as unknown as ArrayBuffer);
      const rows: unknown[][] = [];
      workbook.worksheets[0]?.eachRow((row) => rows.push((row.values as unknown[]).slice(1)));
      expect(rows[0]).toEqual(['Data Coleta', 'Próxima Coleta', 'Peso (kg)', 'Tipo Resíduo']);
      expect(rows.slice(1)).toEqual([
        ['01/10/2026', '', 10.5, 'Químico'],
        ['15/11/2026', '15/12/2026', 30, 'Infectante'],
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
        .query({ format: 'xlsx', columns: 'observacoes' })
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
