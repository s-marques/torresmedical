import { fakerPT_BR as faker } from '@faker-js/faker';
import type { INestApplication } from '@nestjs/common';
import { apiErrorSchema, unidadePageSchema, unidadeSchema } from '@torres/shared';
import { Workbook } from 'exceljs';
import request from 'supertest';
import { REQUEST_ID_HEADER } from '../../src/common/context/request-id';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { createE2eApp } from '../utils/create-e2e-app';
import { truncateAll } from '../utils/database';
import { expectAudit, expectNoAudit } from '../utils/expect-audit';
import { comUsuario, criarUsuarioTeste, type UsuarioTeste } from '../utils/auth';

const BASE = '/api/configuracoes-gestao/unidades';
const PERMISSOES = [
  'configuracoes-gestao.minha-empresa.ver',
  'configuracoes-gestao.minha-empresa.criar',
  'configuracoes-gestao.minha-empresa.editar',
  'configuracoes-gestao.minha-empresa.excluir',
  'configuracoes-gestao.minha-empresa.exportar',
] as const;
const INEXISTENTE = '00000000-0000-4000-8000-000000000000';

describe('Unidades: padrão de API (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let empresaId: string;
  let usuario: UsuarioTeste;

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await truncateAll(prisma);
    const empresa = await prisma.empresa.create({
      data: { nome: faker.company.name(), documento: faker.string.numeric(14) },
    });
    empresaId = empresa.id;
    usuario = await criarUsuarioTeste(app, { permissoes: PERMISSOES, empresaId });
  });

  afterAll(async () => {
    await app.close();
  });

  /** Cliente com o token do usuário de teste (todas as permissões de Minha Empresa). */
  function http() {
    return comUsuario(app, usuario);
  }

  function criarNoBanco(
    nome: string,
    extra: { ativo?: boolean; deletedAt?: Date; createdAt?: Date } = {},
  ) {
    return prisma.unidade.create({ data: { empresaId, nome, ...extra } });
  }

  describe('GET (listagem)', () => {
    beforeEach(async () => {
      await criarNoBanco('Centro', { createdAt: new Date('2026-01-01T00:00:00Z') });
      await criarNoBanco('Barra', { ativo: false, createdAt: new Date('2026-02-01T00:00:00Z') });
      await criarNoBanco('Asa Norte', { createdAt: new Date('2026-03-01T00:00:00Z') });
      await criarNoBanco('Excluída', { deletedAt: new Date() });
    });

    it('padrão: página 1, 10 por página, ordem por nome, sem excluídas', async () => {
      const res = await http().get(BASE).expect(200);

      const page = unidadePageSchema.parse(res.body);
      expect(page.data.map((u) => u.nome)).toEqual(['Asa Norte', 'Barra', 'Centro']);
      expect(page.meta).toEqual({ page: 1, pageSize: 10, total: 3, totalPages: 1 });
      expect(page.data[0]).not.toHaveProperty('deletedAt', expect.anything());
    });

    it('pagina e ordena por campo da whitelist', async () => {
      const res = await http()
        .get(BASE)
        .query({ sort: 'createdAt:desc', pageSize: 2, page: 2 })
        .expect(200);

      expect(res.body.data.map((u: { nome: string }) => u.nome)).toEqual(['Centro']);
      expect(res.body.meta).toEqual({ page: 2, pageSize: 2, total: 3, totalPages: 2 });
    });

    it('busca sem diferenciar maiúsculas e filtra por status e empresa', async () => {
      const busca = await http().get(BASE).query({ search: 'aSa' }).expect(200);
      expect(busca.body.data.map((u: { nome: string }) => u.nome)).toEqual(['Asa Norte']);

      const inativas = await http().get(BASE).query({ status: 'inativo' }).expect(200);
      expect(inativas.body.data.map((u: { nome: string }) => u.nome)).toEqual(['Barra']);

      const ativas = await http()
        .get(BASE)
        .query({ status: 'ativo', sort: 'nome:desc' })
        .expect(200);
      expect(ativas.body.data.map((u: { nome: string }) => u.nome)).toEqual([
        'Centro',
        'Asa Norte',
      ]);
    });

    it('não lista unidade de outra empresa, mesmo pedindo pelo id', async () => {
      const outraEmpresa = await prisma.empresa.create({
        data: { nome: faker.company.name(), documento: faker.string.numeric(14) },
      });
      const deOutraEmpresa = await prisma.unidade.create({
        data: { empresaId: outraEmpresa.id, nome: 'De Outra Empresa' },
      });

      const lista = await http().get(BASE).expect(200);
      expect(lista.body.data.map((u: { nome: string }) => u.nome)).not.toContain(
        'De Outra Empresa',
      );
      await http().get(`${BASE}/${deOutraEmpresa.id}`).expect(404);
    });

    it('400 com details para sort fora da whitelist, pageSize acima do máximo e status inválido', async () => {
      const res = await http()
        .get(BASE)
        .query({ sort: 'deletedAt:asc', pageSize: 101, status: 'todos' })
        .set(REQUEST_ID_HEADER, 'req-400')
        .expect(400);

      const body = apiErrorSchema.parse(res.body);
      expect(body).toMatchObject({
        code: 'VALIDATION_ERROR',
        message: 'Dados inválidos',
        requestId: 'req-400',
      });
      expect(body.details?.map((d) => d.field).sort()).toEqual(['pageSize', 'sort', 'status']);
      expect(body.details?.find((d) => d.field === 'pageSize')?.message).toBe(
        'Tamanho da página deve ser no máximo 100',
      );
    });
  });

  describe('GET /:id', () => {
    it('200 com a unidade', async () => {
      const unidade = await criarNoBanco('Centro');

      const res = await http().get(`${BASE}/${unidade.id}`).expect(200);

      expect(unidadeSchema.parse(res.body)).toMatchObject({ id: unidade.id, nome: 'Centro' });
    });

    it('404 para inexistente ou excluída', async () => {
      const excluida = await criarNoBanco('X', { deletedAt: new Date() });

      for (const id of [INEXISTENTE, excluida.id]) {
        const res = await http().get(`${BASE}/${id}`).expect(404);
        expect(res.body).toMatchObject({ code: 'NOT_FOUND', message: 'Unidade não encontrada' });
      }
    });

    it('400 para id que não é uuid', async () => {
      const res = await http().get(`${BASE}/abc`).expect(400);

      expect(res.body).toMatchObject({
        code: 'VALIDATION_ERROR',
        details: [expect.objectContaining({ field: 'id', message: 'Identificador inválido' })],
      });
    });
  });

  describe('POST', () => {
    it('201 e audita CREATE com o usuário; empresaId vem do usuário logado', async () => {
      const res = await http()
        .post(BASE)

        .send({ nome: '  Matriz  ', cnpj: '11.222.333/0001-81' })
        .expect(201);

      expect(unidadeSchema.parse(res.body)).toMatchObject({
        nome: 'Matriz',
        ativo: true,
        empresaId,
        cnpj: '11222333000181',
      });
      await expectAudit(prisma, {
        action: 'CREATE',
        entity: 'Unidade',
        entityId: res.body.id,
        before: null,
        after: { id: res.body.id, nome: 'Matriz', ativo: true, empresaId },
        userId: usuario.id,
      });
    });

    it('400 com mensagens em português por campo e campo não permitido', async () => {
      const res = await http().post(BASE).send({ nome: '', ativo: 'sim', extra: 1 }).expect(400);

      expect(res.body.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'nome', message: 'Informe o nome' }),
          expect.objectContaining({ field: 'ativo', message: 'Valor inválido' }),
          expect.objectContaining({ field: 'extra', message: 'Campo não permitido' }),
        ]),
      );
      await expectNoAudit(prisma, { entity: 'Unidade' });
    });

    it('ignora empresaId no corpo: sempre usa a empresa do usuário logado', async () => {
      const outraEmpresa = await prisma.empresa.create({
        data: { nome: faker.company.name(), documento: faker.string.numeric(14) },
      });

      const res = await http()
        .post(BASE)
        .send({ nome: 'Matriz', empresaId: outraEmpresa.id })
        .expect(400);

      expect(res.body.details).toContainEqual({
        field: 'empresaId',
        message: 'Campo não permitido',
      });
    });

    it('400 para JSON malformado', async () => {
      const res = await http()
        .post(BASE)
        .set('content-type', 'application/json')
        .send('{"nome":')
        .expect(400);

      expect(res.body).toMatchObject({
        code: 'VALIDATION_ERROR',
        message: 'JSON inválido no corpo da requisição',
      });
    });

    it('409 UNIDADE_DUPLICADA (nome igual sem diferenciar maiúsculas) e não audita', async () => {
      await criarNoBanco('Matriz');

      const res = await http().post(BASE).send({ nome: 'MATRIZ' }).expect(409);

      expect(res.body).toMatchObject({
        code: 'UNIDADE_DUPLICADA',
        details: [
          expect.objectContaining({
            field: 'nome',
            message: 'Já existe uma unidade com este nome',
          }),
        ],
      });
      await expectNoAudit(prisma, { entity: 'Unidade' });
    });

    it('permite reutilizar o nome de uma unidade excluída', async () => {
      await criarNoBanco('Matriz', { deletedAt: new Date() });

      const res = await http().post(BASE).send({ nome: 'Matriz' }).expect(201);

      expect(await prisma.unidade.count({ where: { nome: 'Matriz', deletedAt: null } })).toBe(1);
      expect(res.body.nome).toBe('Matriz');
    });

    it('422 EMPRESA_NAO_ENCONTRADA quando a empresa do usuário foi excluída', async () => {
      await prisma.empresa.update({ where: { id: empresaId }, data: { deletedAt: new Date() } });

      const res = await http().post(BASE).send({ nome: 'X' }).expect(422);

      expect(res.body).toMatchObject({
        statusCode: 422,
        code: 'EMPRESA_NAO_ENCONTRADA',
        details: [
          expect.objectContaining({ field: 'empresaId', message: 'Empresa não encontrada' }),
        ],
      });
    });
  });

  describe('PATCH /:id', () => {
    it('200 e audita UPDATE com before/after', async () => {
      const unidade = await criarNoBanco('Centro');

      const res = await http()
        .patch(`${BASE}/${unidade.id}`)

        .send({ nome: 'Centro Novo', ativo: false })
        .expect(200);

      expect(res.body).toMatchObject({ nome: 'Centro Novo', ativo: false });
      await expectAudit(prisma, {
        action: 'UPDATE',
        entity: 'Unidade',
        entityId: unidade.id,
        before: { nome: 'Centro', ativo: true },
        after: { nome: 'Centro Novo', ativo: false },
        userId: usuario.id,
      });
    });

    it('400 sem campos para alterar', async () => {
      const unidade = await criarNoBanco('Centro');

      const res = await http().patch(`${BASE}/${unidade.id}`).send({}).expect(400);

      expect(res.body.details).toEqual([
        expect.objectContaining({ field: '', message: 'Informe ao menos um campo para alterar' }),
      ]);
    });

    it('404 e não audita', async () => {
      await http().patch(`${BASE}/${INEXISTENTE}`).send({ nome: 'X' }).expect(404);

      await expectNoAudit(prisma, { entity: 'Unidade' });
    });

    it('409 para nome de outra unidade; o próprio nome é permitido', async () => {
      await criarNoBanco('Barra');
      const unidade = await criarNoBanco('Centro');

      const conflito = await http()
        .patch(`${BASE}/${unidade.id}`)
        .send({ nome: 'barra' })
        .expect(409);
      const proprio = await http()
        .patch(`${BASE}/${unidade.id}`)
        .send({ nome: 'CENTRO' })
        .expect(200);

      expect(conflito.body.code).toBe('UNIDADE_DUPLICADA');
      expect(proprio.body.nome).toBe('CENTRO');
    });
  });

  describe('DELETE /:id', () => {
    it('exclusão lógica: 200, audita DELETE e some da listagem', async () => {
      const unidade = await criarNoBanco('Centro');

      await http().delete(`${BASE}/${unidade.id}`).expect(200);

      await expectAudit(prisma, {
        action: 'DELETE',
        entity: 'Unidade',
        entityId: unidade.id,
        before: { nome: 'Centro', deletedAt: null },
        after: null,
        userId: usuario.id,
      });
      expect(
        (await prisma.unidade.findUniqueOrThrow({ where: { id: unidade.id } })).deletedAt,
      ).not.toBeNull();
      await http().get(`${BASE}/${unidade.id}`).expect(404);
      expect((await http().get(BASE).expect(200)).body.meta.total).toBe(0);
    });

    it('404 para já excluída, sem auditar de novo', async () => {
      const unidade = await criarNoBanco('Centro', { deletedAt: new Date() });

      await http().delete(`${BASE}/${unidade.id}`).expect(404);

      await expectNoAudit(prisma, { entity: 'Unidade' });
    });
  });

  describe('GET /export', () => {
    beforeEach(async () => {
      await criarNoBanco('Centro');
      await criarNoBanco('Barra', { ativo: false });
      await criarNoBanco('Asa Norte');
    });

    async function readXlsx(buffer: Buffer) {
      const workbook = new Workbook();
      await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
      const sheet = workbook.worksheets[0];
      const rows: unknown[][] = [];
      sheet?.eachRow((row) => rows.push((row.values as unknown[]).slice(1)));
      return rows;
    }

    function binary(req: request.Test) {
      return req.buffer(true).parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      });
    }

    it('xlsx com os mesmos filtros e ordenação da listagem e só as colunas visíveis; audita EXPORT', async () => {
      const res = await binary(
        http()
          .get(`${BASE}/export`)

          .query({ format: 'xlsx', status: 'ativo', sort: 'nome:desc', columns: 'nome,status' }),
      ).expect(200);

      expect(res.headers['content-type']).toContain('spreadsheetml');
      expect(res.headers['content-disposition']).toMatch(
        /^attachment; filename="unidades-\d{4}-\d{2}-\d{2}\.xlsx"/,
      );
      expect(await readXlsx(res.body as Buffer)).toEqual([
        ['Nome', 'Status'],
        ['Centro', 'Ativo'],
        ['Asa Norte', 'Ativo'],
      ]);

      await expectAudit(prisma, {
        action: 'EXPORT',
        entity: 'Unidade',
        entityId: '*',
        before: null,
        after: {
          filtros: { format: 'xlsx', status: 'ativo', sort: 'nome:desc', columns: 'nome,status' },
        },
        userId: usuario.id,
      });
    });

    it('pdf com todas as colunas por padrão', async () => {
      const res = await binary(http().get(`${BASE}/export`).query({ format: 'pdf' })).expect(200);

      expect(res.headers['content-type']).toBe('application/pdf');
      expect((res.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
      await expectAudit(prisma, { action: 'EXPORT', entity: 'Unidade', entityId: '*' });
    });

    it('400 para formato ou colunas inválidos, sem auditar', async () => {
      const res = await http()
        .get(`${BASE}/export`)
        .query({ format: 'csv', columns: 'nome,senha' })
        .expect(400);

      expect(res.body.details).toEqual([
        expect.objectContaining({ field: 'format', message: 'Formato deve ser xlsx ou pdf' }),
        {
          field: 'columns',
          message: 'Colunas inválidas: senha. Disponíveis: nome, status, createdAt',
        },
      ]);
      await expectNoAudit(prisma, { entity: 'Unidade', action: 'EXPORT' });
    });
  });

  describe('acesso', () => {
    const ROTAS = [
      { metodo: 'get', caminho: BASE, permissao: 'ver' },
      { metodo: 'get', caminho: `${BASE}/export?formato=xlsx`, permissao: 'exportar' },
      { metodo: 'get', caminho: `${BASE}/${INEXISTENTE}`, permissao: 'ver' },
      { metodo: 'post', caminho: BASE, permissao: 'criar' },
      { metodo: 'patch', caminho: `${BASE}/${INEXISTENTE}`, permissao: 'editar' },
      { metodo: 'delete', caminho: `${BASE}/${INEXISTENTE}`, permissao: 'excluir' },
    ] as const;

    it.each(ROTAS)('$metodo $caminho sem token responde 401', async ({ metodo, caminho }) => {
      const res = await request(app.getHttpServer())[metodo](caminho).send({}).expect(401);

      expect(res.body).toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED' });
    });

    it.each(ROTAS)(
      '$metodo $caminho sem a permissão $permissao responde 403, sem auditar',
      async ({ metodo, caminho, permissao }) => {
        const outras = PERMISSOES.filter((p) => !p.endsWith(`.${permissao}`));
        const semPermissao = await criarUsuarioTeste(app, { permissoes: outras, empresaId });

        const res = await comUsuario(app, semPermissao)[metodo](caminho).send({}).expect(403);

        expect(res.body).toMatchObject({ code: 'FORBIDDEN', message: 'Sem permissão' });
        await expectNoAudit(prisma, { entity: 'Unidade' });
      },
    );
  });
});
