import type { INestApplication } from '@nestjs/common';
import { apiErrorSchema } from '@torres/shared';
import request from 'supertest';
import { REQUEST_ID_HEADER } from '../src/common/context/request-id';
import { ErrorsFixtureModule } from './fixtures/errors-fixture.module';
import { createE2eApp } from './utils/create-e2e-app';

describe('Formato padrão de erros e Swagger (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createE2eApp({ imports: [ErrorsFixtureModule] });
  });

  afterAll(async () => {
    await app.close();
  });

  function http() {
    return request(app.getHttpServer());
  }

  it('rota inexistente: 404 em português com requestId', async () => {
    const res = await http().get('/api/nao-existe').set(REQUEST_ID_HEADER, 'req-404').expect(404);

    expect(apiErrorSchema.parse(res.body)).toEqual({
      statusCode: 404,
      code: 'NOT_FOUND',
      message: 'Recurso não encontrado',
      requestId: 'req-404',
    });
  });

  it('erro inesperado: 500 sem stack nem mensagem interna', async () => {
    const res = await http().get('/api/test-fixtures/erros/inesperado').expect(500);

    expect(res.body).toEqual({
      statusCode: 500,
      code: 'INTERNAL_ERROR',
      message: 'Erro interno. Tente novamente mais tarde',
      requestId: expect.any(String),
    });
    expect(JSON.stringify(res.body)).not.toMatch(/123\.456|stack|at /);
  });

  it('erro de SQL: 500 sem expor o SQL', async () => {
    const res = await http().get('/api/test-fixtures/erros/sql').expect(500);

    expect(res.body.code).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(res.body)).not.toMatch(/tabela_que_nao_existe|SELECT/);
  });

  it('P2025 do Prisma: 404 NOT_FOUND', async () => {
    const res = await http().get('/api/test-fixtures/erros/registro-inexistente').expect(404);

    expect(res.body).toMatchObject({ code: 'NOT_FOUND', message: 'Registro não encontrado' });
  });

  it('documentação em /api/docs com os endpoints de unidades', async () => {
    await http().get('/api/docs').expect(200).expect('content-type', /html/);
    const res = await http().get('/api/docs/json').expect(200);

    expect(Object.keys(res.body.paths)).toEqual(
      expect.arrayContaining([
        '/api/configuracoes-gestao/unidades',
        '/api/configuracoes-gestao/unidades/export',
        '/api/configuracoes-gestao/unidades/{id}',
        '/api/auditoria',
      ]),
    );
    const list = res.body.paths['/api/configuracoes-gestao/unidades'].get;
    expect(list.parameters.map((p: { name: string }) => p.name)).toEqual(
      expect.arrayContaining(['page', 'pageSize', 'sort', 'search', 'status', 'empresaId']),
    );
    expect(Object.keys(list.responses)).toEqual(expect.arrayContaining(['200', '400']));
  });
});
