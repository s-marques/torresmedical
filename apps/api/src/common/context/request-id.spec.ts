import type { IncomingMessage, ServerResponse } from 'node:http';
import { REQUEST_ID_HEADER, resolveRequestId } from './request-id';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function fakeReq(headers: Record<string, string | string[]> = {}): IncomingMessage {
  return { headers } as unknown as IncomingMessage;
}

function fakeRes(): ServerResponse & { setHeader: jest.Mock } {
  return { headersSent: false, setHeader: jest.fn() } as unknown as ServerResponse & {
    setHeader: jest.Mock;
  };
}

describe('resolveRequestId', () => {
  it('gera um uuid quando o header não vem', () => {
    expect(resolveRequestId(fakeReq())).toMatch(UUID);
  });

  it('reaproveita um x-request-id válido', () => {
    expect(resolveRequestId(fakeReq({ [REQUEST_ID_HEADER]: 'abc-123' }))).toBe('abc-123');
  });

  it('usa o primeiro valor quando o header vem repetido', () => {
    expect(resolveRequestId(fakeReq({ [REQUEST_ID_HEADER]: ['id-1', 'id-2'] }))).toBe('id-1');
  });

  it('descarta x-request-id inválido', () => {
    const id = resolveRequestId(fakeReq({ [REQUEST_ID_HEADER]: 'quebra\nde linha' }));
    expect(id).toMatch(UUID);
  });

  it('retorna o mesmo id em chamadas repetidas na mesma requisição', () => {
    const req = fakeReq();
    expect(resolveRequestId(req)).toBe(resolveRequestId(req));
  });

  it('devolve o id no header da resposta', () => {
    const res = fakeRes();
    const id = resolveRequestId(fakeReq(), res);
    expect(res.setHeader).toHaveBeenCalledWith(REQUEST_ID_HEADER, id);
  });

  it('não altera headers já enviados', () => {
    const res = fakeRes();
    (res as { headersSent: boolean }).headersSent = true;
    resolveRequestId(fakeReq(), res);
    expect(res.setHeader).not.toHaveBeenCalled();
  });
});
