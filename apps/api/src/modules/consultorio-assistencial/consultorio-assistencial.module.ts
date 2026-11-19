import { forwardRef, Module } from '@nestjs/common';
import { ComercialAtendimentoModule } from '../comercial-atendimento/comercial-atendimento.module';
import { GestaoProfissionaisModule } from '../gestao-profissionais/gestao-profissionais.module';
import { AtendimentoMedicoController } from './atendimento-medico/atendimento-medico.controller';
import { AtendimentoMedicoService } from './atendimento-medico/atendimento-medico.service';
import { EvolucaoVozController } from './evolucao-voz/evolucao-voz.controller';
import { EvolucaoVozService } from './evolucao-voz/evolucao-voz.service';
import { PacientesVinculadosService } from './pacientes-vinculados/pacientes-vinculados.service';
import { PrestadoresController } from './prestadores/prestadores.controller';
import { PrestadoresService } from './prestadores/prestadores.service';
import { ProntuariosController } from './prontuarios/prontuarios.controller';
import { ProntuariosService } from './prontuarios/prontuarios.service';

/**
 * Módulo CONSULTÓRIO / ASSISTENCIAL do inventário. Dono de Prontuário, Atendimento, Evolução,
 * Anamnese e Prestador (de serviço de manutenção).
 */
@Module({
  // Paciente e Agendamento (comercial-atendimento) e Profissional (gestao-profissionais) são
  // lidos pelos services exportados, sem FK nas tabelas deste módulo (CLAUDE.md, seção 3).
  // A tela Pacientes (comercial-atendimento) usa os pacientes vinculados daqui (issue #153).
  imports: [forwardRef(() => ComercialAtendimentoModule), GestaoProfissionaisModule],
  controllers: [
    ProntuariosController,
    AtendimentoMedicoController,
    EvolucaoVozController,
    PrestadoresController,
  ],
  providers: [
    ProntuariosService,
    AtendimentoMedicoService,
    EvolucaoVozService,
    PacientesVinculadosService,
    PrestadoresService,
  ],
  exports: [PacientesVinculadosService],
})
export class ConsultorioAssistencialModule {}
