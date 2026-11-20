import { Module } from '@nestjs/common';
import { ComercialAtendimentoModule } from '../comercial-atendimento/comercial-atendimento.module';
import { FinanceiroModule } from '../financeiro/financeiro.module';
import { GestaoProfissionaisModule } from '../gestao-profissionais/gestao-profissionais.module';
import { DashboardController } from './dashboard/dashboard.controller';
import { DashboardService } from './dashboard/dashboard.service';

/** Módulo PAINEL do inventário. Só consome dados dos outros módulos, por services exportados. */
@Module({
  imports: [ComercialAtendimentoModule, FinanceiroModule, GestaoProfissionaisModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class PainelModule {}
