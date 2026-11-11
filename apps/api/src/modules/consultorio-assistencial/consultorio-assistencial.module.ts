import { Module } from '@nestjs/common';
import { ComercialAtendimentoModule } from '../comercial-atendimento/comercial-atendimento.module';
import { GestaoProfissionaisModule } from '../gestao-profissionais/gestao-profissionais.module';
import { ProntuariosController } from './prontuarios/prontuarios.controller';
import { ProntuariosService } from './prontuarios/prontuarios.service';

/** Módulo CONSULTÓRIO / ASSISTENCIAL do inventário. Dono de Prontuário, Atendimento e Anamnese. */
@Module({
  // Paciente (comercial-atendimento) e Profissional (gestao-profissionais) são lidos pelos
  // services exportados, sem FK nas tabelas deste módulo (CLAUDE.md, seção 3).
  imports: [ComercialAtendimentoModule, GestaoProfissionaisModule],
  controllers: [ProntuariosController],
  providers: [ProntuariosService],
})
export class ConsultorioAssistencialModule {}
