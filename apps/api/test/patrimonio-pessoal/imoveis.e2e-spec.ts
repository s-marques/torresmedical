import type { INestApplication } from '@nestjs/common';
import { imovelPageSchema, imovelSchema } from '@torres/shared';
import { Workbook } from 'exceljs';
import request from 'supertest';
import type { Prisma } from '../../src/generated/prisma/client';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { comUsuario, criarUsuarioTeste, type UsuarioTeste } from '../utils/auth';
import { createE2eApp } from '../utils/create-e2e-app';
import { truncateAll } from '../utils/database';
import { expectAudit, expectNoAudit } from '../utils/expect-audit';

const BASE = '/api/patrimonio-pessoal/imoveis';
const ENTITY = 'Imovel';
const PERMISSOES = [
  'patrimonio-pessoal.imoveis.ver',
  'patrimonio-pessoal.imoveis.criar',
  'patrimonio-pessoal.imoveis.editar',
  'patrimonio-pessoal.imoveis.excluir',
  'patrimonio-pessoal.imoveis.exportar',
] as const;
const INEXISTENTE = '00000000-0000-4000-8000-000000000000';
const MSG_DESCRICAO = 'Descrição é obrigatória.';

describe('Imóveis (e2e)', () => {
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
    descricao: string,
    extra: Omit<Prisma.ImovelCreateInput, 'descricao'> = {},
  ) {
    return prisma.imovel.create({ data: { descricao, ...extra } });
  }

  const descricoes = (body: { data: { descricao: string }[] }) => body.data.map((i) => i.descricao);

  describe('GET (listagem)', () => {
    beforeEach(async () => {
      await criarNoBanco('Casa Praia', {
        tipo: 'CASA',
        endereco: 'Avenida Beira Mar, 100',
        valorCompra: '500000',
        financiamentoParcela: '3000',
      });
      await criarNoBanco('Apto Centro', {
        endereco: 'Rua Fictícia, 10',
        matricula: 'MAT-777',
        valorCompra: '300000',
        financiamentoParcela: '1500',
        condominio: '450.10',
        contaLuz: '120.20',
        internet: '99.90',
        seguro: '0.10',
      });
      await criarNoBanco('Galpão Industrial', { tipo: 'GALPAO', valorCompra: '900000' });
      await criarNoBanco('Excluído', { deletedAt: new Date() });
    });

    it('padrão: descrição crescente, sem excluídos, com a Desp. Mensal calculada', async () => {
      const res = await http().get(BASE).expect(200);

      const page = imovelPageSchema.parse(res.body);
      expect(descricoes(page)).toEqual(['Apto Centro', 'Casa Praia', 'Galpão Industrial']);
      expect(page.meta).toEqual({ page: 1, pageSize: 10, total: 3, totalPages: 1 });
      expect(page.data[0]).toMatchObject({
        valorCompra: 300_000,
        financiamentoParcela: 1500,
        contaAgua: null,
        despesaMensal: 670.3,
      });
      expect(page.data[1]?.despesaMensal).toBe(0);
    });

    it('a busca procura na descrição, no endereço e na matrícula', async () => {
      for (const [search, esperado] of [
        ['apto', ['Apto Centro']],
        ['BEIRA', ['Casa Praia']],
        ['mat-777', ['Apto Centro']],
        ['nada', []],
      ] as const) {
        const res = await http().get(BASE).query({ search }).expect(200);
        expect(descricoes(res.body)).toEqual(esperado);
      }
    });

    it('ordena por tipo, valor de compra e parcela, e pagina', async () => {
      const valor = await http().get(BASE).query({ sort: 'valorCompra:desc' }).expect(200);
      expect(descricoes(valor.body)).toEqual(['Galpão Industrial', 'Casa Praia', 'Apto Centro']);

      const tipo = await http().get(BASE).query({ sort: 'tipo:asc' }).expect(200);
      expect(descricoes(tipo.body)[0]).toBe('Apto Centro');

      const parcela = await http()
        .get(BASE)
        .query({ sort: 'financiamentoParcela:asc' })
        .expect(200);
      expect(descricoes(parcela.body)).toEqual(['Apto Centro', 'Casa Praia', 'Galpão Industrial']);

      const pagina = await http()
        .get(BASE)
        .query({ sort: 'descricao:desc', pageSize: 2, page: 2 })
        .expect(200);
      expect(descricoes(pagina.body)).toEqual(['Apto Centro']);
      expect(pagina.body.meta).toEqual({ page: 2, pageSize: 2, total: 3, totalPages: 2 });
    });

    it('400 para sort fora da whitelist (Desp. Mensal não ordena)', async () => {
      for (const sort of ['despesaMensal:asc', 'banco:asc']) {
        const res = await http().get(BASE).query({ sort }).expect(400);
        expect(res.body.details.map((d: { field: string }) => d.field)).toEqual(['sort']);
      }
    });
  });

  describe('GET /:id', () => {
    it('200, 404 (inexistente ou excluído) e 400 (id inválido)', async () => {
      const imovel = await criarNoBanco('Apto', {
        valorCompra: '350000.50',
        dataCompra: new Date('2024-03-10T00:00:00.000Z'),
      });
      const excluido = await criarNoBanco('X', { deletedAt: new Date() });

      const ok = await http().get(`${BASE}/${imovel.id}`).expect(200);
      expect(imovelSchema.parse(ok.body)).toMatchObject({
        id: imovel.id,
        descricao: 'Apto',
        valorCompra: 350_000.5,
        dataCompra: '2024-03-10',
      });
      for (const id of [INEXISTENTE, excluido.id]) {
        const res = await http().get(`${BASE}/${id}`).expect(404);
        expect(res.body).toMatchObject({ code: 'NOT_FOUND', message: 'Imóvel não encontrado' });
      }
      await http().get(`${BASE}/abc`).expect(400);
    });
  });

  describe('POST (Novo Imóvel)', () => {
    it('201: só com a descrição o Tipo é Apartamento; audita CREATE', async () => {
      const res = await http().post(BASE).send({ descricao: '  Apto 101 ' }).expect(201);

      expect(imovelSchema.parse(res.body)).toMatchObject({
        descricao: 'Apto 101',
        tipo: 'APARTAMENTO',
        valorCompra: null,
        dataCompra: null,
        despesaMensal: 0,
      });
      await expectAudit(prisma, {
        action: 'CREATE',
        entity: ENTITY,
        entityId: res.body.id,
        before: null,
        after: { descricao: 'Apto 101', tipo: 'APARTAMENTO' },
        userId: usuario.id,
      });
    });

    it('201 com as três seções preenchidas', async () => {
      const completo = {
        descricao: 'Sala 302',
        tipo: 'SALA_COMERCIAL',
        endereco: 'Rua Fictícia, 302, Centro',
        matricula: 'M-302',
        valorCompra: 420_000.75,
        dataCompra: '2023-08-15',
        iptuAnual: 1800,
        itbiPago: 8400,
        banco: 'Banco Teste',
        financiamentoParcela: 2200.5,
        saldoDevedor: 180_000,
        vencimentoFinanciamento: '2038-08-15',
        condominio: 600,
        contaLuz: 200,
        contaAgua: 90.5,
        internet: 120,
        seguro: 45,
        observacoes: 'Alugada',
      };

      const res = await http().post(BASE).send(completo).expect(201);

      expect(imovelSchema.parse(res.body)).toMatchObject({ ...completo, despesaMensal: 1055.5 });
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
          tipo: 'CHACARA',
          seguro: -1,
          dataCompra: '2024-02-31',
          despesaMensal: 10,
        })
        .expect(400);

      expect(res.body.details.map((d: { field: string }) => d.field).sort()).toEqual([
        'dataCompra',
        'despesaMensal',
        'seguro',
        'tipo',
      ]);
      await expectNoAudit(prisma, { entity: ENTITY });
    });
  });

  describe('PATCH /:id (Editar Imóvel)', () => {
    it('200: altera os campos e audita UPDATE com before/after', async () => {
      const imovel = await criarNoBanco('Apto', { condominio: '300' });

      const res = await http()
        .patch(`${BASE}/${imovel.id}`)
        .send({ descricao: 'Apto reformado', tipo: 'CASA', condominio: 350, seguro: 50 })
        .expect(200);

      expect(res.body).toMatchObject({
        descricao: 'Apto reformado',
        tipo: 'CASA',
        condominio: 350,
        despesaMensal: 400,
      });
      await expectAudit(prisma, {
        action: 'UPDATE',
        entity: ENTITY,
        entityId: imovel.id,
        before: { descricao: 'Apto', tipo: 'APARTAMENTO' },
        after: { descricao: 'Apto reformado', tipo: 'CASA', condominio: 350 },
        userId: usuario.id,
      });
    });

    it('400 sem descrição e 404 inexistente ou excluído, sem auditar', async () => {
      const imovel = await criarNoBanco('Apto');
      const excluido = await criarNoBanco('X', { deletedAt: new Date() });

      const vazio = await http().patch(`${BASE}/${imovel.id}`).send({ descricao: '' }).expect(400);
      expect(vazio.body.details[0].message).toBe(MSG_DESCRICAO);
      for (const id of [INEXISTENTE, excluido.id]) {
        await http().patch(`${BASE}/${id}`).send({ descricao: 'Y' }).expect(404);
      }
      await expectNoAudit(prisma, { entity: ENTITY });
    });
  });

  describe('DELETE /:id', () => {
    it('exclusão lógica: 200, audita DELETE e some da listagem', async () => {
      const imovel = await criarNoBanco('Apto');

      await http().delete(`${BASE}/${imovel.id}`).expect(200);

      await expectAudit(prisma, {
        action: 'DELETE',
        entity: ENTITY,
        entityId: imovel.id,
        before: { descricao: 'Apto', deletedAt: null },
        after: null,
        userId: usuario.id,
      });
      expect(
        (await prisma.imovel.findUniqueOrThrow({ where: { id: imovel.id } })).deletedAt,
      ).not.toBeNull();
      await http().get(`${BASE}/${imovel.id}`).expect(404);
      const lista = await http().get(BASE).expect(200);
      expect(descricoes(lista.body)).toEqual([]);
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

    it('xlsx com busca, ordenação e colunas visíveis; audita EXPORT', async () => {
      await criarNoBanco('Casa Praia', { tipo: 'CASA', valorCompra: '500000' });
      await criarNoBanco('Apto Centro', {
        endereco: 'Rua Fictícia, 10',
        financiamentoParcela: '1500',
        condominio: '450.10',
        seguro: '0.10',
      });
      await criarNoBanco('Galpão', { tipo: 'GALPAO' });

      const res = await binary(
        http().get(`${BASE}/export`).query({
          format: 'xlsx',
          search: 'a',
          sort: 'descricao:asc',
          columns: 'descricao,tipo,endereco,valorCompra,financiamentoParcela,despesaMensal',
        }),
      ).expect(200);

      const workbook = new Workbook();
      await workbook.xlsx.load(res.body as unknown as ArrayBuffer);
      const rows: unknown[][] = [];
      workbook.worksheets[0]?.eachRow((row) => rows.push((row.values as unknown[]).slice(1)));
      expect(rows[0]).toEqual([
        'Descrição',
        'Tipo',
        'Endereço',
        'Valor Compra',
        'Financ. Parcela',
        'Desp. Mensal',
      ]);
      expect(rows.slice(1).map((r) => r.slice(0, 2))).toEqual([
        ['Apto Centro', 'Apartamento'],
        ['Casa Praia', 'Casa'],
        ['Galpão', 'Galpão'],
      ]);
      expect(rows[1]?.slice(4)).toEqual([1500, 450.2]);
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
        .query({ format: 'xlsx', columns: 'banco' })
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
