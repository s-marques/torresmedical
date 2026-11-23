import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import type {
  CreateTipoTreinamentoInput,
  CreateTreinamentoInput,
  ExportTreinamentosQuery,
  ListTreinamentosQuery,
  TipoTreinamento as TipoTreinamentoDto,
  Treinamento as TreinamentoDto,
  TreinamentoExportColumn,
  TreinamentoStatus,
} from '@torres/shared';
import type { Prisma, TipoTreinamento, Treinamento } from '../../../generated/prisma/client';
import { BusinessException } from '../../../common/errors/api.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import { ExportService, selectColumns } from '../../../common/export/export.service';
import type { ExportColumn, ExportFile } from '../../../common/export/export.types';
import { paginate, searchWhere, type Page } from '../../../common/pagination/paginate';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import { hojeDaClinica } from '../alvaras-licencas/alvaras-licencas.service';

const NAO_EXCLUIDOS = { deletedAt: null } as const;

const COM_RELACOES = {
  funcionario: { select: { nome: true } },
  tipoTreinamento: { select: { nome: true } },
} as const;
type TreinamentoComRelacoes = Prisma.TreinamentoGetPayload<{ include: typeof COM_RELACOES }>;

const STATUS_TEXTO: Record<TreinamentoStatus, string> = {
  valido: 'Válido',
  vencido: 'Vencido',
};

const paraIsoData = (data: Date | null): string | null =>
  data ? data.toISOString().slice(0, 10) : null;
const paraDate = (iso: string | null): Date | null =>
  iso ? new Date(`${iso}T00:00:00.000Z`) : null;

/** Sem Data Vencimento o treinamento não expira: é Válido (confirmado pelo dev na issue #70). */
export function statusTreinamento(vencimento: Date | null, hoje: Date): TreinamentoStatus {
  return vencimento && vencimento.getTime() < hoje.getTime() ? 'vencido' : 'valido';
}

export const TREINAMENTO_EXPORT_DEFINITIONS: readonly ExportColumn<
  TreinamentoDto,
  TreinamentoExportColumn
>[] = [
  { key: 'funcionario', header: 'Funcionário', value: (t) => t.funcionarioNome, width: 3 },
  { key: 'tipo', header: 'Tipo', value: (t) => t.tipoNome, width: 2 },
  {
    key: 'dataRealizacao',
    header: 'Realização',
    type: 'date',
    value: (t) => paraDate(t.dataRealizacao),
  },
  {
    key: 'dataVencimento',
    header: 'Vencimento',
    type: 'date',
    value: (t) => paraDate(t.dataVencimento),
  },
  { key: 'instituicao', header: 'Instituição', value: (t) => t.instituicao ?? '', width: 2 },
  { key: 'status', header: 'Status', value: (t) => STATUS_TEXTO[t.status] },
];

/** Treinamentos e certificações dos funcionários (tela Treinamentos) e seus tipos. */
@Injectable()
export class TreinamentosService {
  constructor(
    private readonly txHost: TransactionHost<PrismaAdapter>,
    private readonly exportService: ExportService,
  ) {}

  // ─────────────────────────────────── Tipos de treinamento ────────────────────────────────────

  async listTipos(): Promise<TipoTreinamentoDto[]> {
    const tipos = await this.txHost.tx.tipoTreinamento.findMany({
      where: NAO_EXCLUIDOS,
      orderBy: [{ nome: 'asc' }, { id: 'asc' }],
    });
    return tipos.map((tipo) => this.tipoParaDto(tipo));
  }

  async createTipo(input: CreateTipoTreinamentoInput): Promise<TipoTreinamentoDto> {
    const tipo = await this.txHost.tx.tipoTreinamento.create({ data: input });
    return this.tipoParaDto(tipo);
  }

  // ───────────────────────────────────────── Treinamentos ──────────────────────────────────────

  async list(query: ListTreinamentosQuery): Promise<Page<TreinamentoDto>> {
    const hoje = hojeDaClinica();
    const where = this.where(query, hoje);
    const orderBy = this.orderBy(query.sort);
    const pagina = await paginate(query, {
      findMany: (page) =>
        this.txHost.tx.treinamento.findMany({ where, orderBy, include: COM_RELACOES, ...page }),
      count: () => this.txHost.tx.treinamento.count({ where }),
    });
    return { ...pagina, data: pagina.data.map((t) => this.paraDto(t, hoje)) };
  }

  async findById(id: string): Promise<TreinamentoDto> {
    const treinamento = await this.txHost.tx.treinamento.findFirst({
      where: { id, ...NAO_EXCLUIDOS },
      include: COM_RELACOES,
    });
    if (!treinamento) {
      throw new BusinessException(ErrorCode.NOT_FOUND, 'Treinamento não encontrado', {
        status: 404,
      });
    }
    return this.paraDto(treinamento, hojeDaClinica());
  }

  async create(input: CreateTreinamentoInput): Promise<TreinamentoDto> {
    await this.garantirReferencias(input);
    const treinamento = await this.txHost.tx.treinamento.create({
      data: {
        ...input,
        dataRealizacao: paraDate(input.dataRealizacao),
        dataVencimento: paraDate(input.dataVencimento),
      },
      include: COM_RELACOES,
    });
    return this.paraDto(treinamento, hojeDaClinica());
  }

  async export(query: ExportTreinamentosQuery): Promise<ExportFile> {
    const hoje = hojeDaClinica();
    const where = this.where(query, hoje);
    this.exportService.ensureWithinLimit(await this.txHost.tx.treinamento.count({ where }));
    const rows = await this.txHost.tx.treinamento.findMany({
      where,
      orderBy: this.orderBy(query.sort),
      include: COM_RELACOES,
    });
    return this.exportService.export({
      format: query.format,
      title: 'Treinamentos',
      filename: 'treinamentos',
      columns: selectColumns(TREINAMENTO_EXPORT_DEFINITIONS, query.columns),
      rows: rows.map((t) => this.paraDto(t, hoje)),
    });
  }

  /** Funcionário e tipo precisam existir e não estar excluídos (400 com o campo no `details`). */
  private async garantirReferencias(
    input: Pick<CreateTreinamentoInput, 'funcionarioId' | 'tipoTreinamentoId'>,
  ): Promise<void> {
    const [funcionario, tipo] = await Promise.all([
      this.txHost.tx.funcionario.findFirst({
        where: { id: input.funcionarioId, ...NAO_EXCLUIDOS },
        select: { id: true },
      }),
      this.txHost.tx.tipoTreinamento.findFirst({
        where: { id: input.tipoTreinamentoId, ...NAO_EXCLUIDOS },
        select: { id: true },
      }),
    ]);
    if (!funcionario) {
      throw new BusinessException(ErrorCode.NOT_FOUND, 'Funcionário não encontrado', {
        status: 404,
      });
    }
    if (!tipo) {
      throw new BusinessException(ErrorCode.NOT_FOUND, 'Tipo de treinamento não encontrado', {
        status: 404,
      });
    }
  }

  private where(
    query: Pick<ListTreinamentosQuery, 'status'> & { search?: string },
    hoje: Date,
  ): Prisma.TreinamentoWhereInput {
    const porStatus: Record<TreinamentoStatus, Prisma.TreinamentoWhereInput> = {
      valido: { OR: [{ dataVencimento: null }, { dataVencimento: { gte: hoje } }] },
      vencido: { dataVencimento: { lt: hoje } },
    };
    return {
      ...NAO_EXCLUIDOS,
      ...(query.status ? porStatus[query.status] : {}),
      ...(query.search
        ? {
            AND: [
              {
                OR: [
                  ...(searchWhere(query.search, ['instituicao', 'descricao'])?.OR ?? []),
                  { funcionario: { nome: { contains: query.search, mode: 'insensitive' } } },
                  { tipoTreinamento: { nome: { contains: query.search, mode: 'insensitive' } } },
                ],
              },
            ],
          }
        : {}),
    };
  }

  private orderBy(
    sort: ListTreinamentosQuery['sort'],
  ): Prisma.TreinamentoOrderByWithRelationInput[] {
    const { field, direction } = sort;
    let primeiro: Prisma.TreinamentoOrderByWithRelationInput;
    if (field === 'funcionario') primeiro = { funcionario: { nome: direction } };
    else if (field === 'tipo') primeiro = { tipoTreinamento: { nome: direction } };
    else if (field === 'status') primeiro = { dataVencimento: direction };
    else primeiro = { [field]: direction };
    return [primeiro, { id: direction }];
  }

  private tipoParaDto(tipo: TipoTreinamento): TipoTreinamentoDto {
    return { id: tipo.id, nome: tipo.nome, createdAt: tipo.createdAt.toISOString() };
  }

  private paraDto(
    t: Treinamento & Pick<TreinamentoComRelacoes, 'funcionario' | 'tipoTreinamento'>,
    hoje: Date,
  ): TreinamentoDto {
    return {
      id: t.id,
      funcionarioId: t.funcionarioId,
      funcionarioNome: t.funcionario.nome,
      tipoTreinamentoId: t.tipoTreinamentoId,
      tipoNome: t.tipoTreinamento.nome,
      descricao: t.descricao,
      dataRealizacao: paraIsoData(t.dataRealizacao),
      dataVencimento: paraIsoData(t.dataVencimento),
      cargaHoraria: t.cargaHoraria,
      instituicao: t.instituicao,
      observacoes: t.observacoes,
      status: statusTreinamento(t.dataVencimento, hoje),
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
    };
  }
}
