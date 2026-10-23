import { forwardRef, Module } from '@nestjs/common';
import { criarLookupController } from '../../common/lookups/lookup.controller';
import { ConfiguracoesGestaoModule } from '../configuracoes-gestao/configuracoes-gestao.module';
import { GestaoProfissionaisModule } from '../gestao-profissionais/gestao-profissionais.module';
import { AgendaController } from './agenda/agenda.controller';
import { AgendaService } from './agenda/agenda.service';
import { OrigensClienteController } from './origens-cliente/origens-cliente.controller';
import { OrigensClienteService } from './origens-cliente/origens-cliente.service';
import { PacientesController } from './pacientes/pacientes.controller';
import { PacientesService } from './pacientes/pacientes.service';

/** Módulo COMERCIAL / ATENDIMENTO do inventário. Dono das entidades Paciente/Cliente, Origem de Cliente e Agendamento. */
@Module({
  // Profissional pertence a gestao-profissionais, que por sua vez usa Paciente daqui.
  imports: [forwardRef(() => GestaoProfissionaisModule), ConfiguracoesGestaoModule],
  controllers: [
    AgendaController,
    criarLookupController('pacientes', PacientesService),
    criarLookupController('origens-cliente', OrigensClienteService),
    OrigensClienteController,
    PacientesController,
  ],
  providers: [PacientesService, OrigensClienteService, AgendaService],
  exports: [PacientesService, OrigensClienteService],
})
export class ComercialAtendimentoModule {}
