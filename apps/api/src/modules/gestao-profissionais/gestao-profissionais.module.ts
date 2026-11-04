import { forwardRef, Module } from '@nestjs/common';
import { ComercialAtendimentoModule } from '../comercial-atendimento/comercial-atendimento.module';
import { ComprasEstoqueModule } from '../compras-estoque/compras-estoque.module';
import { FinanceiroModule } from '../financeiro/financeiro.module';
import { criarLookupController } from '../../common/lookups/lookup.controller';
import { EspecialidadesController } from './especialidades/especialidades.controller';
import { EspecialidadesService } from './especialidades/especialidades.service';
import { ContratosSalaController } from './salas/contratos-sala.controller';
import { ContratosSalaHorasController } from './salas/contratos-sala-horas.controller';
import { ContratosSalaHorasService } from './salas/contratos-sala-horas.service';
import { ContratosSalaService } from './salas/contratos-sala.service';
import { SALA_EM_USO_VERIFICADORES } from './salas/sala-em-uso';
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
import { ProfissionalAgendaService } from './profissionais/profissional-agenda.service';
import { ProfissionaisController } from './profissionais/profissionais.controller';
import { ProfissionaisService } from './profissionais/profissionais.service';

/** Módulo GESTÃO PROFISSIONAIS do inventário. Dono das entidades Profissional e Especialidade. */
@Module({
  imports: [forwardRef(() => ComercialAtendimentoModule), FinanceiroModule, ComprasEstoqueModule],
  controllers: [
    criarLookupController('profissionais', ProfissionaisService),
    criarLookupController('especialidades', EspecialidadesService),
    ProfissionaisController,
    EspecialidadesController,
    ServicosProfissionaisController,
    ProtocolosController,
    ProtocolosMaeController,
    SalasPainelController,
    SalasController,
    ContratosSalaController,
    ContratosSalaHorasController,
  ],
  providers: [
    ProfissionaisService,
    EspecialidadesService,
    ProfissionalAgendaService,
    ServicosProfissionaisService,
    ProtocolosService,
    ProtocolosMaeService,
    SalasService,
    SalasPainelService,
    ContratosSalaService,
    ContratosSalaHorasService,
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
  ],
})
export class GestaoProfissionaisModule {}
