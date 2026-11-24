import { forwardRef, Module } from '@nestjs/common';
import { ConsultorioAssistencialModule } from '../consultorio-assistencial/consultorio-assistencial.module';
import { ComercialAtendimentoModule } from '../comercial-atendimento/comercial-atendimento.module';
import { ComprasEstoqueModule } from '../compras-estoque/compras-estoque.module';
import { ConfiguracoesGestaoModule } from '../configuracoes-gestao/configuracoes-gestao.module';
import { FinanceiroModule } from '../financeiro/financeiro.module';
import { criarLookupController } from '../../common/lookups/lookup.controller';
import { EspecialidadesController } from './especialidades/especialidades.controller';
import { EspecialidadesService } from './especialidades/especialidades.service';
import { ContratosSalaAssinaturaController } from './salas/contratos-sala-assinatura.controller';
import { ContratosSalaAssinaturaService } from './salas/contratos-sala-assinatura.service';
import { ContratosSalaController } from './salas/contratos-sala.controller';
import { ContratosSalaCobrancaController } from './salas/contratos-sala-cobranca.controller';
import { ContratosSalaCobrancaService } from './salas/contratos-sala-cobranca.service';
import { ContratosSalaHorasController } from './salas/contratos-sala-horas.controller';
import { ContratosSalaHorasService } from './salas/contratos-sala-horas.service';
import { ContratosSalaService } from './salas/contratos-sala.service';
import { SALA_EM_USO_VERIFICADORES } from './salas/sala-em-uso';
import { SalasBloqueiosController } from './salas/salas-bloqueios.controller';
import { SalasBloqueiosService } from './salas/salas-bloqueios.service';
import { SalasController } from './salas/salas.controller';
import { SalasPainelController } from './salas/salas-painel.controller';
import { SalasPainelService } from './salas/salas-painel.service';
import { SalasService } from './salas/salas.service';
import {
  SERVICO_EM_USO_VERIFICADORES,
  type ServicoEmUsoVerificador,
} from './servicos-profissionais/servico-em-uso';
import { ServicosProfissionaisController } from './servicos-profissionais/servicos-profissionais.controller';
import { ServicosProfissionaisService } from './servicos-profissionais/servicos-profissionais.service';
import { ProtocolosController } from './protocolos/protocolos.controller';
import { ProtocolosService } from './protocolos/protocolos.service';
import { ProtocolosMaeController } from './protocolos-mae/protocolos-mae.controller';
import { ProtocolosMaeService } from './protocolos-mae/protocolos-mae.service';
import { ReceitaProfissionaisController } from './receita-profissionais/receita-profissionais.controller';
import { ReceitaProfissionaisService } from './receita-profissionais/receita-profissionais.service';
import { ProfissionaisDocumentosController } from './profissionais/profissionais-documentos.controller';
import { ProfissionaisDocumentosService } from './profissionais/profissionais-documentos.service';
import { ProfissionaisOnboardingController } from './profissionais/profissionais-onboarding.controller';
import { ProfissionaisOnboardingService } from './profissionais/profissionais-onboarding.service';
import { ProfissionalAgendaService } from './profissionais/profissional-agenda.service';
import { ProfissionaisController } from './profissionais/profissionais.controller';
import { ProfissionaisService } from './profissionais/profissionais.service';

/** Módulo GESTÃO PROFISSIONAIS do inventário. Dono das entidades Profissional e Especialidade. */
@Module({
  imports: [
    forwardRef(() => ComercialAtendimentoModule),
    forwardRef(() => FinanceiroModule),
    forwardRef(() => ConfiguracoesGestaoModule),
    forwardRef(() => ComprasEstoqueModule),
    // Lê os atendimentos para a etapa "Primeiro atendimento" do onboarding (#142).
    forwardRef(() => ConsultorioAssistencialModule),
  ],
  controllers: [
    criarLookupController('profissionais', ProfissionaisService),
    criarLookupController('especialidades', EspecialidadesService),
    criarLookupController('salas', SalasService),
    ProfissionaisController,
    ProfissionaisDocumentosController,
    ProfissionaisOnboardingController,
    EspecialidadesController,
    ServicosProfissionaisController,
    ProtocolosController,
    ProtocolosMaeController,
    SalasPainelController,
    SalasController,
    ContratosSalaController,
    ContratosSalaAssinaturaController,
    ContratosSalaCobrancaController,
    ContratosSalaHorasController,
    ReceitaProfissionaisController,
    SalasBloqueiosController,
  ],
  providers: [
    ProfissionaisService,
    EspecialidadesService,
    ProfissionalAgendaService,
    ProfissionaisDocumentosService,
    ProfissionaisOnboardingService,
    ServicosProfissionaisService,
    ProtocolosService,
    ProtocolosMaeService,
    SalasService,
    SalasPainelService,
    ContratosSalaService,
    ContratosSalaCobrancaService,
    ContratosSalaAssinaturaService,
    ContratosSalaHorasService,
    ReceitaProfissionaisService,
    SalasBloqueiosService,
    // Sala com contrato não pode ser excluída.
    {
      provide: SALA_EM_USO_VERIFICADORES,
      useFactory: (contratos: ContratosSalaService) => [contratos],
      inject: [ContratosSalaService],
    },
    // Nenhum cadastro referencia serviços ainda; módulos futuros acrescentam o seu verificador.
    { provide: SERVICO_EM_USO_VERIFICADORES, useValue: [] as ServicoEmUsoVerificador[] },
  ],
  exports: [
    ProfissionaisService,
    EspecialidadesService,
    ServicosProfissionaisService,
    ProtocolosService,
    ProtocolosMaeService,
    SalasService,
    // Bloqueios de sala e horários do profissional: a Agenda (#136) consulta antes de agendar.
    SalasBloqueiosService,
    ProfissionalAgendaService,
    // Documentos e alertas de vencimento: onboarding (#142) e central de notificações (#160).
    ProfissionaisDocumentosService,
    // Contratos ativos: Agenda matricial (#137) e profissionais que permitem indicação (#146).
    ContratosSalaService,
    // Receita recorrente dos Indicadores do Financeiro.
    ContratosSalaCobrancaService,
    // Relatório GES-03 (Ocupação por Sala) de Configurações / Gestão.
    SalasPainelService,
  ],
})
export class GestaoProfissionaisModule {}
