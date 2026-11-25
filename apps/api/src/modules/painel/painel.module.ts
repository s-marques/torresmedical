import { Module } from '@nestjs/common';
import { ALERTA_REGRAS } from '../../common/alertas/alerta-regra';
import { ComercialAtendimentoModule } from '../comercial-atendimento/comercial-atendimento.module';
import { ConfiguracoesGestaoModule } from '../configuracoes-gestao/configuracoes-gestao.module';
import { FinanceiroAlertasRegras } from '../financeiro/alertas/financeiro-alertas.regras';
import { FinanceiroModule } from '../financeiro/financeiro.module';
import { GestaoProfissionaisModule } from '../gestao-profissionais/gestao-profissionais.module';
import { AlertasAgendador } from './alertas/alertas.agendador';
import { AlertasController } from './alertas/alertas.controller';
import { AlertasService } from './alertas/alertas.service';
import { DashboardController } from './dashboard/dashboard.controller';
import { DashboardService } from './dashboard/dashboard.service';
import { OcupacaoService } from './ocupacao/ocupacao.service';

/** Módulo PAINEL do inventário. Só consome dados dos outros módulos, por services exportados. */
@Module({
  imports: [
    ComercialAtendimentoModule,
    ConfiguracoesGestaoModule,
    FinanceiroModule,
    GestaoProfissionaisModule,
  ],
  controllers: [DashboardController, AlertasController],
  providers: [
    DashboardService,
    OcupacaoService,
    AlertasService,
    AlertasAgendador,
    // Regras da central de notificações (#160): cada módulo dono do dado contribui com as suas.
    {
      provide: ALERTA_REGRAS,
      useFactory: (financeiro: FinanceiroAlertasRegras) => [...financeiro.regras()],
      inject: [FinanceiroAlertasRegras],
    },
  ],
})
export class PainelModule {}
