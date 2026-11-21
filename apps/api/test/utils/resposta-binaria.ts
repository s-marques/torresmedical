import type request from 'supertest';

/** Lê o corpo da resposta como `Buffer` (exportações xlsx/pdf). */
export function respostaBinaria(req: request.Test): request.Test {
  return req.buffer(true).parse((res, callback) => {
    const chunks: Buffer[] = [];
    res.on('data', (chunk: Buffer) => chunks.push(chunk));
    res.on('end', () => callback(null, Buffer.concat(chunks)));
  });
}
