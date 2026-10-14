import { Global, Module } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ClsModule } from 'nestjs-cls';
import { prismaTransactionalPlugin } from '../prisma/prisma-transaction';
import { RequestContextService } from './request-context.service';
import { resolveRequestId } from './request-id';

@Global()
@Module({
  imports: [
    ClsModule.forRoot({
      global: true,
      middleware: {
        mount: true,
        generateId: true,
        idGenerator: (req: Request) => resolveRequestId(req),
        setup: (cls, req: Request, res: Response) => {
          resolveRequestId(req, res);
          cls.set('ip', req.ip);
        },
      },
      plugins: [prismaTransactionalPlugin()],
    }),
  ],
  providers: [RequestContextService],
  exports: [RequestContextService],
})
export class RequestContextModule {}
