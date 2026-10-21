import { Module } from '@nestjs/common';
import { criarLookupController } from '../../common/lookups/lookup.controller';
import { EspecialidadesController } from './especialidades/especialidades.controller';
import { EspecialidadesService } from './especialidades/especialidades.service';
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
  ],
  providers: [ProfissionaisService, EspecialidadesService, ProfissionalAgendaService],
  exports: [ProfissionaisService, EspecialidadesService],
})
export class GestaoProfissionaisModule {}
