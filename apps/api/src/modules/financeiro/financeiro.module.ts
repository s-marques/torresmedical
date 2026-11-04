import { Module } from '@nestjs/common';
import { criarLookupController } from '../../common/lookups/lookup.controller';
import { BandeirasController } from './bandeiras/bandeiras.controller';
import { BandeirasService } from './bandeiras/bandeiras.service';
import { CaixasController } from './caixas/caixas.controller';
import { CaixasService } from './caixas/caixas.service';
import { FormasPagamentoController } from './formas-pagamento/formas-pagamento.controller';
import { FormasPagamentoService } from './formas-pagamento/formas-pagamento.service';
import { PlanoContasController } from './plano-contas/plano-contas.controller';
import { PlanoContasService } from './plano-contas/plano-contas.service';

/** Módulo FINANCEIRO do inventário. Dono das entidades Forma de Pagamento e Bandeira. */
@Module({
  controllers: [
    FormasPagamentoController,
    BandeirasController,
    CaixasController,
    PlanoContasController,
    criarLookupController('formas-pagamento', FormasPagamentoService),
  ],
  providers: [FormasPagamentoService, BandeirasService, CaixasService, PlanoContasService],
  exports: [FormasPagamentoService],
})
export class FinanceiroModule {}
