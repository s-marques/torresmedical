import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import {
  aplicarVariaveis,
  formatarTelefoneWhatsapp,
  normalizarTelefoneWhatsapp,
} from '@torres/shared';
import { AuditService } from '../../../common/audit/audit.service';
import { EventPublisher } from '../../../common/messaging/event-publisher';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import { MensagensSaidaWhatsappService } from '../whatsapp/mensagens-saida-whatsapp.service';
import { DestinatariosService } from './destinatarios.service';
import { paraColunaData, type AgoraClinica } from './relogio-clinica';

/** Comandos do próprio módulo: montar a lista de destinatários fora da requisição. */
export const COMANDO_PREPARAR_CAMPANHA = 'comercial.campanha.preparar-envios';
export const COMANDO_PREPARAR_AUTOMACAO = 'comercial.mensagem-automatica.preparar-envios';

/** Mensagens automáticas não têm intervalo no formulário: o padrão das campanhas. */
const INTERVALO_AUTOMACAO_MS = 5_000;
/** Envios gravados no WhatsApp por rodada do agendador. */
export const LOTE_ENVIOS = 100;

const NAO_EXCLUIDOS = { deletedAt: null } as const;

/**
 * Ciclo de envio de campanhas e mensagens automáticas:
 * 1. o agendador marca as campanhas e automações devidas e publica o comando de preparar;
 * 2. o consumidor monta os destinatários (`envios_campanha`), espaçados pelo intervalo;
 * 3. a cada rodada, o agendador grava no WhatsApp os envios cuja hora chegou e publica
 *    `comercial.whatsapp.enviar-mensagem` para cada um; campanha sem envio pendente conclui.
 */
@Injectable()
export class EnviosCampanhaService {
  constructor(
    private readonly txHost: TransactionHost<PrismaAdapter>,
    private readonly destinatarios: DestinatariosService,
    private readonly whatsapp: MensagensSaidaWhatsappService,
    private readonly events: EventPublisher,
    private readonly audit: AuditService,
  ) {}

  // ---------- 1. Agendador: disparos devidos ----------

  /** Campanhas agendadas cuja hora chegou passam a "Enviando". */
  async dispararCampanhas(agora: AgoraClinica): Promise<number> {
    const devidas = await this.txHost.tx.campanha.findMany({
      where: { ...NAO_EXCLUIDOS, status: 'AGENDADA', agendadaPara: { lte: agora.instante } },
      select: { id: true },
    });
    let disparadas = 0;
    for (const { id } of devidas) {
      // Só quem mudar o status publica (duas instâncias da API não disparam em dobro).
      const { count } = await this.txHost.tx.campanha.updateMany({
        where: { id, status: 'AGENDADA' },
        data: { status: 'ENVIANDO', iniciadaEm: agora.instante },
      });
      if (count === 0) continue;
      await this.audit.record({
        action: 'UPDATE',
        entity: 'Campanha',
        entityId: id,
        before: { status: 'AGENDADA' },
        after: { status: 'ENVIANDO' },
      });
      await this.events.publish(COMANDO_PREPARAR_CAMPANHA, { campanhaId: id });
      disparadas += 1;
    }
    return disparadas;
  }

  /** Automações ativas do dia da semana cujo horário chegou e que ainda não saíram hoje. */
  async dispararAutomacoes(agora: AgoraClinica): Promise<number> {
    const hoje = paraColunaData(agora.dia);
    const pendenteHoje = { OR: [{ ultimaExecucaoDia: null }, { ultimaExecucaoDia: { lt: hoje } }] };
    const devidas = await this.txHost.tx.mensagemAutomatica.findMany({
      where: {
        ...NAO_EXCLUIDOS,
        ativa: true,
        diasSemana: { has: agora.diaSemana },
        horario: { lte: agora.hora },
        ...pendenteHoje,
      },
      select: { id: true },
    });
    let disparadas = 0;
    for (const { id } of devidas) {
      const { count } = await this.txHost.tx.mensagemAutomatica.updateMany({
        where: { id, ...pendenteHoje },
        data: { ultimaExecucaoDia: hoje },
      });
      if (count === 0) continue;
      await this.events.publish(COMANDO_PREPARAR_AUTOMACAO, {
        mensagemAutomaticaId: id,
        dia: agora.dia,
      });
      disparadas += 1;
    }
    return disparadas;
  }

  // ---------- 2. Consumidor: destinatários ----------

  /** Idempotente: campanha que já tem destinatários não é preparada de novo. */
  async prepararCampanha(campanhaId: string, agora: AgoraClinica): Promise<void> {
    const campanha = await this.txHost.tx.campanha.findFirst({
      where: { id: campanhaId, ...NAO_EXCLUIDOS },
    });
    if (campanha?.status !== 'ENVIANDO') return;
    if ((await this.txHost.tx.envioCampanha.count({ where: { campanhaId } })) > 0) return;

    const ids = await this.destinatarios.ids(campanha, agora, campanha.quantidade);
    const inicio = Math.max(agora.instante.getTime(), campanha.agendadaPara.getTime());
    const passoMs = campanha.intervaloSegundos * 1000;
    await this.txHost.tx.envioCampanha.createMany({
      data: ids.map((pacienteId, i) => ({
        campanhaId,
        pacienteId,
        programadoPara: new Date(inicio + i * passoMs),
      })),
      skipDuplicates: true,
    });
    await this.audit.record({
      action: 'UPDATE',
      entity: 'Campanha',
      entityId: campanhaId,
      before: { status: 'ENVIANDO', totalDestinatarios: 0 },
      after: {
        status: ids.length === 0 ? 'CONCLUIDA' : 'ENVIANDO',
        totalDestinatarios: ids.length,
      },
    });
    if (ids.length === 0) {
      await this.txHost.tx.campanha.update({
        where: { id: campanhaId },
        data: { status: 'CONCLUIDA', concluidaEm: agora.instante },
      });
    }
  }

  /** Um disparo por dia: o mesmo paciente não recebe duas vezes no mesmo dia. */
  async prepararAutomacao(
    mensagemAutomaticaId: string,
    dia: string,
    agora: AgoraClinica,
  ): Promise<void> {
    const automacao = await this.txHost.tx.mensagemAutomatica.findFirst({
      where: { id: mensagemAutomaticaId, ...NAO_EXCLUIDOS },
    });
    if (!automacao?.ativa) return;
    const ids = await this.destinatarios.ids(automacao, agora);
    await this.txHost.tx.envioCampanha.createMany({
      data: ids.map((pacienteId, i) => ({
        mensagemAutomaticaId,
        dia: paraColunaData(dia),
        pacienteId,
        programadoPara: new Date(agora.instante.getTime() + i * INTERVALO_AUTOMACAO_MS),
      })),
      skipDuplicates: true,
    });
  }

  // ---------- 3. Agendador: envios cuja hora chegou ----------

  /** Grava no WhatsApp os envios devidos (em lote) e conclui as campanhas que terminaram. */
  async enfileirar(agora: AgoraClinica, limite = LOTE_ENVIOS): Promise<number> {
    const tx = this.txHost.tx;
    const envios = await tx.envioCampanha.findMany({
      where: { status: 'PROGRAMADO', programadoPara: { lte: agora.instante } },
      orderBy: [{ programadoPara: 'asc' }, { id: 'asc' }],
      take: limite,
      include: {
        campanha: { select: { mensagem: true, canalId: true, status: true, deletedAt: true } },
        mensagemAutomatica: {
          select: { mensagem: true, canalId: true, ativa: true, deletedAt: true },
        },
      },
    });
    const dados = await this.destinatarios.dados(envios.map((e) => e.pacienteId));
    let enfileirados = 0;
    for (const envio of envios) {
      const origem = envio.campanha ?? envio.mensagemAutomatica;
      const valida =
        origem !== null &&
        origem.deletedAt === null &&
        (envio.campanha ? envio.campanha.status === 'ENVIANDO' : envio.mensagemAutomatica?.ativa);
      const paciente = dados.get(envio.pacienteId);
      if (!valida || !origem) {
        await tx.envioCampanha.update({ where: { id: envio.id }, data: { status: 'CANCELADO' } });
        continue;
      }
      if (paciente && !paciente.aceitaContato) {
        // Consentimento revogado depois de o envio entrar na fila: não manda (LGPD, #148).
        await tx.envioCampanha.update({ where: { id: envio.id }, data: { status: 'CANCELADO' } });
        continue;
      }
      if (!paciente?.celular) {
        await tx.envioCampanha.update({
          where: { id: envio.id },
          data: { status: 'FALHA', erro: 'SEM_CELULAR' },
        });
        continue;
      }
      const mensagemId = await this.whatsapp.registrar({
        canalId: origem.canalId,
        pacienteId: envio.pacienteId,
        nome: paciente.nome,
        telefone: paciente.celular,
        conteudo: aplicarVariaveis(origem.mensagem, {
          nome: paciente.nome,
          telefone: formatarTelefoneWhatsapp(normalizarTelefoneWhatsapp(paciente.celular)),
          ultimaCompra: paciente.ultimaCompra,
        }),
      });
      await tx.envioCampanha.update({
        where: { id: envio.id },
        data: {
          status: 'ENFILEIRADO',
          mensagemWhatsappId: mensagemId,
          enfileiradoEm: agora.instante,
        },
      });
      if (envio.mensagemAutomaticaId) {
        await tx.mensagemAutomatica.update({
          where: { id: envio.mensagemAutomaticaId },
          data: { ultimoEnvioEm: agora.instante },
        });
      }
      enfileirados += 1;
    }
    await this.concluirCampanhas(agora);
    return enfileirados;
  }

  /** "Enviando" sem envio programado (já preparada) → "Concluída". */
  private async concluirCampanhas(agora: AgoraClinica): Promise<void> {
    const terminadas = await this.txHost.tx.campanha.findMany({
      where: {
        status: 'ENVIANDO',
        envios: { some: {}, none: { status: 'PROGRAMADO' } },
      },
      select: { id: true },
    });
    for (const { id } of terminadas) {
      await this.txHost.tx.campanha.update({
        where: { id },
        data: { status: 'CONCLUIDA', concluidaEm: agora.instante },
      });
      await this.audit.record({
        action: 'UPDATE',
        entity: 'Campanha',
        entityId: id,
        before: { status: 'ENVIANDO' },
        after: { status: 'CONCLUIDA' },
      });
    }
  }
}
