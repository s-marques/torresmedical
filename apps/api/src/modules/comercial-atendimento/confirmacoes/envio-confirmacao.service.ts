import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import {
  aplicarVariaveisConfirmacao,
  type ConfirmacaoEtapa,
  type ConfirmacaoConfig,
} from '@torres/shared';
import { type Prisma } from '../../../generated/prisma/client';
import { AuditService } from '../../../common/audit/audit.service';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import { toLocalWallClock } from '../../../common/export/export-values';
import { CanaisWhatsappService } from '../../configuracoes-gestao/canais-whatsapp/canais-whatsapp.service';
import { instanteDeInicio } from '../agenda/agenda.service';
import { MensagensSaidaWhatsappService } from '../whatsapp/mensagens-saida-whatsapp.service';
import { ConfirmacoesConfigService } from './confirmacoes-config.service';
import { MODELO_PADRAO, textoDaEtapa } from './modelos-padrao';

/** Envios por etapa e rodada do agendador. */
export const LOTE_CONFIRMACOES = 100;

const INCLUDE_ENVIO = {
  paciente: { select: { id: true, nome: true, celular: true, aceitaComunicacao: true } },
  profissional: { select: { id: true, nome: true } },
} satisfies Prisma.AgendamentoInclude;

/** Etapas na ordem do dia da véspera; cada uma vale até o horário da seguinte. */
const ETAPAS_VESPERA = [
  { etapa: 'MSG1', horario: 'horarioMsg1' },
  { etapa: 'MSG2', horario: 'horarioMsg2' },
  { etapa: 'MSG3', horario: 'horarioMsg3' },
] as const satisfies readonly { etapa: ConfirmacaoEtapa; horario: keyof ConfirmacaoConfig }[];

export function somarDias(dia: string, dias: number): string {
  const data = new Date(`${dia}T00:00:00.000Z`);
  data.setUTCDate(data.getUTCDate() + dias);
  return data.toISOString().slice(0, 10);
}

/** Início (inclusive) e fim (exclusive) do dia no fuso da clínica. */
export function intervaloDoDia(dia: string): { gte: Date; lt: Date } {
  return { gte: instanteDeInicio(dia, '00:00'), lt: instanteDeInicio(somarDias(dia, 1), '00:00') };
}

function dataEHora(inicio: Date): { data: string; hora: string } {
  const iso = toLocalWallClock(inicio).toISOString();
  return { data: iso.slice(0, 10).split('-').reverse().join('/'), hora: iso.slice(11, 16) };
}

/**
 * Envio das mensagens de confirmação (MSG1/2/3 e lembrete do dia): monta o texto do modelo do
 * tipo, grava a mensagem "Pendente" no WhatsApp do profissional (ou da clínica) e registra o
 * envio. Um envio por agendamento e etapa: repetir a chamada não manda a mensagem de novo.
 */
@Injectable()
export class EnvioConfirmacaoService {
  constructor(
    private readonly txHost: TransactionHost<PrismaAdapter>,
    private readonly config: ConfirmacoesConfigService,
    private readonly canais: CanaisWhatsappService,
    private readonly whatsapp: MensagensSaidaWhatsappService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Envia a etapa do agendamento. Devolve `false` quando a etapa já foi enviada (idempotente).
   * Falha de canal ou de telefone não lança: fica no histórico como `FALHA` e pode ser
   * reenviada pela linha da tela.
   */
  async enviar(agendamentoId: string, etapa: ConfirmacaoEtapa, manual: boolean): Promise<boolean> {
    const tx = this.txHost.tx;
    const anterior = await tx.envioConfirmacao.findUnique({
      where: { agendamentoId_etapa: { agendamentoId, etapa } },
    });
    if (anterior?.status === 'ENVIADO') return false;

    const agendamento = await tx.agendamento.findFirst({
      where: { id: agendamentoId, deletedAt: null },
      include: INCLUDE_ENVIO,
    });
    if (!agendamento) return false;

    const { status, erro, mensagemId } = await this.registrarMensagem(agendamento, etapa);
    const dados = { status, erro, manual, mensagemWhatsappId: mensagemId, createdAt: new Date() };
    const envio = await tx.envioConfirmacao.upsert({
      where: { agendamentoId_etapa: { agendamentoId, etapa } },
      create: { agendamentoId, etapa, ...dados },
      update: dados,
    });
    await this.audit.record({
      action: anterior ? 'UPDATE' : 'CREATE',
      entity: 'EnvioConfirmacao',
      entityId: envio.id,
      before: anterior ? { etapa, status: anterior.status, erro: anterior.erro } : null,
      after: { agendamentoId, etapa, status, erro, manual },
    });
    return true;
  }

  private async registrarMensagem(
    agendamento: Prisma.AgendamentoGetPayload<{ include: typeof INCLUDE_ENVIO }>,
    etapa: ConfirmacaoEtapa,
  ): Promise<{ status: 'ENVIADO' | 'FALHA'; erro: string | null; mensagemId: string | null }> {
    const falha = (erro: string) => ({ status: 'FALHA' as const, erro, mensagemId: null });
    const { paciente, profissional } = agendamento;
    // Comunicação revogada (LGPD, #148): fica no histórico como falha, sem mensagem.
    if (!paciente.aceitaComunicacao) return falha('SEM_CONSENTIMENTO');
    if (!paciente.celular?.trim()) return falha('SEM_CELULAR');
    const canalId = await this.canais.canalParaProfissional(profissional.id);
    if (!canalId) return falha('SEM_CANAL');

    const modelo = (await this.config.modeloDoTipo(agendamento.tipoAgendamentoId)) ?? MODELO_PADRAO;
    const texto = textoDaEtapa(modelo, etapa, agendamento.status === 'CONFIRMADO');
    const conteudo = aplicarVariaveisConfirmacao(texto, {
      nome: paciente.nome,
      profissional: profissional.nome,
      ...dataEHora(agendamento.inicio),
    });
    const mensagemId = await this.whatsapp.registrar({
      canalId,
      pacienteId: paciente.id,
      nome: paciente.nome,
      telefone: paciente.celular,
      conteudo,
    });
    return { status: 'ENVIADO', erro: null, mensagemId };
  }

  // ---------- Agendador ----------

  /**
   * Rodada do agendador (a cada minuto). Com a função ativa:
   * - MSG1/2/3: agendamentos pendentes do dia `hoje + antecedência`, cada etapa na janela entre
   *   o horário dela e o da próxima (agendamento criado depois não recebe as anteriores);
   * - lembrete: agendamentos de hoje, confirmados ou pendentes, que ainda não começaram.
   * Quem confirmou ou cancelou deixa de receber MSG1/2/3. Devolve quantos envios fez.
   */
  async dispararDevidos(agora: { instante: Date; dia: string; hora: string }): Promise<number> {
    const config = await this.config.configuracao();
    if (!config.ativo) return 0;
    let total = 0;
    const alvo = intervaloDoDia(somarDias(agora.dia, config.antecedenciaDias));
    for (const [i, { etapa, horario }] of ETAPAS_VESPERA.entries()) {
      const proximo = ETAPAS_VESPERA[i + 1];
      const naJanela =
        agora.hora >= config[horario] && (!proximo || agora.hora < config[proximo.horario]);
      if (!naJanela) continue;
      total += await this.enviarEtapa(etapa, {
        inicio: alvo,
        status: 'AGENDADO',
      });
    }
    if (agora.hora >= config.horarioLembrete) {
      total += await this.enviarEtapa('LEMBRETE', {
        inicio: { gte: agora.instante, lt: intervaloDoDia(agora.dia).lt },
        status: { in: ['AGENDADO', 'CONFIRMADO'] },
      });
    }
    return total;
  }

  private async enviarEtapa(
    etapa: ConfirmacaoEtapa,
    filtro: Pick<Prisma.AgendamentoWhereInput, 'inicio' | 'status'>,
  ): Promise<number> {
    const devidos = await this.txHost.tx.agendamento.findMany({
      where: {
        deletedAt: null,
        ...filtro,
        // Sem envio da etapa.
        enviosConfirmacao: { none: { etapa, status: 'ENVIADO' } },
        // Falha já registrada não tenta de novo a cada minuto: só a recepção reenvia.
        NOT: { enviosConfirmacao: { some: { etapa, status: 'FALHA' } } },
      },
      select: { id: true },
      orderBy: [{ inicio: 'asc' }, { numero: 'asc' }],
      take: LOTE_CONFIRMACOES,
    });
    let enviados = 0;
    for (const { id } of devidos) {
      if (await this.enviar(id, etapa, false)) enviados += 1;
    }
    return enviados;
  }
}
