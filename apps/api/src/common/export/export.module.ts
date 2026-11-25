import { Global, Module } from '@nestjs/common';
import { ExportacaoLoteFontes } from './exportacao-lote.fontes';
import { ExportService } from './export.service';

@Global()
@Module({
  providers: [ExportService, ExportacaoLoteFontes],
  exports: [ExportService, ExportacaoLoteFontes],
})
export class ExportModule {}
