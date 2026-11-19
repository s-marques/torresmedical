import { forwardRef, Module } from '@nestjs/common';
import { ComercialAtendimentoModule } from '../comercial-atendimento/comercial-atendimento.module';
import { GestaoProfissionaisModule } from '../gestao-profissionais/gestao-profissionais.module';
import { AtendimentoMedicoController } from './atendimento-medico/atendimento-medico.controller';
import { AtendimentoMedicoService } from './atendimento-medico/atendimento-medico.service';
import { PacientesVinculadosService } from './pacientes-vinculados/pacientes-vinculados.service';
import { PrestadoresController } from './prestadores/prestadores.controller';
import { PrestadoresService } from './prestadores/prestadores.service';
import { ProntuariosController } from './prontuarios/prontuarios.controller';
import { ProntuariosService } from './prontuarios/prontuarios.service';
import { PrescricoesController } from './receituarios/prescricoes.controller';
import { PrescricoesService } from './receituarios/prescricoes.service';
import { ReceituarioBlocosController } from './receituarios/receituario-blocos.controller';
import { ReceituarioBlocosService } from './receituarios/receituario-blocos.service';

/**
 * Módulo CONSULTÓRIO / ASSISTENCIAL do inventário. Dono de Prontuário, Atendimento, Evolução,
 * Anamnese, Prestador (de serviço de manutenção) e Receituários (blocos e prescrições).
 */
@Module({
  // Paciente e Agendamento (comercial-atendimento) e Profissional (gestao-profissionais) são
  // lidos pelos services exportados, sem FK nas tabelas deste módulo (CLAUDE.md, seção 3).
  // A tela Pacientes (comercial-atendimento) usa os pacientes vinculados daqui (issue #153).
  imports: [forwardRef(() => ComercialAtendimentoModule), GestaoProfissionaisModule],
  controllers: [
    ProntuariosController,
    AtendimentoMedicoController,
    PrestadoresController,
    ReceituarioBlocosController,
    PrescricoesController,
  ],
  providers: [
    ProntuariosService,
    AtendimentoMedicoService,
    PacientesVinculadosService,
    PrestadoresService,
    ReceituarioBlocosService,
    PrescricoesService,
  ],
  exports: [PacientesVinculadosService],
})
export class ConsultorioAssistencialModule {}
