import { forwardRef, Module } from '@nestjs/common';
import { ComercialAtendimentoModule } from '../comercial-atendimento/comercial-atendimento.module';
import { GestaoProfissionaisModule } from '../gestao-profissionais/gestao-profissionais.module';
import { AtendimentoMedicoController } from './atendimento-medico/atendimento-medico.controller';
import { AtendimentoMedicoService } from './atendimento-medico/atendimento-medico.service';
import { EncaminhamentosController } from './encaminhamentos/encaminhamentos.controller';
import { EncaminhamentosService } from './encaminhamentos/encaminhamentos.service';
import { EvolucaoVozController } from './evolucao-voz/evolucao-voz.controller';
import { EvolucaoVozService } from './evolucao-voz/evolucao-voz.service';
import { PacientesVinculadosService } from './pacientes-vinculados/pacientes-vinculados.service';
import { PrestadoresController } from './prestadores/prestadores.controller';
import { PrestadoresService } from './prestadores/prestadores.service';
import { ProntuariosController } from './prontuarios/prontuarios.controller';
import { ProntuariosService } from './prontuarios/prontuarios.service';
import { SoroterapiaController } from './soroterapia/soroterapia.controller';
import { SoroterapiaService } from './soroterapia/soroterapia.service';
import { PrescricoesController } from './receituarios/prescricoes.controller';
import { PrescricoesService } from './receituarios/prescricoes.service';
import { ReceituarioBlocosController } from './receituarios/receituario-blocos.controller';
import { ReceituarioBlocosService } from './receituarios/receituario-blocos.service';

/**
 * Módulo CONSULTÓRIO / ASSISTENCIAL do inventário. Dono de Prontuário, Atendimento, Evolução,
 * Anamnese, Prestador (de serviço de manutenção) e Receituários (blocos e prescrições)
 * e Soroterapia (checklists) e Encaminhamentos de pacientes entre profissionais (#146).
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
    EncaminhamentosController,
    PrestadoresController,
    ReceituarioBlocosController,
    PrescricoesController,
    SoroterapiaController,
  ],
  providers: [
    ProntuariosService,
    AtendimentoMedicoService,
    EvolucaoVozService,
    EncaminhamentosService,
    PacientesVinculadosService,
    PrestadoresService,
    ReceituarioBlocosService,
    PrescricoesService,
    SoroterapiaService,
  ],
  exports: [PacientesVinculadosService],
})
export class ConsultorioAssistencialModule {}
