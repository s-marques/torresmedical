import { Module } from '@nestjs/common';
import { criarLookupController } from '../../common/lookups/lookup.controller';
import { BandeirasController } from './bandeiras/bandeiras.controller';
import { BandeirasService } from './bandeiras/bandeiras.service';
import { CaixasController } from './caixas/caixas.controller';
import { CaixasService } from './caixas/caixas.service';
import { FormasPagamentoController } from './formas-pagamento/formas-pagamento.controller';
import { FormasPagamentoService } from './formas-pagamento/formas-pagamento.service';

/** Módulo FINANCEIRO do inventário. Dono das entidades Forma de Pagamento e Bandeira. */
@Module({
  controllers: [
    FormasPagamentoController,
    BandeirasController,
    CaixasController,
    criarLookupController('formas-pagamento', FormasPagamentoService),
  ],
  providers: [FormasPagamentoService, BandeirasService, CaixasService],
  exports: [FormasPagamentoService],
})
export class FinanceiroModule {}
