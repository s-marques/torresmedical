import { Module } from '@nestjs/common';
import { criarLookupController } from '../../common/lookups/lookup.controller';
import { PacientesService } from './pacientes/pacientes.service';

/** Módulo COMERCIAL / ATENDIMENTO do inventário. Dono da entidade Paciente/Cliente. */
@Module({
  controllers: [criarLookupController('pacientes', PacientesService)],
  providers: [PacientesService],
  exports: [PacientesService],
})
export class ComercialAtendimentoModule {}
