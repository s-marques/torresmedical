import { Global, Module } from '@nestjs/common';
import { CancelamentosController } from './cancelamentos.controller';
import { CancelamentosService } from './cancelamentos.service';

/**
 * Cancelamentos rastreáveis (issue #162): histórico e motivos padronizados, usados por Agenda,
 * Orçamentos, Negócios, Contas a Receber e a Pagar, Contratos e Bloqueios de sala. Fica em
 * `common` (como a auditoria) para os módulos o usarem sem dependência circular.
 */
@Global()
@Module({
  controllers: [CancelamentosController],
  providers: [CancelamentosService],
  exports: [CancelamentosService],
})
export class CancelamentosModule {}
