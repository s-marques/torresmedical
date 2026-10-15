import { Module } from '@nestjs/common';
import { criarLookupController } from '../../common/lookups/lookup.controller';
import { EspecialidadesService } from './especialidades/especialidades.service';
import { ProfissionaisService } from './profissionais/profissionais.service';

/** Módulo GESTÃO PROFISSIONAIS do inventário. Dono das entidades Profissional e Especialidade. */
@Module({
  controllers: [
    criarLookupController('profissionais', ProfissionaisService),
    criarLookupController('especialidades', EspecialidadesService),
  ],
  providers: [ProfissionaisService, EspecialidadesService],
  exports: [ProfissionaisService, EspecialidadesService],
})
export class GestaoProfissionaisModule {}
