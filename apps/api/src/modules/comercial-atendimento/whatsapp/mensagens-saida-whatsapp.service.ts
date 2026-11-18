import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import { normalizarTelefoneWhatsapp } from '@torres/shared';
import { EventPublisher } from '../../../common/messaging/event-publisher';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import { COMANDO_ENVIAR_MENSAGEM } from './atendimento-whatsapp.service';

export interface MensagemSaida {
  canalId: string;
  pacienteId: string;
  nome: string;
  telefone: string;
  conteudo: string;
}

/**
 * Mensagens que o sistema manda sozinho (campanhas e mensagens automáticas). Grava a mensagem
 * "Pendente" na conversa do paciente no canal e publica `comercial.whatsapp.enviar-mensagem`,
 * como o envio do atendente; quem fala com o provedor é a integração (issue própria).
 */
@Injectable()
export class MensagensSaidaWhatsappService {
  constructor(
    private readonly txHost: TransactionHost<PrismaAdapter>,
    private readonly events: EventPublisher,
  ) {}

  /** Devolve o id da mensagem gravada. */
  async registrar(saida: MensagemSaida): Promise<string> {
    const tx = this.txHost.tx;
    const telefone = normalizarTelefoneWhatsapp(saida.telefone);
    const contato = await tx.contatoWhatsapp.upsert({
      where: { telefone },
      create: { telefone, nome: saida.nome, pacienteId: saida.pacienteId },
      update: {},
    });
    // Usa a conversa aberta do contato no canal; sem ela, abre uma já finalizada, para não
    // entrar na fila de atendimento. A resposta do cliente reabre a conversa (integração).
    const conversa =
      (await tx.conversaWhatsapp.findFirst({
        where: { contatoId: contato.id, canalId: saida.canalId, status: { not: 'FINALIZADA' } },
        orderBy: { createdAt: 'desc' },
      })) ??
      (await tx.conversaWhatsapp.create({
        data: { contatoId: contato.id, canalId: saida.canalId, status: 'FINALIZADA' },
      }));
    const enviadaEm = new Date();
    const mensagem = await tx.mensagemWhatsapp.create({
      data: {
        conversaId: conversa.id,
        direcao: 'ENVIADA',
        autor: 'CAMPANHA',
        status: 'PENDENTE',
        tipo: 'TEXTO',
        conteudo: saida.conteudo,
        enviadaEm,
      },
    });
    await tx.conversaWhatsapp.update({
      where: { id: conversa.id },
      data: { ultimaMensagemEm: enviadaEm },
    });
    await this.events.publish(COMANDO_ENVIAR_MENSAGEM, { mensagemId: mensagem.id });
    return mensagem.id;
  }
}
