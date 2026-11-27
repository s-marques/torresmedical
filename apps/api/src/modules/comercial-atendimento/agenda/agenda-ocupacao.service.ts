import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import type { AgendamentoStatus } from '@torres/shared';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import { intervaloDoPeriodo } from '../../../common/relatorios/periodo';
import { dataHoraLocal } from './agenda-tempo';

/** Agendamento com sala, no formato que o Painel usa para medir a ocupação (issue #139). */
export interface AgendamentoDaOcupacao {
  salaId: string;
  profissionalId: string;
  /** Dia (`AAAA-MM-DD`) e minutos desde as 00:00, no fuso da clínica. */
  data: string;
  inicioMinuto: number;
  fimMinuto: number;
  status: AgendamentoStatus;
}

const DIA_EM_MINUTOS = 24 * 60;
/** Nenhum agendamento passa de um dia: limita a busca dos que podem estar em curso. */
const JANELA_MAXIMA_MS = DIA_EM_MINUTOS * 60_000;
const STATUS_OCUPANDO_SALA: readonly AgendamentoStatus[] = [
  'AGENDADO',
  'CONFIRMADO',
  'CHECK_IN',
  'AGUARDANDO',
  'EM_ATENDIMENTO',
];

/**
 * Consulta de agendamentos por sala para o Painel (issue #139). Exportado do módulo: o Painel não
 * acessa a tabela de agendamentos (CLAUDE.md §3). Não aplica o escopo de dados: quem chama já
 * aplicou o seu (CLAUDE.md §6).
 */
@Injectable()
export class AgendaOcupacaoService {
  constructor(private readonly txHost: TransactionHost<PrismaAdapter>) {}

  /**
   * Salas em uso no instante `agora` (Painel "Hoje", #170): agendamento com sala que já começou e
   * ainda não terminou. Cancelado, reagendar, falta e atendimento concluído não ocupam a sala.
   */
  async salasOcupadasEm(agora: Date): Promise<ReadonlySet<string>> {
    const candidatos = await this.txHost.tx.agendamento.findMany({
      where: {
        deletedAt: null,
        salaId: { not: null },
        status: { in: [...STATUS_OCUPANDO_SALA] },
        inicio: { gt: new Date(agora.getTime() - JANELA_MAXIMA_MS), lte: agora },
      },
      select: { salaId: true, inicio: true, duracaoMinutos: true },
    });
    const ocupadas = candidatos
      .filter((a) => a.inicio.getTime() + a.duracaoMinutos * 60_000 > agora.getTime())
      .flatMap((a) => (a.salaId ? [a.salaId] : []));
    return new Set(ocupadas);
  }

  /** Agendamentos não cancelados nas salas, de `de` a `ate` (`AAAA-MM-DD`, inclusive). */
  async doPeriodo(
    de: string,
    ate: string,
    salaIds: readonly string[],
  ): Promise<AgendamentoDaOcupacao[]> {
    if (salaIds.length === 0) return [];
    const { gte, lt } = intervaloDoPeriodo(de, ate);
    const agendamentos = await this.txHost.tx.agendamento.findMany({
      where: {
        deletedAt: null,
        status: { not: 'CANCELADO' },
        salaId: { in: [...salaIds] },
        inicio: { gte, lt },
      },
      select: {
        salaId: true,
        profissionalId: true,
        inicio: true,
        duracaoMinutos: true,
        status: true,
      },
      orderBy: [{ inicio: 'asc' }, { numero: 'asc' }],
    });
    return agendamentos.flatMap((a) => {
      if (!a.salaId) return [];
      const { data, hora } = dataHoraLocal(a.inicio);
      const [h = 0, m = 0] = hora.split(':').map(Number);
      const inicioMinuto = h * 60 + m;
      return [
        {
          salaId: a.salaId,
          profissionalId: a.profissionalId,
          data,
          inicioMinuto,
          fimMinuto: Math.min(inicioMinuto + a.duracaoMinutos, DIA_EM_MINUTOS),
          status: a.status,
        },
      ];
    });
  }
}
