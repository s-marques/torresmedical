import { Global, Module } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ClsModule } from 'nestjs-cls';
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
        setup: (_cls, req: Request, res: Response) => {
          resolveRequestId(req, res);
        },
      },
    }),
  ],
  providers: [RequestContextService],
  exports: [RequestContextService],
})
export class RequestContextModule {}
