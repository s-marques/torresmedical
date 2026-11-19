import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable, Logger } from '@nestjs/common';
import {
  AI_GROWTH_TIPOS,
  aiGrowthParametrosSchema,
  prioridadeAiGrowth,
  type AiGrowthAnalise,
  type AiGrowthInsight,
  type AiGrowthPainel,
} from '@torres/shared';
import type { AnaliseAiGrowth, InsightAiGrowth } from '../../../generated/prisma/client';
import { AuditService } from '../../../common/audit/audit.service';
import { RequestContextService } from '../../../common/context/request-context.service';
import { EscopoDadosService, semPermissao } from '../../../common/auth/escopo-dados.service';
import { BusinessException } from '../../../common/errors/api.exception';
import { EventPublisher } from '../../../common/messaging/event-publisher';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import { FontesInsightsAiGrowth } from './fontes-insights-ai-growth';

export const COMANDO_ANALISAR_AI_GROWTH = 'configuracoes-gestao.ai-growth.analisar';
export const ANALISE_EM_ANDAMENTO = 'ANALISE_AI_GROWTH_EM_ANDAMENTO';
/** Análise parada há mais que isso (fila fora do ar) deixa de bloquear uma nova. */
export const ANALISE_PRAZO_MS = 15 * 60 * 1000;

const ORDEM = new Map<string, number>(AI_GROWTH_TIPOS.map((tipo, indice) => [tipo, indice]));

/**
 * Tela AI Growth: pontos de atenção do negócio. "Analisar Agora" só registra o pedido e publica
 * o comando; o `AnalisarAiGrowthConsumer` roda as regras de cada módulo e grava os insights.
 * É uma visão geral da clínica, por isso perfil com escopo restrito não acessa (403).
 */
@Injectable()
export class AiGrowthService {
  private readonly logger = new Logger(AiGrowthService.name);

  constructor(
    private readonly txHost: TransactionHost<PrismaAdapter>,
    private readonly fontes: FontesInsightsAiGrowth,
    private readonly events: EventPublisher,
    private readonly audit: AuditService,
    private readonly context: RequestContextService,
    private readonly escopo: EscopoDadosService,
  ) {}

  async painel(): Promise<AiGrowthPainel> {
    this.exigirVisaoGeral();
    const tx = this.txHost.tx;
    const [concluida, emAndamento] = await Promise.all([
      tx.analiseAiGrowth.findFirst({
        where: { status: 'CONCLUIDA' },
        orderBy: { concluidaEm: 'desc' },
        include: { insights: true },
      }),
      tx.analiseAiGrowth.findFirst({
        where: {
          status: { in: ['PENDENTE', 'PROCESSANDO'] },
          solicitadaEm: { gte: new Date(Date.now() - ANALISE_PRAZO_MS) },
        },
        orderBy: { solicitadaEm: 'desc' },
      }),
    ]);
    const insights = (concluida?.insights ?? [])
      .map(toInsightDto)
      .sort((a, b) => (ORDEM.get(a.tipo) ?? 0) - (ORDEM.get(b.tipo) ?? 0));
    return {
      ultimaAnalise: concluida ? toAnaliseDto(concluida) : null,
      emAndamento: emAndamento ? toAnaliseDto(emAndamento) : null,
      insights,
      pontosAtencao: insights.length,
    };
  }

  /** `POST /analisar`: cria a análise pendente e publica o comando (sai só após o commit). */
  async solicitar(): Promise<AiGrowthAnalise> {
    this.exigirVisaoGeral();
    const tx = this.txHost.tx;
    const andamento = await tx.analiseAiGrowth.findFirst({
      where: {
        status: { in: ['PENDENTE', 'PROCESSANDO'] },
        solicitadaEm: { gte: new Date(Date.now() - ANALISE_PRAZO_MS) },
      },
      select: { id: true },
    });
    if (andamento) {
      throw new BusinessException(ANALISE_EM_ANDAMENTO, 'Já existe uma análise em andamento', {
        status: 409,
      });
    }
    const analise = await tx.analiseAiGrowth.create({
      data: { solicitadaPorId: this.context.getUserId() ?? null },
    });
    await this.events.publish(COMANDO_ANALISAR_AI_GROWTH, { analiseId: analise.id });
    return toAnaliseDto(analise);
  }

  /**
   * Chamado pelo consumidor. Idempotente: só quem move PENDENTE → PROCESSANDO processa, então
   * repetir o comando (retry ou entrega dupla) não gera insights em duplicidade.
   */
  async processar(analiseId: string): Promise<boolean> {
    const tx = this.txHost.tx;
    const { count } = await tx.analiseAiGrowth.updateMany({
      where: { id: analiseId, status: 'PENDENTE' },
      data: { status: 'PROCESSANDO', iniciadaEm: new Date() },
    });
    if (count === 0) return false;

    try {
      const agora = new Date();
      const calculados = await this.fontes.coletar(agora);
      await tx.insightAiGrowth.createMany({
        data: calculados.map((insight) => ({
          analiseId,
          tipo: insight.tipo,
          prioridade: prioridadeAiGrowth(insight.quantidade),
          quantidade: insight.quantidade,
          parametros: insight.parametros ?? {},
          ordem: ORDEM.get(insight.tipo) ?? 0,
        })),
      });
      await tx.analiseAiGrowth.update({
        where: { id: analiseId },
        data: { status: 'CONCLUIDA', concluidaEm: new Date() },
      });
      await this.audit.record({
        action: 'UPDATE',
        entity: 'AnaliseAiGrowth',
        entityId: analiseId,
        before: { status: 'PROCESSANDO' },
        after: { status: 'CONCLUIDA', insights: calculados.length },
      });
    } catch (erro) {
      // Só o id e o tipo do erro vão para o log (sem dados pessoais).
      this.logger.error(
        `Análise ${analiseId} falhou: ${erro instanceof Error ? erro.name : 'erro desconhecido'}`,
      );
      await tx.analiseAiGrowth.update({
        where: { id: analiseId },
        data: { status: 'FALHOU', erro: 'ERRO_PROCESSAMENTO', concluidaEm: new Date() },
      });
    }
    return true;
  }

  private exigirVisaoGeral(): void {
    if (this.escopo.restrito()) throw semPermissao();
  }
}

function toAnaliseDto(analise: AnaliseAiGrowth): AiGrowthAnalise {
  return {
    id: analise.id,
    status: analise.status,
    solicitadaEm: analise.solicitadaEm.toISOString(),
    concluidaEm: analise.concluidaEm?.toISOString() ?? null,
  };
}

function toInsightDto(insight: InsightAiGrowth): AiGrowthInsight {
  return {
    id: insight.id,
    tipo: insight.tipo as AiGrowthInsight['tipo'],
    prioridade: insight.prioridade,
    quantidade: insight.quantidade,
    parametros: aiGrowthParametrosSchema.parse(insight.parametros),
  };
}
