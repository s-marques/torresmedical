import { Writable } from 'node:stream';
import pino from 'pino';
import { REDACT_CENSOR, REDACT_PATHS } from './redact';

function captureLogger() {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _enc, cb) {
      lines.push(chunk.toString());
      cb();
    },
  });
  const logger = pino({ redact: { paths: REDACT_PATHS, censor: REDACT_CENSOR } }, stream);
  const last = () => JSON.parse(lines.at(-1) ?? '{}') as Record<string, unknown>;
  return { logger, last };
}

describe('redaction do logger', () => {
  it('oculta campos pessoais na raiz', () => {
    const { logger, last } = captureLogger();
    logger.info({ cpf: '000.000.000-00', pacienteId: 'p-1' }, 'teste');

    expect(last().cpf).toBe(REDACT_CENSOR);
    expect(last().pacienteId).toBe('p-1');
  });

  it('oculta campos pessoais em até dois níveis', () => {
    const { logger, last } = captureLogger();
    logger.info({ body: { email: 'x@exemplo.com' }, payload: { paciente: { telefone: '1' } } });

    expect(last()).toMatchObject({
      body: { email: REDACT_CENSOR },
      payload: { paciente: { telefone: REDACT_CENSOR } },
    });
  });

  it('oculta authorization e cookie dos headers', () => {
    const { logger, last } = captureLogger();
    logger.info({ req: { headers: { authorization: 'Bearer x', cookie: 'a=b', host: 'api' } } });

    expect(last()).toMatchObject({
      req: { headers: { authorization: REDACT_CENSOR, cookie: REDACT_CENSOR, host: 'api' } },
    });
  });
});
