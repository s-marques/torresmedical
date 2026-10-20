import { Module } from '@nestjs/common';
import { criarLookupController } from '../../common/lookups/lookup.controller';
import { OrigensClienteController } from './origens-cliente/origens-cliente.controller';
import { OrigensClienteService } from './origens-cliente/origens-cliente.service';
import { PacientesController } from './pacientes/pacientes.controller';
import { PacientesService } from './pacientes/pacientes.service';

/** Módulo COMERCIAL / ATENDIMENTO do inventário. Dono das entidades Paciente/Cliente e Origem de Cliente. */
@Module({
  controllers: [
    criarLookupController('pacientes', PacientesService),
    criarLookupController('origens-cliente', OrigensClienteService),
    OrigensClienteController,
    PacientesController,
  ],
  providers: [PacientesService, OrigensClienteService],
  exports: [PacientesService, OrigensClienteService],
})
export class ComercialAtendimentoModule {}
