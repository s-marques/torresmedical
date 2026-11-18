import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import { NPS_MENSAGEM_PADRAO, aplicarVariaveisNps } from '@torres/shared';
import { AuditService } from '../../../common/audit/audit.service';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import { CanaisWhatsappService } from '../../configuracoes-gestao/canais-whatsapp/canais-whatsapp.service';
import { MensagensSaidaWhatsappService } from '../whatsapp/mensagens-saida-whatsapp.service';

export interface AtendimentoFinalizado {
  atendimentoId: string;
  pacienteId: string;
  profissionalId: string;
}

/**
 * Envia a pesquisa NPS depois do atendimento finalizado: grava a mensagem "Pendente" no WhatsApp
 * do profissional (ou da clínica) e registra a pesquisa. Uma pesquisa por atendimento: repetir o
 * evento não manda a mensagem de novo. Quem pediu para não receber mensagens da clínica (opt-out
 * do cadastro) não recebe. Falha de canal ou de telefone não lança: fica como `FALHA`.
 */
@Injectable()
export class EnvioPesquisaNpsService {
  constructor(
    private readonly txHost: TransactionHost<PrismaAdapter>,
    private readonly canais: CanaisWhatsappService,
    private readonly whatsapp: MensagensSaidaWhatsappService,
    private readonly audit: AuditService,
  ) {}

  /** Devolve `true` quando criou a pesquisa (enviada ou com falha). */
  async enviar(atendimento: AtendimentoFinalizado): Promise<boolean> {
    const tx = this.txHost.tx;
    const { atendimentoId, pacienteId, profissionalId } = atendimento;
    if (await tx.pesquisaNps.findUnique({ where: { atendimentoId }, select: { id: true } })) {
      return false;
    }
    const [paciente, profissional] = await Promise.all([
      tx.paciente.findFirst({ where: { id: pacienteId, deletedAt: null } }),
      tx.profissional.findFirst({ where: { id: profissionalId } }),
    ]);
    // Opt-out (LGPD): sem registro, sem mensagem.
    if (!paciente || !profissional || !paciente.aceitaCampanhasWhatsapp) return false;

    let erro: string | null = null;
    let mensagemId: string | null = null;
    const canalId = await this.canais.canalParaProfissional(profissionalId);
    if (!paciente.celular?.trim()) erro = 'SEM_CELULAR';
    else if (!canalId) erro = 'SEM_CANAL';
    else {
      mensagemId = await this.whatsapp.registrar({
        canalId,
        pacienteId,
        nome: paciente.nome,
        telefone: paciente.celular,
        conteudo: aplicarVariaveisNps(NPS_MENSAGEM_PADRAO, {
          nome: paciente.nome,
          profissional: profissional.nome,
        }),
      });
    }

    const pesquisa = await tx.pesquisaNps.create({
      data: {
        atendimentoId,
        pacienteId,
        profissionalId,
        status: erro ? 'FALHA' : 'ENVIADA',
        erro,
        mensagemWhatsappId: mensagemId,
      },
    });
    await this.audit.record({
      action: 'CREATE',
      entity: 'PesquisaNps',
      entityId: pesquisa.id,
      before: null,
      after: { atendimentoId, status: pesquisa.status, erro },
    });
    return true;
  }
}
