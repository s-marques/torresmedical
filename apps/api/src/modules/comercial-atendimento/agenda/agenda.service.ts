import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import {
  AGENDAMENTO_STATUS_CANCELAVEIS,
  mensagemObrigatoria,
  type Agendamento as AgendamentoDto,
  type AgendaProfissional,
  type CancelarComMotivoInput,
  type CreateAgendamentoInput,
  type ListAgendamentosQuery,
  type ProfissionalCor,
  type SalaSugerida,
  type SalaSugeridaQuery,
  type UpdateAgendamentoInput,
} from '@torres/shared';
import type { Agendamento, Prisma } from '../../../generated/prisma/client';
import { CancelamentosService } from '../../../common/cancelamentos/cancelamentos.service';
import { EscopoDadosService } from '../../../common/auth/escopo-dados.service';
import { isUuid } from '../../../common/auth/tokens';
import { BusinessException } from '../../../common/errors/api.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import { intervaloDoPeriodo } from '../../../common/relatorios/periodo';
import { TiposAgendamentoService } from '../../configuracoes-gestao/tipos-agendamento/tipos-agendamento.service';
import { ProfissionaisService } from '../../gestao-profissionais/profissionais/profissionais.service';
import { SalasService } from '../../gestao-profissionais/salas/salas.service';
import { PacientesService } from '../pacientes/pacientes.service';
import { AgendaConflitosService } from './agenda-conflitos.service';
import { dataHoraLocal, instanteDeInicio } from './agenda-tempo';

export { instanteDeInicio };

const COM_RELACOES = {
  paciente: { select: { nome: true } },
  profissional: { select: { nome: true, corCalendario: true } },
  tipoAgendamento: { select: { nome: true } },
  sala: { select: { nome: true } },
} as const;

type AgendamentoComRelacoes = Prisma.AgendamentoGetPayload<{ include: typeof COM_RELACOES }>;

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
    salaId: a.salaId,
    salaNome: a.sala?.nome ?? null,
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
    private readonly escopo: EscopoDadosService,
    private readonly salas: SalasService,
    private readonly conflitos: AgendaConflitosService,
    private readonly cancelamentos: CancelamentosService,
  ) {}

  /** Agendamentos do período (dias inteiros, inclusive), por data e hora. Cancelados continuam (legenda). */
  async list(query: ListAgendamentosQuery): Promise<AgendamentoDto[]> {
    const { gte, lt } = intervaloDoPeriodo(query.inicio, query.fim);
    const where: Prisma.AgendamentoWhereInput = {
      deletedAt: null,
      inicio: { gte, lt },
      profissionalId: this.escopo.filtroProfissional(query.profissionalId),
    };
    const lista = await this.txHost.tx.agendamento.findMany({
      where,
      include: COM_RELACOES,
      orderBy: [{ inicio: 'asc' }, { numero: 'asc' }],
    });
    return lista.map(toAgendamentoDto);
  }

  /** Colunas e filtro do calendário: só os profissionais no escopo do usuário (issue #153). */
  async listarProfissionais(): Promise<AgendaProfissional[]> {
    const profissionais = await this.profissionais.listarParaAgenda();
    return profissionais.filter((p) => this.escopo.permite(p.id));
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
    this.escopo.garantirProfissional(agendamento.profissionalId);
    return toAgendamentoDto(agendamento);
  }

  /**
   * Cria como `AGENDADO`. Paciente, profissional, sala e tipo precisam existir (404 caso
   * contrário). Usuário restrito só agenda para os profissionais vinculados (403). Recusa com
   * 409 o horário em que a sala ou o profissional já estão ocupados, o profissional não atende
   * ou a sala está bloqueada (issue #136).
   */
  async create(input: CreateAgendamentoInput): Promise<AgendamentoDto> {
    this.escopo.garantirProfissional(input.profissionalId);
    await this.pacientes.findById(input.pacienteId);
    await this.profissionais.garantirExiste(input.profissionalId);
    if (input.tipoAgendamentoId) await this.tipos.findById(input.tipoAgendamentoId);

    const inicio = instanteDeInicio(input.data, input.hora);
    await this.conflitos.garantirLivre({
      salaId: input.salaId,
      profissionalId: input.profissionalId,
      data: input.data,
      hora: input.hora,
      inicio,
      duracaoMinutos: input.duracaoMinutos,
    });

    const criado: Agendamento = await this.txHost.tx.agendamento.create({
      data: {
        pacienteId: input.pacienteId,
        profissionalId: input.profissionalId,
        salaId: input.salaId,
        tipoAgendamentoId: input.tipoAgendamentoId,
        inicio,
        duracaoMinutos: input.duracaoMinutos,
        valor: input.valor,
        convenio: input.convenio,
        observacoes: input.observacoes,
      },
    });
    return this.findById(criado.id);
  }

  /**
   * Reagenda: troca sala, data, hora e/ou duração (decisão do dev na #136), com as mesmas
   * validações da criação. O que não vier no corpo fica como está. Agendamento antigo, sem sala,
   * só é alterado se o corpo trouxer a sala. Cancelado não ocupa sala nem horário e por isso não
   * é conferido.
   */
  async update(id: string, input: UpdateAgendamentoInput): Promise<AgendamentoDto> {
    const atual = isUuid(id)
      ? await this.txHost.tx.agendamento.findFirst({ where: { id, deletedAt: null } })
      : null;
    if (!atual) {
      throw new BusinessException(ErrorCode.NOT_FOUND, 'Agendamento não encontrado', {
        status: 404,
      });
    }
    this.escopo.garantirProfissional(atual.profissionalId);

    const salaId = input.salaId ?? atual.salaId;
    if (!salaId) {
      const message = mensagemObrigatoria('Sala', 'f');
      throw new BusinessException(ErrorCode.VALIDATION_ERROR, message, {
        status: 400,
        details: [{ field: 'salaId', message }],
      });
    }
    const local = dataHoraLocal(atual.inicio);
    const data = input.data ?? local.data;
    const hora = input.hora ?? local.hora;
    const duracaoMinutos = input.duracaoMinutos ?? atual.duracaoMinutos;
    const inicio = instanteDeInicio(data, hora);

    if (atual.status !== 'CANCELADO') {
      await this.conflitos.garantirLivre({
        salaId,
        profissionalId: atual.profissionalId,
        data,
        hora,
        inicio,
        duracaoMinutos,
        ignorarId: atual.id,
      });
    }
    await this.txHost.tx.agendamento.update({
      where: { id: atual.id },
      data: { salaId, inicio, duracaoMinutos },
    });
    return this.findById(atual.id);
  }

  /**
   * Cancela o agendamento (issue #162): só Agendado, Confirmado ou Reagendar. O motivo da lista é
   * obrigatório; reagendouParaId liga ao novo agendamento. Cancelado não ocupa sala nem horário.
   */
  async cancelar(id: string, input: CancelarComMotivoInput): Promise<AgendamentoDto> {
    const atual = isUuid(id)
      ? await this.txHost.tx.agendamento.findFirst({ where: { id, deletedAt: null } })
      : null;
    if (!atual) {
      throw new BusinessException(ErrorCode.NOT_FOUND, 'Agendamento não encontrado', {
        status: 404,
      });
    }
    this.escopo.garantirProfissional(atual.profissionalId);
    if (!AGENDAMENTO_STATUS_CANCELAVEIS.includes(atual.status)) {
      throw new BusinessException(
        'AGENDAMENTO_NAO_CANCELAVEL',
        'Só é possível cancelar um agendamento agendado, confirmado ou a reagendar.',
        { status: 409 },
      );
    }
    if (input.reagendouParaId) await this.garantirNovoAgendamento(atual.id, input.reagendouParaId);

    await this.cancelamentos.registrar({
      tipo: 'CONSULTA',
      entidade: 'Agendamento',
      entidadeId: atual.id,
      motivoId: input.motivoId,
      observacao: input.observacao,
      profissionalId: atual.profissionalId,
      reagendouParaId: input.reagendouParaId,
    });
    await this.txHost.tx.agendamento.update({
      where: { id: atual.id },
      data: { status: 'CANCELADO' },
    });
    return this.findById(atual.id);
  }

  /** O novo agendamento existe, é outro e está no escopo do usuário. */
  private async garantirNovoAgendamento(canceladoId: string, novoId: string): Promise<void> {
    const novo = isUuid(novoId)
      ? await this.txHost.tx.agendamento.findFirst({ where: { id: novoId, deletedAt: null } })
      : null;
    if (!novo || novo.id === canceladoId) {
      throw new BusinessException(ErrorCode.VALIDATION_ERROR, 'Novo agendamento inválido', {
        status: 400,
        details: [{ field: 'reagendouParaId', message: 'Novo agendamento inválido' }],
      });
    }
    this.escopo.garantirProfissional(novo.profissionalId);
  }

  /** Sala do contrato do profissional para o dia e a hora, ou `null` (o usuário escolhe). */
  async sugerirSala(query: SalaSugeridaQuery): Promise<SalaSugerida> {
    this.escopo.garantirProfissional(query.profissionalId);
    const sala = await this.salas.sugerirDoProfissional(
      query.profissionalId,
      query.data,
      query.hora,
    );
    return { salaId: sala?.id ?? null, salaNome: sala?.nome ?? null };
  }
}
