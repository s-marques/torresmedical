import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import type {
  BloqueioAgenda as BloqueioDto,
  CriarBloqueioData,
  HorarioAtendimento as HorarioDto,
  SalvarHorariosInput,
} from '@torres/shared';
import type { BloqueioAgenda, HorarioAtendimento } from '../../../generated/prisma/client';
import { isUuid } from '../../../common/auth/tokens';
import { BusinessException } from '../../../common/errors/api.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import {
  avaliarDisponibilidade,
  type ResultadoDisponibilidade,
} from './disponibilidade-profissional';
import { ProfissionaisService } from './profissionais.service';

function paraData(valor: string): Date {
  return new Date(`${valor}T00:00:00.000Z`);
}

function dataIso(valor: Date): string {
  return valor.toISOString().slice(0, 10);
}

function toHorarioDto(h: HorarioAtendimento): HorarioDto {
  return {
    id: h.id,
    tipo: h.tipo,
    diaSemana: h.diaSemana,
    data: h.data ? dataIso(h.data) : null,
    inicio: h.inicio,
    fim: h.fim,
    almocoInicio: h.almocoInicio,
    almocoFim: h.almocoFim,
  };
}

export function toBloqueioDto(b: BloqueioAgenda): BloqueioDto {
  return {
    id: b.id,
    dataInicio: dataIso(b.dataInicio),
    dataFim: dataIso(b.dataFim),
    tipo: b.tipo,
    horaInicio: b.horaInicio,
    horaFim: b.horaFim,
    motivo: b.motivo,
    createdAt: b.createdAt.toISOString(),
  };
}

/** Horas de hoje (UTC) para listar só os bloqueios que ainda valem. */
function hoje(agora: Date): Date {
  return paraData(dataIso(agora));
}

/** Horários de atendimento e bloqueios de agenda de um profissional (modal Editar e Bloqueios de Agenda). */
@Injectable()
export class ProfissionalAgendaService {
  constructor(
    private readonly txHost: TransactionHost<PrismaAdapter>,
    private readonly profissionais: ProfissionaisService,
  ) {}

  async listarHorarios(profissionalId: string): Promise<HorarioDto[]> {
    await this.profissionais.garantirExiste(profissionalId);
    const horarios = await this.txHost.tx.horarioAtendimento.findMany({
      where: { profissionalId },
      orderBy: [{ tipo: 'asc' }, { diaSemana: 'asc' }, { data: 'asc' }, { inicio: 'asc' }],
    });
    return horarios.map(toHorarioDto);
  }

  /**
   * Se o profissional atende em `[inicioMin, fimMin)` (minutos desde as 00:00) do dia `data`
   * (`AAAA-MM-DD`), pelos horários de atendimento e bloqueios dele. `null` = disponível.
   * Regra da Agenda (issue #136); o profissional já deve existir.
   */
  async disponibilidade(
    profissionalId: string,
    data: string,
    inicioMin: number,
    fimMin: number,
  ): Promise<ResultadoDisponibilidade> {
    const dia = paraData(data);
    const horarios = await this.txHost.tx.horarioAtendimento.findMany({
      where: { profissionalId },
    });
    const bloqueios = await this.txHost.tx.bloqueioAgenda.findMany({
      where: { profissionalId, deletedAt: null, dataInicio: { lte: dia }, dataFim: { gte: dia } },
    });
    return avaliarDisponibilidade(
      horarios.map(toHorarioDto),
      bloqueios.map(toBloqueioDto),
      data,
      inicioMin,
      fimMin,
    );
  }

  /** "Salvar Horários": substitui a lista inteira do profissional. */
  async salvarHorarios(
    profissionalId: string,
    input: SalvarHorariosInput,
  ): Promise<{ id: string; horarios: HorarioDto[] }> {
    await this.profissionais.garantirExiste(profissionalId);
    await this.txHost.tx.horarioAtendimento.deleteMany({ where: { profissionalId } });
    if (input.horarios.length > 0) {
      await this.txHost.tx.horarioAtendimento.createMany({
        data: input.horarios.map((h) => ({
          profissionalId,
          tipo: h.tipo,
          diaSemana: h.tipo === 'SEMANAL' ? h.diaSemana : null,
          data: h.tipo === 'POR_DATA' && h.data ? paraData(h.data) : null,
          inicio: h.inicio,
          fim: h.fim,
          almocoInicio: h.almocoInicio,
          almocoFim: h.almocoFim,
        })),
      });
    }
    return { id: profissionalId, horarios: await this.listarHorarios(profissionalId) };
  }

  /** Bloqueios que ainda valem (data fim de hoje em diante), os mais próximos primeiro. */
  async listarBloqueios(profissionalId: string, agora = new Date()): Promise<BloqueioDto[]> {
    await this.profissionais.garantirExiste(profissionalId);
    const bloqueios = await this.txHost.tx.bloqueioAgenda.findMany({
      where: { profissionalId, deletedAt: null, dataFim: { gte: hoje(agora) } },
      orderBy: [{ dataInicio: 'asc' }, { horaInicio: 'asc' }],
    });
    return bloqueios.map(toBloqueioDto);
  }

  async criarBloqueio(profissionalId: string, input: CriarBloqueioData): Promise<BloqueioDto> {
    await this.profissionais.garantirExiste(profissionalId);
    const criado = await this.txHost.tx.bloqueioAgenda.create({
      data: {
        profissionalId,
        dataInicio: paraData(input.dataInicio),
        dataFim: paraData(input.dataFim),
        tipo: input.tipo,
        horaInicio: input.horaInicio,
        horaFim: input.horaFim,
        motivo: input.motivo,
      },
    });
    return toBloqueioDto(criado);
  }

  /** Remove o bloqueio (exclusão lógica). */
  async removerBloqueio(profissionalId: string, bloqueioId: string): Promise<BloqueioDto> {
    await this.profissionais.garantirExiste(profissionalId);
    const bloqueio = isUuid(bloqueioId)
      ? await this.txHost.tx.bloqueioAgenda.findFirst({
          where: { id: bloqueioId, profissionalId, deletedAt: null },
        })
      : null;
    if (!bloqueio) {
      throw new BusinessException(ErrorCode.NOT_FOUND, 'Bloqueio não encontrado', { status: 404 });
    }
    const removido = await this.txHost.tx.bloqueioAgenda.update({
      where: { id: bloqueioId },
      data: { deletedAt: new Date() },
    });
    return toBloqueioDto(removido);
  }
}
