import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable, type OnModuleInit } from '@nestjs/common';
import {
  AI_GROWTH_DIAS_FALTAS,
  AI_GROWTH_DIAS_INATIVO,
  AI_GROWTH_DIAS_PRODUTIVIDADE,
} from '@torres/shared';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import {
  FontesInsightsAiGrowth,
  type FonteInsightsAiGrowth,
  type InsightCalculado,
} from '../../configuracoes-gestao/ai-growth/fontes-insights-ai-growth';
import { ProfissionaisService } from '../../gestao-profissionais/profissionais/profissionais.service';
import {
  contarAniversariantes,
  contarFaixasBaixaOcupacao,
  diasAtras,
  inativos,
  profissionaisSubutilizados,
} from './regras-ai-growth';

const SEMANAS_OCUPACAO = 12;
const NAO_REALIZADOS = ['CANCELADO', 'REAGENDAR'] as const;

/**
 * Regras do AI Growth sobre pacientes e agenda, que são deste módulo. Registra-se em
 * `FontesInsightsAiGrowth` ao subir, e o "Analisar Agora" chama `coletar`.
 */
@Injectable()
export class InsightsAgendaAiGrowth implements FonteInsightsAiGrowth, OnModuleInit {
  constructor(
    private readonly txHost: TransactionHost<PrismaAdapter>,
    private readonly fontes: FontesInsightsAiGrowth,
    private readonly profissionais: ProfissionaisService,
  ) {}

  onModuleInit(): void {
    this.fontes.registrar(this);
  }

  async coletar(agora: Date): Promise<InsightCalculado[]> {
    const { pacientes, profissionais } = await this.inatividade(agora);
    return [
      {
        tipo: 'PACIENTES_INATIVOS',
        quantidade: pacientes,
        parametros: { dias: AI_GROWTH_DIAS_INATIVO },
      },
      { tipo: 'PACIENTES_PENDENTES_RETORNO', quantidade: await this.pendentesRetorno() },
      { tipo: 'FAIXAS_BAIXA_OCUPACAO', quantidade: await this.faixasBaixaOcupacao(agora) },
      {
        tipo: 'FALTAS_RECENTES',
        quantidade: await this.faltas(agora),
        parametros: { dias: AI_GROWTH_DIAS_FALTAS },
      },
      await this.subutilizados(agora),
      { tipo: 'ANIVERSARIANTES_PROXIMOS', quantidade: await this.aniversariantes(agora) },
      { tipo: 'INATIVOS_POR_PROFISSIONAL', quantidade: profissionais },
    ];
  }

  /** Atendidos há mais de 60 dias e sem consulta futura, por paciente e por profissional. */
  private async inatividade(agora: Date) {
    const tx = this.txHost.tx;
    const [atendimentos, futuros] = await Promise.all([
      tx.agendamento.groupBy({
        by: ['pacienteId', 'profissionalId'],
        where: {
          deletedAt: null,
          status: 'ATENDIDO',
          paciente: { deletedAt: null, status: 'ATIVO' },
        },
        _max: { inicio: true },
      }),
      tx.agendamento.findMany({
        where: {
          deletedAt: null,
          inicio: { gt: agora },
          status: { notIn: [...NAO_REALIZADOS, 'FALTOU'] },
        },
        select: { pacienteId: true, profissionalId: true },
      }),
    ]);
    return inativos(
      atendimentos.flatMap((a) =>
        a._max.inicio
          ? [{ pacienteId: a.pacienteId, profissionalId: a.profissionalId, ultimo: a._max.inicio }]
          : [],
      ),
      futuros,
      diasAtras(agora, AI_GROWTH_DIAS_INATIVO),
    );
  }

  /** Pacientes com agendamento em "Reagendar" (retorno ainda sem nova data). */
  private async pendentesRetorno(): Promise<number> {
    const pacientes = await this.txHost.tx.agendamento.groupBy({
      by: ['pacienteId'],
      where: { deletedAt: null, status: 'REAGENDAR' },
    });
    return pacientes.length;
  }

  private async faixasBaixaOcupacao(agora: Date): Promise<number> {
    const agendamentos = await this.txHost.tx.agendamento.findMany({
      where: {
        deletedAt: null,
        status: { notIn: [...NAO_REALIZADOS] },
        inicio: { gte: diasAtras(agora, SEMANAS_OCUPACAO * 7), lte: agora },
      },
      select: { inicio: true },
    });
    return contarFaixasBaixaOcupacao(agendamentos.map((a) => a.inicio));
  }

  private faltas(agora: Date): Promise<number> {
    return this.txHost.tx.agendamento.count({
      where: {
        deletedAt: null,
        status: 'FALTOU',
        inicio: { gte: diasAtras(agora, AI_GROWTH_DIAS_FALTAS), lte: agora },
      },
    });
  }

  private async subutilizados(agora: Date): Promise<InsightCalculado> {
    const ativos = await this.profissionais.listarParaAgenda();
    const grupos = await this.txHost.tx.agendamento.groupBy({
      by: ['profissionalId'],
      where: {
        deletedAt: null,
        status: 'ATENDIDO',
        inicio: { gte: diasAtras(agora, AI_GROWTH_DIAS_PRODUTIVIDADE), lte: agora },
        profissionalId: { in: ativos.map((p) => p.id) },
      },
      _count: { _all: true },
      _sum: { valor: true },
    });
    const porProfissional = new Map(grupos.map((g) => [g.profissionalId, g]));
    const { quantidade, media, faturado } = profissionaisSubutilizados(
      ativos.map((p) => {
        const grupo = porProfissional.get(p.id);
        return { atendimentos: grupo?._count._all ?? 0, faturado: Number(grupo?._sum.valor ?? 0) };
      }),
    );
    return {
      tipo: 'PROFISSIONAIS_SUBUTILIZADOS',
      quantidade,
      parametros: { media, faturado, dias: AI_GROWTH_DIAS_PRODUTIVIDADE },
    };
  }

  private async aniversariantes(agora: Date): Promise<number> {
    const pacientes = await this.txHost.tx.paciente.findMany({
      where: { deletedAt: null, status: 'ATIVO', dataNascimento: { not: null } },
      select: { dataNascimento: true },
    });
    return contarAniversariantes(
      pacientes.flatMap((p) => (p.dataNascimento ? [p.dataNascimento] : [])),
      agora,
    );
  }
}
