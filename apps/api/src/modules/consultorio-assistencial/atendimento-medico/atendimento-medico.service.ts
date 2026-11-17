import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import {
  listProtocolosQuerySchema,
  type AtendimentoEmCurso,
  type AtendimentoMedicoDetalhe,
  type AtendimentoMedicoItem,
  type CreateEvolucaoInput,
  type CreateReceitaInput,
  type CreateRecebimentoInput,
  type Evolucao,
  type HistoricoAtendimento,
  type ListAtendimentoMedicoQuery,
  type ListProtocolosReceitaQuery,
  type ListRegistrosQuery,
  type Paciente,
  type PacienteDadosAtendimento,
  type PagamentoAtendimento,
  type ProtocoloCategorias,
  type ProtocoloReceita,
  type Receita,
  type Recebimento,
} from '@torres/shared';
import type {
  Atendimento as AtendimentoModel,
  AtendimentoEvolucao,
  AtendimentoReceita,
} from '../../../generated/prisma/client';
import { AuditService } from '../../../common/audit/audit.service';
import { BusinessException } from '../../../common/errors/api.exception';
import { paginate, type Page } from '../../../common/pagination/paginate';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import { AgendamentosAtendimentoService } from '../../comercial-atendimento/agenda/agendamentos-atendimento.service';
import { PacientesService } from '../../comercial-atendimento/pacientes/pacientes.service';
import { ProfissionaisService } from '../../gestao-profissionais/profissionais/profissionais.service';
import { ProtocolosService } from '../../gestao-profissionais/protocolos/protocolos.service';

export function toAtendimentoEmCurso(a: AtendimentoModel): AtendimentoEmCurso {
  return {
    id: a.id,
    // Só atendimentos com agendamento chegam aqui (busca por `agendamentoId`).
    agendamentoId: a.agendamentoId ?? '',
    status: a.status,
    iniciadoEm: (a.iniciadoEm ?? a.createdAt).toISOString(),
    finalizadoEm: a.finalizadoEm?.toISOString() ?? null,
  };
}

export function toEvolucao(e: AtendimentoEvolucao, profissionalNome: string | null): Evolucao {
  return {
    id: e.id,
    atendimentoId: e.atendimentoId,
    tipo: e.tipo,
    texto: e.texto,
    profissionalNome,
    createdAt: e.createdAt.toISOString(),
  };
}

export function toReceita(r: AtendimentoReceita, profissionalNome: string | null): Receita {
  return {
    id: r.id,
    atendimentoId: r.atendimentoId,
    tipo: r.tipo,
    controlada: r.controlada,
    validadeDias: r.validadeDias,
    texto: r.texto,
    observacoes: r.observacoes,
    profissionalNome,
    createdAt: r.createdAt.toISOString(),
  };
}

/** Logradouro, número, complemento e bairro numa linha; `null` sem nenhum deles. */
export function enderecoEmLinha(
  p: Pick<Paciente, 'logradouro' | 'numero' | 'complemento' | 'bairro'>,
): string | null {
  const partes = [p.logradouro, p.numero, p.complemento, p.bairro].filter(Boolean);
  return partes.length > 0 ? partes.join(', ') : null;
}

export function toPacienteDados(p: Paciente): PacienteDadosAtendimento {
  return {
    id: p.id,
    nome: p.nome,
    documento: p.documento,
    rg: p.rg,
    dataNascimento: p.dataNascimento,
    sexo: p.sexo,
    telefone: p.celular ?? p.telefone,
    email: p.email,
    endereco: enderecoEmLinha(p),
    cidade: p.cidade,
    uf: p.uf,
    observacoes: p.observacoes,
  };
}

const NAO_EXCLUIDO = { deletedAt: null } as const;

/**
 * Tela Atendimento Médico (`/atendimento-medico`, #38). Agendamento e Paciente são de
 * comercial-atendimento e Profissional de gestao-profissionais: o acesso é pelos services
 * exportados (CLAUDE.md, seção 3). Atendimento e Evolução são deste módulo.
 */
@Injectable()
export class AtendimentoMedicoService {
  constructor(
    private readonly txHost: TransactionHost<PrismaAdapter>,
    private readonly agendamentos: AgendamentosAtendimentoService,
    private readonly pacientes: PacientesService,
    private readonly profissionais: ProfissionaisService,
    private readonly protocolos: ProtocolosService,
    private readonly audit: AuditService,
  ) {}

  listar(query: ListAtendimentoMedicoQuery): Promise<Page<AtendimentoMedicoItem>> {
    return this.agendamentos.listarDoDia(query);
  }

  async detalhe(agendamentoId: string): Promise<AtendimentoMedicoDetalhe> {
    const agendamento = await this.agendamentos.resumo(agendamentoId);
    const atendimento = await this.atendimentoDo(agendamentoId);
    return { agendamento, atendimento: atendimento ? toAtendimentoEmCurso(atendimento) : null };
  }

  /**
   * "Atender"/"Iniciar Atendimento": abre o atendimento clínico com o horário de entrada e muda
   * o agendamento para `EM_ATENDIMENTO`. Cancelado não pode ser atendido.
   */
  async iniciar(agendamentoId: string): Promise<AtendimentoEmCurso> {
    const agendamento = await this.agendamentos.resumo(agendamentoId);
    if (agendamento.status === 'CANCELADO') {
      throw new BusinessException(
        'AGENDAMENTO_CANCELADO',
        'Agendamento cancelado não pode ser atendido.',
      );
    }
    if (await this.atendimentoDo(agendamentoId)) {
      throw new BusinessException('ATENDIMENTO_JA_INICIADO', 'O atendimento já foi iniciado.');
    }
    if (agendamento.status === 'ATENDIDO') {
      throw new BusinessException('AGENDAMENTO_JA_ATENDIDO', 'Este agendamento já foi atendido.');
    }

    const criado = await this.txHost.tx.atendimento.create({
      data: {
        pacienteId: agendamento.pacienteId,
        profissionalId: agendamento.profissionalId,
        agendamentoId,
        horario: new Date(agendamento.inicio),
        iniciadoEm: new Date(),
        status: 'EM_ANDAMENTO',
      },
    });
    await this.agendamentos.alterarStatus(agendamentoId, 'EM_ATENDIMENTO');
    return toAtendimentoEmCurso(criado);
  }

  /** "Histórico de Evoluções": evoluções do paciente em todos os atendimentos. */
  async listarEvolucoes(agendamentoId: string, query: ListRegistrosQuery): Promise<Page<Evolucao>> {
    const { pacienteId } = await this.agendamentos.resumo(agendamentoId);
    const where = { ...NAO_EXCLUIDO, atendimento: { pacienteId, ...NAO_EXCLUIDO } };
    const pagina = await paginate(query, {
      findMany: (p) =>
        this.txHost.tx.atendimentoEvolucao.findMany({
          where,
          include: { atendimento: { select: { profissionalId: true } } },
          orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
          ...p,
        }),
      count: () => this.txHost.tx.atendimentoEvolucao.count({ where }),
    });
    const nomes = await this.nomesProfissionais(
      pagina.data.map((e) => e.atendimento.profissionalId),
    );
    return {
      ...pagina,
      data: pagina.data.map((e) => toEvolucao(e, nomes.get(e.atendimento.profissionalId) ?? null)),
    };
  }

  /** "Salvar Evolução": só com o atendimento em andamento. */
  async criarEvolucao(agendamentoId: string, input: CreateEvolucaoInput): Promise<Evolucao> {
    const atendimento = await this.atendimentoEmAndamento(agendamentoId);
    const criada = await this.txHost.tx.atendimentoEvolucao.create({
      data: { atendimentoId: atendimento.id, tipo: input.tipo, texto: input.texto },
    });
    const nomes = await this.nomesProfissionais([atendimento.profissionalId]);
    return toEvolucao(criada, nomes.get(atendimento.profissionalId) ?? null);
  }

  // --- Aba Receita ---------------------------------------------------------------------

  /** "Receitas Anteriores": receitas do paciente em todos os atendimentos. */
  async listarReceitas(agendamentoId: string, query: ListRegistrosQuery): Promise<Page<Receita>> {
    const { pacienteId } = await this.agendamentos.resumo(agendamentoId);
    const where = { ...NAO_EXCLUIDO, atendimento: { pacienteId, ...NAO_EXCLUIDO } };
    const pagina = await paginate(query, {
      findMany: (p) =>
        this.txHost.tx.atendimentoReceita.findMany({
          where,
          include: { atendimento: { select: { profissionalId: true } } },
          orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
          ...p,
        }),
      count: () => this.txHost.tx.atendimentoReceita.count({ where }),
    });
    const nomes = await this.nomesProfissionais(
      pagina.data.map((r) => r.atendimento.profissionalId),
    );
    return {
      ...pagina,
      data: pagina.data.map((r) => toReceita(r, nomes.get(r.atendimento.profissionalId) ?? null)),
    };
  }

  /** "Salvar Receita": só com o atendimento em andamento. */
  async criarReceita(agendamentoId: string, input: CreateReceitaInput): Promise<Receita> {
    const atendimento = await this.atendimentoEmAndamento(agendamentoId);
    const criada = await this.txHost.tx.atendimentoReceita.create({
      data: { atendimentoId: atendimento.id, ...input },
    });
    const nomes = await this.nomesProfissionais([atendimento.profissionalId]);
    return toReceita(criada, nomes.get(atendimento.profissionalId) ?? null);
  }

  /** "Selecionar Protocolo/Receita": protocolos do cadastro (gestao-profissionais). */
  async listarProtocolos(query: ListProtocolosReceitaQuery): Promise<Page<ProtocoloReceita>> {
    const pagina = await this.protocolos.list(
      listProtocolosQuerySchema.parse({
        page: query.page,
        pageSize: query.pageSize,
        search: query.search,
        categoria: query.categoria,
      }),
    );
    return {
      ...pagina,
      data: pagina.data.map((p) => ({
        id: p.id,
        nome: p.nome,
        categoria: p.categoria,
        texto: p.observacoes,
      })),
    };
  }

  /** Opções do select "Todas" do seletor de protocolos. */
  categoriasProtocolos(): Promise<ProtocoloCategorias> {
    return this.protocolos.categorias();
  }

  // --- Aba Pagamento -------------------------------------------------------------------

  pagamento(agendamentoId: string): Promise<PagamentoAtendimento> {
    return this.agendamentos.pagamento(agendamentoId);
  }

  registrarRecebimento(agendamentoId: string, input: CreateRecebimentoInput): Promise<Recebimento> {
    return this.agendamentos.registrarRecebimento(agendamentoId, input);
  }

  // --- Aba Histórico -------------------------------------------------------------------

  /** Atendimentos do paciente, do mais recente para o mais antigo, com as evoluções. */
  async historico(
    agendamentoId: string,
    query: ListRegistrosQuery,
  ): Promise<Page<HistoricoAtendimento>> {
    const { pacienteId } = await this.agendamentos.resumo(agendamentoId);
    const where = { pacienteId, ...NAO_EXCLUIDO };
    const pagina = await paginate(query, {
      findMany: (p) =>
        this.txHost.tx.atendimento.findMany({
          where,
          include: {
            evolucoes: { where: NAO_EXCLUIDO, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
            _count: { select: { receitas: { where: NAO_EXCLUIDO } } },
          },
          orderBy: [{ iniciadoEm: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
          ...p,
        }),
      count: () => this.txHost.tx.atendimento.count({ where }),
    });
    const nomes = await this.nomesProfissionais(pagina.data.map((a) => a.profissionalId));
    return {
      ...pagina,
      data: pagina.data.map((a) => ({
        id: a.id,
        agendamentoId: a.agendamentoId,
        status: a.status,
        iniciadoEm: (a.iniciadoEm ?? a.createdAt).toISOString(),
        finalizadoEm: a.finalizadoEm?.toISOString() ?? null,
        profissionalNome: nomes.get(a.profissionalId) ?? null,
        evolucoes: a.evolucoes.map((e) => ({
          id: e.id,
          tipo: e.tipo,
          texto: e.texto,
          createdAt: e.createdAt.toISOString(),
        })),
        totalReceitas: a._count.receitas,
      })),
    };
  }

  // --- Finalizar -----------------------------------------------------------------------

  /**
   * "Finalizar": grava o horário de fim, encerra o atendimento e muda o agendamento para
   * `ATENDIDO`. Os dois registros vão para o audit_log na mesma transação.
   */
  finalizar(agendamentoId: string): Promise<AtendimentoEmCurso> {
    return this.txHost.withTransaction(async () => {
      const antes = await this.atendimentoEmAndamento(agendamentoId);
      const depois = await this.txHost.tx.atendimento.update({
        where: { id: antes.id },
        data: { status: 'FINALIZADO', finalizadoEm: new Date() },
      });
      await this.audit.record({
        action: 'UPDATE',
        entity: 'Atendimento',
        entityId: antes.id,
        before: antes,
        after: depois,
      });
      await this.agendamentos.alterarStatus(agendamentoId, 'ATENDIDO');
      return toAtendimentoEmCurso(depois);
    });
  }

  /** Aba "Dados": informações pessoais e contato do paciente do agendamento. */
  async dadosPaciente(agendamentoId: string): Promise<PacienteDadosAtendimento> {
    const { pacienteId } = await this.agendamentos.resumo(agendamentoId);
    return toPacienteDados(await this.pacientes.detalhe(pacienteId));
  }

  /** Atendimento iniciado e não finalizado; 404 sem agendamento, 422 nos demais casos. */
  private async atendimentoEmAndamento(agendamentoId: string): Promise<AtendimentoModel> {
    await this.agendamentos.resumo(agendamentoId);
    const atendimento = await this.atendimentoDo(agendamentoId);
    if (!atendimento) {
      throw new BusinessException('ATENDIMENTO_NAO_INICIADO', 'Inicie o atendimento primeiro.');
    }
    if (atendimento.status !== 'EM_ANDAMENTO') {
      throw new BusinessException('ATENDIMENTO_FINALIZADO', 'O atendimento já foi finalizado.');
    }
    return atendimento;
  }

  private atendimentoDo(agendamentoId: string): Promise<AtendimentoModel | null> {
    return this.txHost.tx.atendimento.findFirst({ where: { agendamentoId, ...NAO_EXCLUIDO } });
  }

  /** Nome de cada profissional (sem FK), 1 consulta por id distinto. */
  private async nomesProfissionais(ids: readonly string[]): Promise<Map<string, string>> {
    const nomes = new Map<string, string>();
    await Promise.all(
      [...new Set(ids)].map(async (id) => {
        try {
          nomes.set(id, (await this.profissionais.detalhe(id)).nome);
        } catch {
          // Profissional excluído depois do registro: sem nome.
        }
      }),
    );
    return nomes;
  }
}
