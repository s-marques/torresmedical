import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import {
  SOROTERAPIA_STATUS_ROTULOS,
  type AtendimentoMedicoItem,
  type ExportSoroterapiaEmAndamentoQuery,
  type ExportSoroterapiaHistoricoQuery,
  type ListSoroterapiaEmAndamentoQuery,
  type ListSoroterapiaHistoricoQuery,
  type SoroterapiaChecklist,
  type SoroterapiaExportColumn,
  type SoroterapiaPacote,
  type SortDirection,
} from '@torres/shared';
import type {
  Prisma,
  SoroterapiaChecklist as SoroterapiaChecklistModel,
  SoroterapiaChecklistStatus,
} from '../../../generated/prisma/client';
import { EscopoDadosService } from '../../../common/auth/escopo-dados.service';
import { ExportService, selectColumns } from '../../../common/export/export.service';
import type { ExportColumn, ExportFile } from '../../../common/export/export.types';
import type { Page } from '../../../common/pagination/paginate';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import { AgendamentosAtendimentoService } from '../../comercial-atendimento/agenda/agendamentos-atendimento.service';
import { OrcamentosService } from '../../comercial-atendimento/orcamentos/orcamentos.service';
import { PacientesService } from '../../comercial-atendimento/pacientes/pacientes.service';
import { ProfissionaisService } from '../../gestao-profissionais/profissionais/profissionais.service';
import { PacientesVinculadosService } from '../pacientes-vinculados/pacientes-vinculados.service';
import { naOrdem, paginarPorNome } from '../receituarios/ordenar-por-nome';

const MINUTO_MS = 60_000;

/** Duração em minutos, do início ao fim. Sem fim (em andamento ou suspenso) é nula. */
export function duracaoEmMinutos(
  checklist: Pick<SoroterapiaChecklistModel, 'iniciadoEm' | 'finalizadoEm'>,
): number | null {
  if (!checklist.finalizadoEm) return null;
  const ms = checklist.finalizadoEm.getTime() - checklist.iniciadoEm.getTime();
  return Math.max(0, Math.round(ms / MINUTO_MS));
}

export function toSoroterapiaChecklist(
  checklist: SoroterapiaChecklistModel,
  nomes: { pacientes: ReadonlyMap<string, string>; profissionais: ReadonlyMap<string, string> },
): SoroterapiaChecklist {
  return {
    id: checklist.id,
    data: checklist.iniciadoEm.toISOString(),
    pacienteId: checklist.pacienteId,
    pacienteNome: nomes.pacientes.get(checklist.pacienteId) ?? null,
    profissionalId: checklist.profissionalId,
    profissionalNome: nomes.profissionais.get(checklist.profissionalId) ?? null,
    protocolo: checklist.protocoloNome,
    sinaisVitaisInicio: checklist.sinaisVitaisInicio,
    status: checklist.status,
    duracaoMinutos: duracaoEmMinutos(checklist),
  };
}

/** Colunas exportáveis, iguais às do grid (Em Andamento e Historico). */
export const SOROTERAPIA_EXPORT_DEFINITIONS: readonly ExportColumn<
  SoroterapiaChecklist,
  SoroterapiaExportColumn
>[] = [
  { key: 'data', header: 'Data', type: 'datetime', value: (c) => c.data },
  { key: 'paciente', header: 'Paciente', value: (c) => c.pacienteNome ?? '', width: 3 },
  { key: 'profissional', header: 'Profissional', value: (c) => c.profissionalNome ?? '', width: 3 },
  { key: 'protocolo', header: 'Protocolo', value: (c) => c.protocolo, width: 3 },
  {
    key: 'sinaisVitaisInicio',
    header: 'Sinais Vitais Inicio',
    value: (c) => c.sinaisVitaisInicio ?? '',
    width: 3,
  },
  { key: 'status', header: 'Status', value: (c) => SOROTERAPIA_STATUS_ROTULOS[c.status] },
  {
    key: 'duracao',
    header: 'Duracao',
    value: (c) => (c.duracaoMinutos === null ? '' : `${c.duracaoMinutos} min`),
  },
];

interface Filtros {
  /** Status aceitos pela aba. */
  statuses: readonly SoroterapiaChecklistStatus[];
  search: string | undefined;
  sort: { field: ListSoroterapiaEmAndamentoQuery['sort']['field']; direction: SortDirection };
}

const STATUS_EM_ANDAMENTO = ['EM_ANDAMENTO'] as const;
const STATUS_HISTORICO = ['FINALIZADO', 'SUSPENSO'] as const;

/**
 * Tela Soroterapia (`/soroterapia`, issue #44). Só leitura: o fluxo do checklist ainda não está
 * documentado. Paciente, profissional, agendamento e orçamento são de outros módulos, lidos pelos
 * services exportados. O usuário restrito só vê os profissionais vinculados (issue #153) e, nos
 * pacotes, os pacientes vinculados.
 */
@Injectable()
export class SoroterapiaService {
  constructor(
    private readonly txHost: TransactionHost<PrismaAdapter>,
    private readonly exportService: ExportService,
    private readonly pacientes: PacientesService,
    private readonly profissionais: ProfissionaisService,
    private readonly agendamentos: AgendamentosAtendimentoService,
    private readonly orcamentos: OrcamentosService,
    private readonly vinculados: PacientesVinculadosService,
    private readonly escopo: EscopoDadosService,
  ) {}

  /** Aba "Fila do Dia". */
  filaDia(): Promise<AtendimentoMedicoItem[]> {
    return this.agendamentos.listarFilaSoroterapia();
  }

  /** Aba "Pacotes". */
  async pacotes(): Promise<SoroterapiaPacote[]> {
    return this.orcamentos.listarPacotesProtocolo(await this.vinculados.idsNoEscopo());
  }

  /** Aba "Em Andamento". */
  listEmAndamento(query: ListSoroterapiaEmAndamentoQuery): Promise<Page<SoroterapiaChecklist>> {
    return this.list({ ...query, statuses: STATUS_EM_ANDAMENTO }, query);
  }

  /** Aba "Historico": Finalizado e Suspenso, ou só um deles pelo chip. */
  listHistorico(query: ListSoroterapiaHistoricoQuery): Promise<Page<SoroterapiaChecklist>> {
    return this.list({ ...query, statuses: statusHistorico(query) }, query);
  }

  exportEmAndamento(query: ExportSoroterapiaEmAndamentoQuery): Promise<ExportFile> {
    return this.export({ ...query, statuses: STATUS_EM_ANDAMENTO }, query, 'em-andamento');
  }

  exportHistorico(query: ExportSoroterapiaHistoricoQuery): Promise<ExportFile> {
    return this.export({ ...query, statuses: statusHistorico(query) }, query, 'historico');
  }

  private async list(
    filtros: Filtros,
    pagina: { page: number; pageSize: number },
  ): Promise<Page<SoroterapiaChecklist>> {
    const { registros, total } = await this.buscar(filtros, pagina);
    return {
      data: await this.comNomes(registros),
      meta: {
        page: pagina.page,
        pageSize: pagina.pageSize,
        total,
        totalPages: Math.ceil(total / pagina.pageSize),
      },
    };
  }

  private async export(
    filtros: Filtros,
    query: {
      format: ExportSoroterapiaEmAndamentoQuery['format'];
      columns: SoroterapiaExportColumn[];
    },
    aba: 'em-andamento' | 'historico',
  ): Promise<ExportFile> {
    const where = await this.where(filtros);
    this.exportService.ensureWithinLimit(
      await this.txHost.tx.soroterapiaChecklist.count({ where }),
    );
    const { registros } = await this.buscar(filtros, null);
    return this.exportService.export({
      format: query.format,
      title: `Soroterapia - ${aba === 'historico' ? 'Historico' : 'Em Andamento'}`,
      filename: `soroterapia-${aba}`,
      columns: selectColumns(SOROTERAPIA_EXPORT_DEFINITIONS, query.columns),
      rows: await this.comNomes(registros),
    });
  }

  /** Nomes do paciente e do profissional de cada checklist (sem FK). */
  private async comNomes(
    registros: readonly SoroterapiaChecklistModel[],
  ): Promise<SoroterapiaChecklist[]> {
    const [pacientes, profissionais] = await Promise.all([
      this.pacientes.nomesPorIds(registros.map((r) => r.pacienteId)),
      this.profissionais.nomesPorIds(registros.map((r) => r.profissionalId)),
    ]);
    return registros.map((r) => toSoroterapiaChecklist(r, { pacientes, profissionais }));
  }

  /** Página (ou tudo, na exportação) na ordem pedida. */
  private async buscar(
    filtros: Filtros,
    pagina: { page: number; pageSize: number } | null,
  ): Promise<{ registros: SoroterapiaChecklistModel[]; total: number }> {
    const where = await this.where(filtros);
    const { field, direction } = filtros.sort;
    if (field === 'paciente' || field === 'profissional') {
      const chaves = await this.txHost.tx.soroterapiaChecklist.findMany({
        where,
        select: { id: true, pacienteId: true, profissionalId: true },
      });
      const refs = chaves.map((c) => ({
        id: c.id,
        refId: field === 'paciente' ? c.pacienteId : c.profissionalId,
      }));
      const ids = refs.map((r) => r.refId).filter((id): id is string => id !== null);
      const nomes = await (field === 'paciente'
        ? this.pacientes.nomesPorIds(ids)
        : this.profissionais.nomesPorIds(ids));
      const { ids: pagina_, total } = paginarPorNome(refs, nomes, {
        page: pagina?.page ?? 1,
        pageSize: pagina?.pageSize ?? chaves.length,
        direction,
      });
      const registros = await this.txHost.tx.soroterapiaChecklist.findMany({
        where: { id: { in: pagina_ } },
      });
      return { registros: naOrdem(pagina_, registros), total };
    }
    const campo = { data: 'iniciadoEm', protocolo: 'protocoloNome', status: 'status' } as const;
    const orderBy: Prisma.SoroterapiaChecklistOrderByWithRelationInput[] = [
      { [campo[field]]: direction },
      { createdAt: direction },
      { id: direction },
    ];
    const [registros, total] = await Promise.all([
      this.txHost.tx.soroterapiaChecklist.findMany({
        where,
        orderBy,
        ...(pagina && { skip: (pagina.page - 1) * pagina.pageSize, take: pagina.pageSize }),
      }),
      this.txHost.tx.soroterapiaChecklist.count({ where }),
    ]);
    return { registros, total };
  }

  /** "Buscar por paciente ou protocolo...". */
  private async where({
    statuses,
    search,
  }: Filtros): Promise<Prisma.SoroterapiaChecklistWhereInput> {
    const where: Prisma.SoroterapiaChecklistWhereInput = {
      deletedAt: null,
      status: { in: [...statuses] },
      profissionalId: this.escopo.filtroProfissional(),
    };
    if (!search) return where;
    const pacienteIds = await this.pacientes.idsPorBusca(search);
    return {
      ...where,
      OR: [
        { protocoloNome: { contains: search, mode: 'insensitive' } },
        ...(pacienteIds.length > 0 ? [{ pacienteId: { in: pacienteIds } }] : []),
      ],
    };
  }
}

function statusHistorico(query: { status?: 'FINALIZADO' | 'SUSPENSO' | undefined }) {
  return query.status ? [query.status] : STATUS_HISTORICO;
}
