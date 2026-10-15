import { Module } from '@nestjs/common';
import { criarLookupController } from '../../common/lookups/lookup.controller';
import { FormasPagamentoService } from './formas-pagamento/formas-pagamento.service';

/** Módulo FINANCEIRO do inventário. Dono da entidade Forma de Pagamento. */
@Module({
  controllers: [criarLookupController('formas-pagamento', FormasPagamentoService)],
  providers: [FormasPagamentoService],
  exports: [FormasPagamentoService],
})
export class FinanceiroModule {}
