import { Injectable } from '@nestjs/common';
import type {
  CreateEvolucaoVozInput,
  Evolucao,
  EvolucaoVozAgendamento,
  ListEvolucaoVozQuery,
  ListRegistrosQuery,
} from '@torres/shared';
import { AuditService } from '../../../common/audit/audit.service';
import type { Page } from '../../../common/pagination/paginate';
import { AgendamentosAtendimentoService } from '../../comercial-atendimento/agenda/agendamentos-atendimento.service';
import { AtendimentoMedicoService } from '../atendimento-medico/atendimento-medico.service';

/**
 * Tela Evolução por Voz (`/evolucoes`, #39). A transcrição é feita no navegador; aqui só chega
 * o texto, gravado como evolução do atendimento pelas mesmas regras do Atendimento Médico.
 * O escopo por profissional vem de `AgendamentosAtendimentoService` (403 fora do escopo).
 */
@Injectable()
export class EvolucaoVozService {
  constructor(
    private readonly agendamentos: AgendamentosAtendimentoService,
    private readonly atendimentoMedico: AtendimentoMedicoService,
    private readonly audit: AuditService,
  ) {}

  listar(query: ListEvolucaoVozQuery): Promise<Page<EvolucaoVozAgendamento>> {
    return this.agendamentos.listarParaEvolucaoVoz(query);
  }

  detalhe(agendamentoId: string): Promise<EvolucaoVozAgendamento> {
    return this.agendamentos.resumoComNumero(agendamentoId);
  }

  /** "Histórico": todas as evoluções do paciente, como no Atendimento Médico. */
  listarEvolucoes(agendamentoId: string, query: ListRegistrosQuery): Promise<Page<Evolucao>> {
    return this.atendimentoMedico.listarEvolucoes(agendamentoId, query);
  }

  /**
   * "Salvar Evolução": grava a transcrição como "Evolução/Anotação". Sem atendimento, inicia o
   * atendimento antes (agendamento passa a "Em atendimento"), conforme confirmado pelo dev.
   * Roda na transação do `@Audit` do controller: o atendimento criado vai junto para o audit_log.
   */
  async salvar(agendamentoId: string, input: CreateEvolucaoVozInput): Promise<Evolucao> {
    const { atendimento } = await this.atendimentoMedico.detalhe(agendamentoId);
    if (!atendimento) {
      const iniciado = await this.atendimentoMedico.iniciar(agendamentoId);
      await this.audit.record({
        action: 'CREATE',
        entity: 'Atendimento',
        entityId: iniciado.id,
        before: null,
        after: iniciado,
      });
    }
    return this.atendimentoMedico.criarEvolucao(agendamentoId, {
      tipo: 'EVOLUCAO',
      texto: input.texto,
    });
  }
}
