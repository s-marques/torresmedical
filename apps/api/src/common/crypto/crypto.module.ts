import { Global, Module } from '@nestjs/common';
import { SegredosService } from './segredos.service';

@Global()
@Module({
  providers: [{ provide: SegredosService, useFactory: () => new SegredosService() }],
  exports: [SegredosService],
})
export class CryptoModule {}
