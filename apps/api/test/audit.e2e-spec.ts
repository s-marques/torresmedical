import type { INestApplication } from '@nestjs/common';
import { fakerPT_BR as faker } from '@faker-js/faker';
import { auditLogPageSchema } from '@torres/shared';
import request from 'supertest';
import { AuditService } from '../src/common/audit/audit.service';
import { REQUEST_ID_HEADER } from '../src/common/context/request-id';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { AuditFixtureModule } from './fixtures/audit-fixture.module';
import { createE2eApp } from './utils/create-e2e-app';
import { truncateAll } from './utils/database';
import { expectAudit, expectNoAudit } from './utils/expect-audit';
import { TEST_USER_HEADER } from './utils/test-user.guard';

const BASE = '/api/test-fixtures/empresas';
const USER_ID = 'b1f0c1d2-0000-4000-8000-000000000001';

function novaEmpresa() {
  return { nome: faker.company.name(), documento: faker.string.numeric(14) };
}

describe('Auditoria (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createE2eApp({ imports: [AuditFixtureModule] });
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await truncateAll(prisma);
  });

  afterAll(async () => {
    await app.close();
  });

  function http() {
    return request(app.getHttpServer());
  }

  async function criar(body = novaEmpresa()) {
    const res = await http().post(BASE).set(TEST_USER_HEADER, USER_ID).send(body).expect(201);
    return res.body as { id: string; nome: string; documento: string };
  }

  describe('CREATE / UPDATE / DELETE', () => {
    it('CREATE grava after com a entidade criada e before nulo', async () => {
      const body = novaEmpresa();
      const res = await http()
        .post(BASE)
        .set(TEST_USER_HEADER, USER_ID)
        .set(REQUEST_ID_HEADER, 'req-create')
        .send(body)
        .expect(201);

      const registro = await expectAudit(prisma, {
        action: 'CREATE',
        entity: 'Empresa',
        entityId: res.body.id,
        before: null,
        after: { id: res.body.id, ...body, deletedAt: null },
        userId: USER_ID,
        requestId: 'req-create',
      });
      expect(registro.ip).toEqual(expect.any(String));
      expect(registro.occurredAt).toBeInstanceOf(Date);
    });

    it('UPDATE grava before (estado anterior) e after (retorno do handler)', async () => {
      const empresa = await criar();

      await http()
        .patch(`${BASE}/${empresa.id}`)
        .set(TEST_USER_HEADER, USER_ID)
        .send({ nome: 'Nome Alterado' })
        .expect(200);

      await expectAudit(prisma, {
        action: 'UPDATE',
        entity: 'Empresa',
        entityId: empresa.id,
        before: { id: empresa.id, nome: empresa.nome },
        after: { id: empresa.id, nome: 'Nome Alterado' },
        userId: USER_ID,
      });
    });

    it('DELETE grava before e after nulo', async () => {
      const empresa = await criar();

      await http().delete(`${BASE}/${empresa.id}`).set(TEST_USER_HEADER, USER_ID).expect(200);

      await expectAudit(prisma, {
        action: 'DELETE',
        entity: 'Empresa',
        entityId: empresa.id,
        before: { id: empresa.id, nome: empresa.nome, deletedAt: null },
        after: null,
      });
    });

    it('grava "anonymous" quando a requisição não tem usuário', async () => {
      const res = await http().post(BASE).send(novaEmpresa()).expect(201);

      await expectAudit(prisma, {
        action: 'CREATE',
        entity: 'Empresa',
        entityId: res.body.id,
        userId: 'anonymous',
      });
    });
  });

  describe('falhas não geram auditoria', () => {
    it('erro de negócio depois da escrita desfaz a escrita e não audita', async () => {
      const body = novaEmpresa();
      await http().post(`${BASE}/falha`).send(body).expect(400);

      expect(await prisma.empresa.count({ where: { documento: body.documento } })).toBe(0);
      await expectNoAudit(prisma, { entity: 'Empresa' });
    });

    it('erro do banco (documento duplicado) não audita', async () => {
      const body = novaEmpresa();
      await criar(body);
      await truncateAuditOnly();

      const res = await http().post(BASE).send(body).expect(409);

      expect(res.body).toMatchObject({
        code: 'DUPLICATE',
        details: [{ field: 'documento', message: 'Já existe um registro com este valor' }],
      });
      await expectNoAudit(prisma, { entity: 'Empresa' });
    });

    it('registro inexistente (404) não audita', async () => {
      await http()
        .patch(`${BASE}/00000000-0000-4000-8000-000000000000`)
        .send({ nome: 'X' })
        .expect(404);

      await expectNoAudit(prisma, { entity: 'Empresa' });
    });

    it('id inválido (400 do pipe) não chega ao banco e não audita', async () => {
      await http().patch(`${BASE}/nao-e-uuid`).send({ nome: 'X' }).expect(400);

      await expectNoAudit(prisma, { entity: 'Empresa' });
    });

    it('handler sem id no retorno: desfaz a escrita em vez de gravar sem auditoria', async () => {
      const body = novaEmpresa();
      await http().post(`${BASE}/sem-id`).send(body).expect(500);

      expect(await prisma.empresa.count({ where: { documento: body.documento } })).toBe(0);
      await expectNoAudit(prisma, { entity: 'Empresa' });
    });
  });

  it('credenciais nunca aparecem em before/after', async () => {
    const empresa = await criar();

    await http().patch(`${BASE}/${empresa.id}/credenciais`).expect(200);

    const registro = await expectAudit(prisma, {
      action: 'UPDATE',
      entity: 'Empresa',
      entityId: empresa.id,
      after: { nome: 'Nova', integracao: { ativo: true } },
    });
    const json = JSON.stringify([registro.before, registro.after]);
    expect(json).not.toMatch(/passwordHash|accessToken|clientSecret|senha/);
  });

  it('EXPORT registra os filtros usados, sem transação', async () => {
    await http().get(`${BASE}/exportar?status=ativo&search=abc`).expect(200);

    await expectAudit(prisma, {
      action: 'EXPORT',
      entity: 'Empresa',
      entityId: '*',
      before: null,
      after: { filtros: { status: 'ativo', search: 'abc' } },
    });
  });

  it('AuditService.record fora de HTTP grava "system"', async () => {
    await app.get(AuditService).record({ action: 'CREATE', entity: 'Job', entityId: '1' });

    await expectAudit(prisma, {
      action: 'CREATE',
      entity: 'Job',
      entityId: '1',
      userId: 'system',
    });
    const registro = await prisma.auditLog.findFirstOrThrow({ where: { entity: 'Job' } });
    expect(registro.requestId).toBeNull();
    expect(registro.ip).toBeNull();
  });

  describe('GET /api/auditoria', () => {
    it('lista paginada, mais recentes primeiro, no formato do schema compartilhado', async () => {
      const a = await criar();
      const b = await criar();

      const res = await http().get('/api/auditoria?pageSize=1').expect(200);

      const page = auditLogPageSchema.parse(res.body);
      expect(page.meta).toEqual({ page: 1, pageSize: 1, total: 2, totalPages: 2 });
      expect(page.data[0]?.entityId).toBe(b.id);

      const segunda = auditLogPageSchema.parse(
        (await http().get('/api/auditoria?pageSize=1&page=2').expect(200)).body,
      );
      expect(segunda.data[0]?.entityId).toBe(a.id);
    });

    it('filtra por entidade, id, ação, usuário e período', async () => {
      const empresa = await criar();
      await http().patch(`${BASE}/${empresa.id}`).send({ nome: 'Outro' }).expect(200);
      await criar();

      const porEntidade = await http()
        .get('/api/auditoria')
        .query({ entity: 'Empresa', entityId: empresa.id })
        .expect(200);
      expect(porEntidade.body.meta.total).toBe(2);

      const porAcao = await http()
        .get('/api/auditoria')
        .query({ action: 'UPDATE', userId: 'anonymous' })
        .expect(200);
      expect(porAcao.body.data).toHaveLength(1);
      expect(porAcao.body.data[0].entityId).toBe(empresa.id);

      const futuro = new Date(Date.now() + 60_000).toISOString();
      const porPeriodo = await http().get('/api/auditoria').query({ de: futuro }).expect(200);
      expect(porPeriodo.body.meta.total).toBe(0);
    });

    it('filtro inválido retorna 400 com details por campo', async () => {
      const res = await http()
        .get('/api/auditoria')
        .query({ pageSize: 500, action: 'APAGAR', de: 'ontem' })
        .expect(400);

      expect(res.body).toMatchObject({ statusCode: 400, code: 'VALIDATION_ERROR' });
      const campos = (res.body.details as { field: string }[]).map((d) => d.field).sort();
      expect(campos).toEqual(['action', 'de', 'pageSize']);
    });

    it('não expõe alteração nem exclusão do audit_log', async () => {
      await criar();
      const original = await prisma.auditLog.findFirstOrThrow();
      const { id } = original;

      await http().patch(`/api/auditoria/${id}`).send({}).expect(404);
      await http().delete(`/api/auditoria/${id}`).expect(404);
      await http().post('/api/auditoria').send({}).expect(404);

      expect(await prisma.auditLog.findMany()).toEqual([original]);
    });
  });

  async function truncateAuditOnly() {
    await prisma.$executeRawUnsafe('TRUNCATE TABLE audit_log');
  }
});
