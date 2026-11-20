import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import {
  AGENDAMENTO_DURACAO_MAX,
  minutosDoDia,
  SALA_BLOQUEIO_TIPO_ROTULOS,
  type SalaBloqueio,
  type SalaBloqueioTipo,
} from '@torres/shared';
import { BusinessException } from '../../../common/errors/api.exception';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import { formatarDia } from '../../../common/relatorios/periodo';
import type { Prisma } from '../../../generated/prisma/client';
import type { IndisponibilidadeProfissional } from '../../gestao-profissionais/profissionais/disponibilidade-profissional';
import { ProfissionalAgendaService } from '../../gestao-profissionais/profissionais/profissional-agenda.service';
import { SalasService } from '../../gestao-profissionais/salas/salas.service';
import { SalasBloqueiosService } from '../../gestao-profissionais/salas/salas-bloqueios.service';
import { dataHoraLocal, horaDeMinutos, MINUTO_MS } from './agenda-tempo';

export interface OcupacaoPretendida {
  salaId: string;
  profissionalId: string;
  /** Dia (`AAAA-MM-DD`) e hora (`HH:MM`) de início, no fuso da clínica. */
  data: string;
  hora: string;
  inicio: Date;
  duracaoMinutos: number;
  /** Agendamento que está sendo alterado: não conflita consigo mesmo. */
  ignorarId?: string;
}

/**
 * Bloqueios de sala em nome do próprio profissional (reserva, cortesia, uso avulso) não o
 * impedem de agendar ali: a sala foi reservada para ele. Os demais tipos sempre impedem.
 */
const TIPOS_DO_PROFISSIONAL: readonly SalaBloqueioTipo[] = ['RESERVA', 'CORTESIA', 'USO_AVULSO'];

/** Só o cancelado libera sala e horário (decisão do dev na #136). */
const STATUS_QUE_LIBERAM = ['CANCELADO'] as const;

function conflito(codigo: string, mensagem: string): BusinessException {
  return new BusinessException(codigo, mensagem, { status: 409 });
}

function descreverIntervalo(inicio: Date, duracaoMinutos: number): string {
  const de = dataHoraLocal(inicio);
  const ate = dataHoraLocal(new Date(inicio.getTime() + duracaoMinutos * MINUTO_MS));
  return `em ${formatarDia(de.data)}, das ${de.hora} às ${ate.hora}`;
}

/**
 * Regras de ocupação do agendamento (issue #136): o profissional atende no horário, não tem
 * outro agendamento sobreposto e a sala está livre e sem bloqueio. Tudo roda na transação da
 * gravação, com a sala e o profissional travados para que duas gravações simultâneas no mesmo
 * horário não passem as duas.
 */
@Injectable()
export class AgendaConflitosService {
  constructor(
    private readonly txHost: TransactionHost<PrismaAdapter>,
    private readonly salas: SalasService,
    private readonly bloqueiosSala: SalasBloqueiosService,
    private readonly agendaProfissional: ProfissionalAgendaService,
  ) {}

  /**
   * Confere se o horário pode ser ocupado e lança 409 com a mensagem do conflito se não puder.
   * Ordem fixa de travas (sala, depois profissional) para não gerar deadlock entre gravações.
   */
  async garantirLivre(pretendida: OcupacaoPretendida): Promise<void> {
    const sala = await this.salas.travarParaAgendamento(pretendida.salaId);
    await this.travarProfissional(pretendida.profissionalId);

    const inicioMin = minutosDoDia(pretendida.hora);
    const fimMin = inicioMin + pretendida.duracaoMinutos;
    await this.garantirProfissionalAtende(pretendida, inicioMin, fimMin);
    await this.garantirProfissionalLivre(pretendida);
    await this.garantirSalaLivre(pretendida);
    await this.garantirSalaSemBloqueio(pretendida, sala.nome, inicioMin, fimMin);
  }

  /** Trava por profissional sem depender de linha de outro módulo (liberada no fim da transação). */
  private async travarProfissional(profissionalId: string): Promise<void> {
    await this.txHost.tx
      .$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`agenda-profissional:${profissionalId}`}, 0))`;
  }

  private async garantirProfissionalAtende(
    p: OcupacaoPretendida,
    inicioMin: number,
    fimMin: number,
  ): Promise<void> {
    const motivo = await this.agendaProfissional.disponibilidade(
      p.profissionalId,
      p.data,
      inicioMin,
      fimMin,
    );
    if (!motivo) return;
    throw this.excecaoIndisponivel(motivo, descreverIntervalo(p.inicio, p.duracaoMinutos));
  }

  private excecaoIndisponivel(
    motivo: IndisponibilidadeProfissional,
    periodo: string,
  ): BusinessException {
    switch (motivo.motivo) {
      case 'SEM_HORARIO_CADASTRADO':
        return conflito(
          'AGENDA_SEM_HORARIO',
          'O profissional não tem horário de atendimento cadastrado.',
        );
      case 'BLOQUEADO':
        return conflito(
          'AGENDA_PROFISSIONAL_BLOQUEADO',
          `O profissional tem bloqueio de agenda (${motivo.descricao}) ${periodo}.`,
        );
      case 'NO_ALMOCO':
        return conflito(
          'AGENDA_FORA_DO_HORARIO',
          `O horário solicitado (${periodo}) coincide com o almoço do profissional.`,
        );
      case 'FORA_DO_HORARIO':
        return conflito(
          'AGENDA_FORA_DO_HORARIO',
          `O horário solicitado (${periodo}) está fora do horário de atendimento do profissional.`,
        );
    }
  }

  private async garantirProfissionalLivre(p: OcupacaoPretendida): Promise<void> {
    const outro = await this.agendamentoSobreposto(p, { profissionalId: p.profissionalId });
    if (!outro) return;
    throw conflito(
      'AGENDA_PROFISSIONAL_CONFLITO',
      `${outro.profissional.nome} já tem agendamento ${descreverIntervalo(outro.inicio, outro.duracaoMinutos)}.`,
    );
  }

  private async garantirSalaLivre(p: OcupacaoPretendida): Promise<void> {
    const outro = await this.agendamentoSobreposto(p, { salaId: p.salaId });
    if (!outro) return;
    const nome = outro.sala?.nome ?? 'selecionada';
    throw conflito(
      'AGENDA_SALA_CONFLITO',
      `A sala ${nome} já tem agendamento ${descreverIntervalo(outro.inicio, outro.duracaoMinutos)}.`,
    );
  }

  /**
   * Agendamento não cancelado do mesmo profissional ou da mesma sala que invade `[início, fim)`.
   * A busca usa o maior agendamento possível como margem e a sobreposição exata é conferida aqui.
   */
  private async agendamentoSobreposto(p: OcupacaoPretendida, dono: Prisma.AgendamentoWhereInput) {
    const inicioMs = p.inicio.getTime();
    const fimMs = inicioMs + p.duracaoMinutos * MINUTO_MS;
    const candidatos = await this.txHost.tx.agendamento.findMany({
      where: {
        ...dono,
        deletedAt: null,
        status: { notIn: [...STATUS_QUE_LIBERAM] },
        id: p.ignorarId ? { not: p.ignorarId } : undefined,
        inicio: {
          lt: new Date(fimMs),
          gt: new Date(inicioMs - AGENDAMENTO_DURACAO_MAX * MINUTO_MS),
        },
      },
      orderBy: [{ inicio: 'asc' }, { numero: 'asc' }],
      include: { sala: { select: { nome: true } }, profissional: { select: { nome: true } } },
    });
    return candidatos.find((c) => {
      const cInicio = c.inicio.getTime();
      return cInicio < fimMs && cInicio + c.duracaoMinutos * MINUTO_MS > inicioMs;
    });
  }

  private async garantirSalaSemBloqueio(
    p: OcupacaoPretendida,
    salaNome: string,
    inicioMin: number,
    fimMin: number,
  ): Promise<void> {
    const bloqueios: SalaBloqueio[] = await this.bloqueiosSala.sobrepostosAoHorario(
      p.salaId,
      p.data,
      horaDeMinutos(inicioMin),
      horaDeMinutos(fimMin),
    );
    const impede = bloqueios.find(
      (b) => !(b.profissionalId === p.profissionalId && TIPOS_DO_PROFISSIONAL.includes(b.tipo)),
    );
    if (!impede) return;
    const tipo = SALA_BLOQUEIO_TIPO_ROTULOS[impede.tipo].toLowerCase();
    throw conflito(
      'AGENDA_SALA_BLOQUEADA',
      `A sala ${salaNome} tem ${tipo} ${descreverIntervalo(p.inicio, p.duracaoMinutos)} e não pode receber agendamentos.`,
    );
  }
}
