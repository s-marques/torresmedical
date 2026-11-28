import { FinanceiroAlertasRegras } from './alertas/financeiro-alertas.regras';
import { ContasReceberLoteFonte } from './contas-receber/contas-receber-lote.fonte';
import { ContasPagarLoteFonte } from './contas-pagar/contas-pagar-lote.fonte';
import { forwardRef, Module } from '@nestjs/common';
import { criarRelatoriosController } from '../../common/relatorios/relatorios.controller';
import { criarLookupController } from '../../common/lookups/lookup.controller';
import { ComercialAtendimentoModule } from '../comercial-atendimento/comercial-atendimento.module';
import { ComprasEstoqueModule } from '../compras-estoque/compras-estoque.module';
import { ConfiguracoesGestaoModule } from '../configuracoes-gestao/configuracoes-gestao.module';
import { GestaoProfissionaisModule } from '../gestao-profissionais/gestao-profissionais.module';
import { RegulatorioQualidadeModule } from '../regulatorio-qualidade/regulatorio-qualidade.module';
import { BandeirasController } from './bandeiras/bandeiras.controller';
import { BandeirasService } from './bandeiras/bandeiras.service';
import { CaixasController } from './caixas/caixas.controller';
import { CaixasService } from './caixas/caixas.service';
import { CentrosCustoController } from './centros-custo/centros-custo.controller';
import { CentrosCustoService } from './centros-custo/centros-custo.service';
import { ConciliacaoController } from './conciliacao/conciliacao.controller';
import { ConciliacaoService } from './conciliacao/conciliacao.service';
import { ContasBancariasController } from './contas-bancarias/contas-bancarias.controller';
import { ContasBancariasService } from './contas-bancarias/contas-bancarias.service';
import { ContasPagarController } from './contas-pagar/contas-pagar.controller';
import { ContasPagarDivergenciasService } from './contas-pagar/contas-pagar-divergencias.service';
import { ContasPagarDuplicidadeService } from './contas-pagar/contas-pagar-duplicidade.service';
import { ContasPagarService } from './contas-pagar/contas-pagar.service';
import { ContasReceberController } from './contas-receber/contas-receber.controller';
import { ContasReceberService } from './contas-receber/contas-receber.service';
import { InadimplenciaAgendador } from './inadimplencia/inadimplencia.agendador';
import { InadimplenciaController } from './inadimplencia/inadimplencia.controller';
import { InadimplenciaService } from './inadimplencia/inadimplencia.service';
import { ReguaCobrancaService } from './inadimplencia/regua-cobranca.service';
import { IndicadoresFinanceirosController } from './indicadores/indicadores.controller';
import { IndicadoresFinanceirosService } from './indicadores/indicadores.service';
import { FormasPagamentoController } from './formas-pagamento/formas-pagamento.controller';
import { FormasPagamentoService } from './formas-pagamento/formas-pagamento.service';
import { PlanoContasController } from './plano-contas/plano-contas.controller';
import { PlanoContasService } from './plano-contas/plano-contas.service';
import { RelatoriosFinanceiro } from './relatorios/relatorios-financeiro';

/** Módulo FINANCEIRO do inventário. Dono das entidades Forma de Pagamento e Bandeira. */
@Module({
  imports: [
    forwardRef(() => ComprasEstoqueModule),
    forwardRef(() => GestaoProfissionaisModule),
    forwardRef(() => ConfiguracoesGestaoModule),
    forwardRef(() => ComercialAtendimentoModule),
    RegulatorioQualidadeModule,
  ],
  controllers: [
    FormasPagamentoController,
    BandeirasController,
    CaixasController,
    CentrosCustoController,
    PlanoContasController,
    ContasBancariasController,
    ContasPagarController,
    ContasReceberController,
    ConciliacaoController,
    IndicadoresFinanceirosController,
    InadimplenciaController,
    criarLookupController('formas-pagamento', FormasPagamentoService),
    criarLookupController('centros-custo', CentrosCustoService),
    criarRelatoriosController('financeiro.relatorios', RelatoriosFinanceiro),
  ],
  providers: [
    ContasReceberLoteFonte,
    ContasPagarLoteFonte,
    FormasPagamentoService,
    BandeirasService,
    CaixasService,
    CentrosCustoService,
    PlanoContasService,
    ContasBancariasService,
    ContasPagarService,
    ContasPagarDuplicidadeService,
    ContasPagarDivergenciasService,
    ContasReceberService,
    ConciliacaoService,
    IndicadoresFinanceirosService,
    InadimplenciaService,
    ReguaCobrancaService,
    InadimplenciaAgendador,
    FinanceiroAlertasRegras,
    RelatoriosFinanceiro,
  ],
  exports: [
    // Regras de alerta de contas a pagar e a receber: central de notificações (#160).
    FinanceiroAlertasRegras,
    FormasPagamentoService,
    PlanoContasService,
    ContasReceberService,
    IndicadoresFinanceirosService,
    // Painel "Hoje" (#170): total vencido.
    InadimplenciaService,
    // Receita, provisão e despesa por centro de custo no relatório mensal da gestão (#171).
    RelatoriosFinanceiro,
  ],
})
export class FinanceiroModule {}
