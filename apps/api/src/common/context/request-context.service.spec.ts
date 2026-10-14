import { Test } from '@nestjs/testing';
import { CLS_ID, ClsModule, ClsService } from 'nestjs-cls';
import { RequestContextService } from './request-context.service';

describe('RequestContextService', () => {
  let service: RequestContextService;
  let cls: ClsService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ClsModule.forRoot({ global: true })],
      providers: [RequestContextService],
    }).compile();

    service = moduleRef.get(RequestContextService);
    cls = moduleRef.get(ClsService);
  });

  it('retorna undefined fora de uma requisição', () => {
    expect(service.getRequestId()).toBeUndefined();
    expect(service.getUserId()).toBeUndefined();
    expect(service.getIp()).toBeUndefined();
  });

  it('expõe requestId e userId dentro do contexto', async () => {
    await cls.run(async () => {
      cls.set(CLS_ID, 'req-1');
      service.setUserId('user-1');

      expect(service.getRequestId()).toBe('req-1');
      expect(service.getUserId()).toBe('user-1');
    });
  });

  it('expõe o ip gravado pelo middleware', async () => {
    await cls.run(async () => {
      cls.set('ip', '10.0.0.1');

      expect(service.getIp()).toBe('10.0.0.1');
    });
  });
});
