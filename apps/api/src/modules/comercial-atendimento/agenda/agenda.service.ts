import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import type {
  Agendamento as AgendamentoDto,
  AgendaProfissional,
  CreateAgendamentoInput,
  ListAgendamentosQuery,
  ProfissionalCor,
} from '@torres/shared';
import type { Agendamento, Prisma } from '../../../generated/prisma/client';
import { isUuid } from '../../../common/auth/tokens';
import { BusinessException } from '../../../common/errors/api.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import { inicioDoDia, intervaloDoPeriodo } from '../../../common/relatorios/periodo';
import { TiposAgendamentoService } from '../../configuracoes-gestao/tipos-agendamento/tipos-agendamento.service';
import { ProfissionaisService } from '../../gestao-profissionais/profissionais/profissionais.service';
import { PacientesService } from '../pacientes/pacientes.service';

const COM_RELACOES = {
  paciente: { select: { nome: true } },
  profissional: { select: { nome: true, corCalendario: true } },
  tipoAgendamento: { select: { nome: true } },
} as const;

type AgendamentoComRelacoes = Prisma.AgendamentoGetPayload<{ include: typeof COM_RELACOES }>;

const MINUTO_MS = 60_000;

/** Instante de início a partir do dia e da hora ("HH:MM") no fuso da clínica. */
export function instanteDeInicio(data: string, hora: string): Date {
  const [h = 0, m = 0] = hora.split(':').map(Number);
  return new Date(inicioDoDia(data).getTime() + (h * 60 + m) * MINUTO_MS);
}

/** Resposta da API: o valor decimal vira número e o início, ISO. */
export function toAgendamentoDto(a: AgendamentoComRelacoes): AgendamentoDto {
  return {
    id: a.id,
    numero: a.numero,
    pacienteId: a.pacienteId,
    pacienteNome: a.paciente.nome,
    profissionalId: a.profissionalId,
    profissionalNome: a.profissional.nome,
    profissionalCor: a.profissional.corCalendario as ProfissionalCor,
    tipoAgendamentoId: a.tipoAgendamentoId,
    tipoNome: a.tipoAgendamento?.nome ?? null,
    inicio: a.inicio.toISOString(),
    duracaoMinutos: a.duracaoMinutos,
    valor: a.valor === null ? null : Number(a.valor),
    convenio: a.convenio,
    observacoes: a.observacoes,
    status: a.status,
  };
}

/** Tela Agenda: calendário de agendamentos. Paciente, profissional e tipo vêm dos módulos donos. */
@Injectable()
export class AgendaService {
  constructor(
    private readonly txHost: TransactionHost<PrismaAdapter>,
    private readonly pacientes: PacientesService,
    private readonly profissionais: ProfissionaisService,
    private readonly tipos: TiposAgendamentoService,
  ) {}

  /** Agendamentos do período (dias inteiros, inclusive), por data e hora. Cancelados continuam (legenda). */
  async list(query: ListAgendamentosQuery): Promise<AgendamentoDto[]> {
    const { gte, lt } = intervaloDoPeriodo(query.inicio, query.fim);
    const where: Prisma.AgendamentoWhereInput = {
      deletedAt: null,
      inicio: { gte, lt },
      profissionalId: query.profissionalId,
    };
    const lista = await this.txHost.tx.agendamento.findMany({
      where,
      include: COM_RELACOES,
      orderBy: [{ inicio: 'asc' }, { numero: 'asc' }],
    });
    return lista.map(toAgendamentoDto);
  }

  listarProfissionais(): Promise<AgendaProfissional[]> {
    return this.profissionais.listarParaAgenda();
  }

  async findById(id: string): Promise<AgendamentoDto> {
    const agendamento = isUuid(id)
      ? await this.txHost.tx.agendamento.findFirst({
          where: { id, deletedAt: null },
          include: COM_RELACOES,
        })
      : null;
    if (!agendamento) {
      throw new BusinessException(ErrorCode.NOT_FOUND, 'Agendamento não encontrado', {
        status: 404,
      });
    }
    return toAgendamentoDto(agendamento);
  }

  /** Cria como `AGENDADO`. Paciente, profissional e tipo precisam existir (404 caso contrário). */
  async create(input: CreateAgendamentoInput): Promise<AgendamentoDto> {
    await this.pacientes.findById(input.pacienteId);
    await this.profissionais.garantirExiste(input.profissionalId);
    if (input.tipoAgendamentoId) await this.tipos.findById(input.tipoAgendamentoId);

    const criado: Agendamento = await this.txHost.tx.agendamento.create({
      data: {
        pacienteId: input.pacienteId,
        profissionalId: input.profissionalId,
        tipoAgendamentoId: input.tipoAgendamentoId,
        inicio: instanteDeInicio(input.data, input.hora),
        duracaoMinutos: input.duracaoMinutos,
        valor: input.valor,
        convenio: input.convenio,
        observacoes: input.observacoes,
      },
    });
    return this.findById(criado.id);
  }
}
