import { Module } from '@nestjs/common';
import { criarLookupController } from '../../common/lookups/lookup.controller';
import { EspecialidadesController } from './especialidades/especialidades.controller';
import { EspecialidadesService } from './especialidades/especialidades.service';
import {
  SERVICO_EM_USO_VERIFICADORES,
  type ServicoEmUsoVerificador,
} from './servicos-profissionais/servico-em-uso';
import { ServicosProfissionaisController } from './servicos-profissionais/servicos-profissionais.controller';
import { ServicosProfissionaisService } from './servicos-profissionais/servicos-profissionais.service';
import { ProfissionalAgendaService } from './profissionais/profissional-agenda.service';
import { ProfissionaisController } from './profissionais/profissionais.controller';
import { ProfissionaisService } from './profissionais/profissionais.service';

/** Módulo GESTÃO PROFISSIONAIS do inventário. Dono das entidades Profissional e Especialidade. */
@Module({
  controllers: [
    criarLookupController('profissionais', ProfissionaisService),
    criarLookupController('especialidades', EspecialidadesService),
    ProfissionaisController,
    EspecialidadesController,
    ServicosProfissionaisController,
  ],
  providers: [
    ProfissionaisService,
    EspecialidadesService,
    ProfissionalAgendaService,
    ServicosProfissionaisService,
    // Nenhum cadastro referencia serviços ainda; módulos futuros acrescentam o seu verificador.
    { provide: SERVICO_EM_USO_VERIFICADORES, useValue: [] as ServicoEmUsoVerificador[] },
  ],
  exports: [ProfissionaisService, EspecialidadesService, ServicosProfissionaisService],
})
export class GestaoProfissionaisModule {}
