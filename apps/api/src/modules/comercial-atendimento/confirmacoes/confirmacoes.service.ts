import { Transactional, TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import {
  CONFIRMACAO_ETAPAS,
  CONFIRMACAO_ETAPA_ROTULO,
  CONFIRMACAO_STATUS_ROTULO,
  type Confirmacao,
  type ConfirmacaoExportColumn,
  type ConfirmacaoHistorico,
  type ConfirmacaoResposta,
  type ConfirmacaoStatus,
  type ExportConfirmacoesQuery,
  type ListConfirmacoesQuery,
  type ListHistoricoConfirmacoesQuery,
  type ResumoConfirmacoes,
  type ResumoConfirmacoesQuery,
} from '@torres/shared';
import { type AgendamentoStatus, Prisma } from '../../../generated/prisma/client';
import { isUuid } from '../../../common/auth/tokens';
import { BusinessException } from '../../../common/errors/api.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import { ExportService, selectColumns } from '../../../common/export/export.service';
import type { ExportColumn, ExportFile } from '../../../common/export/export.types';
import { paginate, type Page } from '../../../common/pagination/paginate';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import { agoraNaClinica } from '../campanhas/relogio-clinica';
import { ConfirmacoesConfigService } from './confirmacoes-config.service';
import { EnvioConfirmacaoService, intervaloDoDia, somarDias } from './envio-confirmacao.service';

const INCLUDE = {
  paciente: { select: { nome: true, celular: true } },
  profissional: { select: { nome: true } },
  tipoAgendamento: { select: { nome: true } },
  enviosConfirmacao: { orderBy: { createdAt: 'asc' } },
} satisfies Prisma.AgendamentoInclude;
type AgendamentoLinha = Prisma.AgendamentoGetPayload<{ include: typeof INCLUDE }>;

/** Status do agendamento que aparecem no grid. */
const STATUS_DO_GRID: AgendamentoStatus[] = ['AGENDADO', 'CONFIRMADO', 'CANCELADO'];

const STATUS_EXIBIDO: Partial<Record<AgendamentoStatus, ConfirmacaoStatus>> = {
  AGENDADO: 'PENDENTE',
  CONFIRMADO: 'CONFIRMADO',
  CANCELADO: 'CANCELADO',
};

type Ordenacao = ListConfirmacoesQuery['sort'];

export const CONFIRMACAO_EXPORT_DEFINITIONS: readonly ExportColumn<
  Confirmacao,
  ConfirmacaoExportColumn
>[] = [
  { key: 'enviadoEm', header: 'Enviado em', type: 'datetime', value: (c) => c.enviadoEm },
  { key: 'agendamento', header: 'Agendamento', type: 'datetime', value: (c) => c.inicio },
  { key: 'paciente', header: 'Paciente', value: (c) => c.paciente, width: 3 },
  { key: 'telefone', header: 'Telefone', value: (c) => c.telefone, width: 2 },
  { key: 'profissional', header: 'Profissional', value: (c) => c.profissional, width: 3 },
  {
    key: 'envios',
    header: 'Confirmações Enviadas',
    value: (c) =>
      c.envios
        .filter((e) => e.status === 'ENVIADO')
        .map((e) => CONFIRMACAO_ETAPA_ROTULO[e.etapa])
        .join(', '),
    width: 3,
  },
  { key: 'status', header: 'Status', value: (c) => CONFIRMACAO_STATUS_ROTULO[c.status] },
];

function orderByDe(sort: Ordenacao): Prisma.AgendamentoOrderByWithRelationInput[] {
  const d = sort.direction;
  const campos: Record<Ordenacao['field'], Prisma.AgendamentoOrderByWithRelationInput> = {
    agendamento: { inicio: d },
    paciente: { paciente: { nome: d } },
    profissional: { profissional: { nome: d } },
    status: { status: d },
  };
  return [campos[sort.field], { inicio: 'asc' }, { numero: 'asc' }];
}

export function toConfirmacao(a: AgendamentoLinha): Confirmacao {
  const envios = a.enviosConfirmacao.map((e) => ({
    etapa: e.etapa,
    status: e.status,
    enviadoEm: e.createdAt.toISOString(),
  }));
  const primeiro = a.enviosConfirmacao.find((e) => e.status === 'ENVIADO');
  return {
    id: a.id,
    numero: a.numero,
    enviadoEm: primeiro ? primeiro.createdAt.toISOString() : null,
    inicio: a.inicio.toISOString(),
    tipo: a.tipoAgendamento?.nome ?? null,
    paciente: a.paciente.nome,
    telefone: a.paciente.celular,
    profissional: a.profissional.nome,
    envios,
    status: STATUS_EXIBIDO[a.status] ?? 'PENDENTE',
  };
}

/** Tela Confirmações (`/confirmacoes`): grid do dia, cartões, histórico e ações da linha. */
@Injectable()
export class ConfirmacoesService {
  constructor(
    private readonly txHost: TransactionHost<PrismaAdapter>,
    private readonly config: ConfirmacoesConfigService,
    private readonly envios: EnvioConfirmacaoService,
    private readonly exportService: ExportService,
  ) {}

  // ---------- Aba Pendentes ----------

  async list(query: ListConfirmacoesQuery): Promise<Page<Confirmacao>> {
    const where = await this.where(query.dataEnvio, query.search);
    const pagina = await paginate(query, {
      findMany: (p) =>
        this.txHost.tx.agendamento.findMany({
          where,
          orderBy: orderByDe(query.sort),
          include: INCLUDE,
          ...p,
        }),
      count: () => this.txHost.tx.agendamento.count({ where }),
    });
    return { ...pagina, data: pagina.data.map(toConfirmacao) };
  }

  /** Cartões: pendentes do dia e quantas MSG1/2/3 já saíram para os agendamentos dele. */
  async resumo(query: ResumoConfirmacoesQuery): Promise<ResumoConfirmacoes> {
    const where = await this.where(query.dataEnvio);
    const [pendentes, enviados] = await Promise.all([
      this.txHost.tx.agendamento.count({ where: { ...where, status: 'AGENDADO' } }),
      this.txHost.tx.envioConfirmacao.groupBy({
        by: ['etapa'],
        where: { status: 'ENVIADO', agendamento: where },
        _count: { _all: true },
      }),
    ]);
    const de = (etapa: (typeof CONFIRMACAO_ETAPAS)[number]) =>
      enviados.find((e) => e.etapa === etapa)?._count._all ?? 0;
    return { pendentes, msg1: de('MSG1'), msg2: de('MSG2'), msg3: de('MSG3') };
  }

  async export(query: ExportConfirmacoesQuery): Promise<ExportFile> {
    const where = await this.where(query.dataEnvio, query.search);
    this.exportService.ensureWithinLimit(await this.txHost.tx.agendamento.count({ where }));
    const linhas = await this.txHost.tx.agendamento.findMany({
      where,
      orderBy: orderByDe(query.sort),
      include: INCLUDE,
    });
    return this.exportService.export({
      format: query.format,
      title: 'Confirmações de Agenda',
      filename: 'confirmacoes',
      columns: selectColumns(CONFIRMACAO_EXPORT_DEFINITIONS, query.columns),
      rows: linhas.map(toConfirmacao),
    });
  }

  // ---------- Aba Histórico ----------

  async historico(query: ListHistoricoConfirmacoesQuery): Promise<Page<ConfirmacaoHistorico>> {
    const pagina = await paginate(query, {
      findMany: (p) =>
        this.txHost.tx.envioConfirmacao.findMany({
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          include: { agendamento: { select: { numero: true } } },
          ...p,
        }),
      count: () => this.txHost.tx.envioConfirmacao.count(),
    });
    return {
      ...pagina,
      data: pagina.data.map((e) => ({
        id: e.id,
        agendamentoNumero: e.agendamento.numero,
        etapa: e.etapa,
        status: e.status,
        erro: e.erro,
        ocorridoEm: e.createdAt.toISOString(),
      })),
    };
  }

  // ---------- Ações da linha ----------

  /** "Enviar confirmacao": manda a próxima mensagem (MSG1→MSG3) que ainda não saiu. */
  @Transactional()
  async enviar(id: string): Promise<Confirmacao> {
    const agendamento = await this.buscar(id);
    if (agendamento.status !== 'AGENDADO') {
      throw this.regra('STATUS_INVALIDO', 'Só agendamentos pendentes recebem confirmação');
    }
    const enviadas = new Set(
      agendamento.enviosConfirmacao.filter((e) => e.status === 'ENVIADO').map((e) => e.etapa),
    );
    const proxima = (['MSG1', 'MSG2', 'MSG3'] as const).find((e) => !enviadas.has(e));
    if (!proxima) throw this.regra('MENSAGENS_ESGOTADAS', 'As 3 mensagens já foram enviadas');
    await this.envios.enviar(id, proxima, true);
    return toConfirmacao(await this.buscar(id));
  }

  /** "Confirmar" (✓) e "Cancelar" (✗): atualizam o status do agendamento (auditado no controller). */
  async responder(id: string, resposta: ConfirmacaoResposta): Promise<Confirmacao> {
    const antes = await this.buscar(id);
    const novo: AgendamentoStatus = resposta === 'CONFIRMAR' ? 'CONFIRMADO' : 'CANCELADO';
    const permitidos: AgendamentoStatus[] =
      resposta === 'CONFIRMAR' ? ['AGENDADO'] : ['AGENDADO', 'CONFIRMADO'];
    if (antes.status === novo) return toConfirmacao(antes);
    if (!permitidos.includes(antes.status)) {
      throw this.regra(
        'STATUS_INVALIDO',
        resposta === 'CONFIRMAR'
          ? 'Só agendamentos pendentes podem ser confirmados'
          : 'Este agendamento não pode mais ser cancelado',
      );
    }
    await this.txHost.tx.agendamento.update({ where: { id }, data: { status: novo } });
    return toConfirmacao(await this.buscar(id));
  }

  // ---------- Internos ----------

  /** Agendamentos do dia da consulta (dia de envio + antecedência), com busca por paciente. */
  private async where(dataEnvio?: string, search?: string): Promise<Prisma.AgendamentoWhereInput> {
    const { antecedenciaDias } = await this.config.configuracao();
    const dia = somarDias(dataEnvio ?? agoraNaClinica().dia, antecedenciaDias);
    return {
      deletedAt: null,
      status: { in: STATUS_DO_GRID },
      inicio: intervaloDoDia(dia),
      ...(search ? { paciente: { nome: { contains: search, mode: 'insensitive' } } } : {}),
    };
  }

  private async buscar(id: string): Promise<AgendamentoLinha> {
    const agendamento = isUuid(id)
      ? await this.txHost.tx.agendamento.findFirst({
          where: { id, deletedAt: null },
          include: INCLUDE,
        })
      : null;
    if (!agendamento) {
      throw new BusinessException(ErrorCode.NOT_FOUND, 'Agendamento não encontrado', {
        status: 404,
      });
    }
    return agendamento;
  }

  private regra(code: string, message: string): BusinessException {
    return new BusinessException(code, message, { status: 422 });
  }
}

