import { Module } from '@nestjs/common';
import { ComercialAtendimentoModule } from '../comercial-atendimento/comercial-atendimento.module';
import { ConfiguracoesGestaoModule } from '../configuracoes-gestao/configuracoes-gestao.module';
import { FinanceiroModule } from '../financeiro/financeiro.module';
import { GestaoProfissionaisModule } from '../gestao-profissionais/gestao-profissionais.module';
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
  controllers: [DashboardController],
  providers: [DashboardService, OcupacaoService],
})
export class PainelModule {}
