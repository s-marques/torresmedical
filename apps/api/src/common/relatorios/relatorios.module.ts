import { Global, Module } from '@nestjs/common';
import { RelatoriosService } from './relatorios.service';

/** Infraestrutura das telas de Relatórios. Cada módulo registra o seu `criarRelatoriosController`. */
@Global()
@Module({
  providers: [RelatoriosService],
  exports: [RelatoriosService],
})
export class RelatoriosModule {}
