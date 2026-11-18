import { Module } from '@nestjs/common';
import { ComercialAtendimentoModule } from '../comercial-atendimento/comercial-atendimento.module';
import { GestaoProfissionaisModule } from '../gestao-profissionais/gestao-profissionais.module';
import { AtendimentoMedicoController } from './atendimento-medico/atendimento-medico.controller';
import { AtendimentoMedicoService } from './atendimento-medico/atendimento-medico.service';
import { ProntuariosController } from './prontuarios/prontuarios.controller';
import { ProntuariosService } from './prontuarios/prontuarios.service';

/**
 * Módulo CONSULTÓRIO / ASSISTENCIAL do inventário. Dono de Prontuário, Atendimento, Evolução e
 * Anamnese.
 */
@Module({
  // Paciente e Agendamento (comercial-atendimento) e Profissional (gestao-profissionais) são
  // lidos pelos services exportados, sem FK nas tabelas deste módulo (CLAUDE.md, seção 3).
  imports: [ComercialAtendimentoModule, GestaoProfissionaisModule],
  controllers: [ProntuariosController, AtendimentoMedicoController],
  providers: [ProntuariosService, AtendimentoMedicoService],
})
export class ConsultorioAssistencialModule {}
