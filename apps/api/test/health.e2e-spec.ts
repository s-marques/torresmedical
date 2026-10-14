import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { healthResponseSchema } from '@torres/shared';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { REQUEST_ID_HEADER } from '../src/common/context/request-id';
import { setupApp } from '../src/setup-app';

describe('GET /api/health (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    setupApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('responde 200 no formato do schema compartilhado', async () => {
    const res = await request(app.getHttpServer()).get('/api/health').expect(200);

    expect(healthResponseSchema.parse(res.body).status).toBe('ok');
  });

  it('gera um x-request-id quando o cliente não envia', async () => {
    const res = await request(app.getHttpServer()).get('/api/health').expect(200);

    expect(res.headers[REQUEST_ID_HEADER]).toEqual(expect.any(String));
  });

  it('propaga o x-request-id recebido', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/health')
      .set(REQUEST_ID_HEADER, 'teste-123')
      .expect(200);

    expect(res.headers[REQUEST_ID_HEADER]).toBe('teste-123');
  });

  it('não expõe a rota fora do prefixo /api', async () => {
    await request(app.getHttpServer()).get('/health').expect(404);
  });
});
