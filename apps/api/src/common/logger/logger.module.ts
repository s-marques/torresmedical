import { Module, RequestMethod } from '@nestjs/common';
import { LoggerModule as PinoLoggerModule } from 'nestjs-pino';
import { resolveRequestId } from '../context/request-id';
import { REDACT_CENSOR, REDACT_PATHS } from './redact';

const isDev = process.env.NODE_ENV === 'development';

@Module({
  imports: [
    PinoLoggerModule.forRoot({
      // Sintaxe de curinga do Express 5 (o padrão '*' do nestjs-pino gera aviso).
      forRoutes: [{ path: '{*path}', method: RequestMethod.ALL }],
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? 'info',
        genReqId: (req, res) => resolveRequestId(req, res),
        customAttributeKeys: { reqId: 'requestId' },
        redact: { paths: REDACT_PATHS, censor: REDACT_CENSOR },
        // O health é chamado a cada poucos segundos pelo healthcheck do Docker.
        autoLogging: { ignore: (req) => req.url === '/api/health' },
        transport: isDev ? { target: 'pino-pretty', options: { singleLine: true } } : undefined,
      },
    }),
  ],
})
export class LoggerModule {}
