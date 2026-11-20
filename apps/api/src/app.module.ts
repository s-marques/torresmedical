import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { AuditModule } from './common/audit/audit.module';
import { AuthModule } from './common/auth/auth.module';
import { CryptoModule } from './common/crypto/crypto.module';
import { RequestContextModule } from './common/context/request-context.module';
import { AllExceptionsFilter } from './common/errors/all-exceptions.filter';
import { ExportModule } from './common/export/export.module';
import { LoggerModule } from './common/logger/logger.module';
import { MessagingModule } from './common/messaging/messaging.module';
import { PrismaModule } from './common/prisma/prisma.module';
import { RelatoriosModule } from './common/relatorios/relatorios.module';
import { StorageModule } from './common/storage/storage.module';
import { HealthModule } from './health/health.module';
import { ComercialAtendimentoModule } from './modules/comercial-atendimento/comercial-atendimento.module';
import { ComprasEstoqueModule } from './modules/compras-estoque/compras-estoque.module';
import { ConfiguracoesGestaoModule } from './modules/configuracoes-gestao/configuracoes-gestao.module';
import { ConsultorioAssistencialModule } from './modules/consultorio-assistencial/consultorio-assistencial.module';
import { FinanceiroModule } from './modules/financeiro/financeiro.module';
import { GestaoProfissionaisModule } from './modules/gestao-profissionais/gestao-profissionais.module';
import { PainelModule } from './modules/painel/painel.module';
import { PatrimonioPessoalModule } from './modules/patrimonio-pessoal/patrimonio-pessoal.module';
import { RegulatorioQualidadeModule } from './modules/regulatorio-qualidade/regulatorio-qualidade.module';

@Module({
  imports: [
    RequestContextModule,
    LoggerModule,
    PrismaModule,
    AuditModule,
    AuthModule,
    MessagingModule,
    // Tarefas periódicas (ex.: agendador de campanhas).
    ScheduleModule.forRoot(),
    ExportModule,
    CryptoModule,
    RelatoriosModule,
    StorageModule,
    HealthModule,
    PainelModule,
    ComercialAtendimentoModule,
    ConsultorioAssistencialModule,
    GestaoProfissionaisModule,
    FinanceiroModule,
    PatrimonioPessoalModule,
    ComprasEstoqueModule,
    RegulatorioQualidadeModule,
    ConfiguracoesGestaoModule,
  ],
  providers: [{ provide: APP_FILTER, useClass: AllExceptionsFilter }],
})
export class AppModule {}
