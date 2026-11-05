import { Module } from '@nestjs/common';
import { criarLookupController } from '../../common/lookups/lookup.controller';
import { ComprasEstoqueModule } from '../compras-estoque/compras-estoque.module';
import { RegulatorioQualidadeModule } from '../regulatorio-qualidade/regulatorio-qualidade.module';
import { BandeirasController } from './bandeiras/bandeiras.controller';
import { BandeirasService } from './bandeiras/bandeiras.service';
import { CaixasController } from './caixas/caixas.controller';
import { CaixasService } from './caixas/caixas.service';
import { ContasBancariasController } from './contas-bancarias/contas-bancarias.controller';
import { ContasBancariasService } from './contas-bancarias/contas-bancarias.service';
import { ContasPagarController } from './contas-pagar/contas-pagar.controller';
import { ContasPagarService } from './contas-pagar/contas-pagar.service';
import { FormasPagamentoController } from './formas-pagamento/formas-pagamento.controller';
import { FormasPagamentoService } from './formas-pagamento/formas-pagamento.service';
import { PlanoContasController } from './plano-contas/plano-contas.controller';
import { PlanoContasService } from './plano-contas/plano-contas.service';

/** Módulo FINANCEIRO do inventário. Dono das entidades Forma de Pagamento e Bandeira. */
@Module({
  imports: [ComprasEstoqueModule, RegulatorioQualidadeModule],
  controllers: [
    FormasPagamentoController,
    BandeirasController,
    CaixasController,
    PlanoContasController,
    ContasBancariasController,
    ContasPagarController,
    criarLookupController('formas-pagamento', FormasPagamentoService),
  ],
  providers: [
    FormasPagamentoService,
    BandeirasService,
    CaixasService,
    PlanoContasService,
    ContasBancariasService,
    ContasPagarService,
  ],
  exports: [FormasPagamentoService],
})
export class FinanceiroModule {}
