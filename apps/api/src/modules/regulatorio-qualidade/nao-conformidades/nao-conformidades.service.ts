import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import type {
  CreateNaoConformidadeInput,
  ExportNaoConformidadesQuery,
  ListNaoConformidadesQuery,
  NaoConformidade as NaoConformidadeDto,
  NaoConformidadeExportColumn,
  NaoConformidadeStatus,
  NaoConformidadeTipo,
} from '@torres/shared';
import type {
  NaoConformidade,
  NaoConformidadeStatus as StatusDb,
  NaoConformidadeTipo as TipoDb,
  Prisma,
} from '../../../generated/prisma/client';
import { BusinessException } from '../../../common/errors/api.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import { ExportService, selectColumns } from '../../../common/export/export.service';
import type { ExportColumn, ExportFile } from '../../../common/export/export.types';
import { paginate, searchWhere, type Page } from '../../../common/pagination/paginate';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';

const NAO_EXCLUIDOS = { deletedAt: null } as const;

const STATUS_PARA_DB: Record<NaoConformidadeStatus, StatusDb> = {
  aberta: 'ABERTA',
  'em-tratamento': 'EM_TRATAMENTO',
  corrigida: 'CORRIGIDA',
  fechada: 'FECHADA',
};
const STATUS_DO_DB: Record<StatusDb, NaoConformidadeStatus> = {
  ABERTA: 'aberta',
  EM_TRATAMENTO: 'em-tratamento',
  CORRIGIDA: 'corrigida',
  FECHADA: 'fechada',
};
const STATUS_TEXTO: Record<NaoConformidadeStatus, string> = {
  aberta: 'Aberta',
  'em-tratamento': 'Em Tratamento',
  corrigida: 'Corrigida',
  fechada: 'Fechada',
};
const TIPO_TEXTO: Record<NaoConformidadeTipo, string> = {
  processo: 'Processo',
  produto: 'Produto',
  servico: 'Serviço',
  documental: 'Documental',
  seguranca: 'Segurança',
};

const paraTipoDb = (tipo: NaoConformidadeTipo): TipoDb => tipo.toUpperCase() as TipoDb;
const paraTipo = (tipo: TipoDb): NaoConformidadeTipo => tipo.toLowerCase() as NaoConformidadeTipo;
const paraIsoData = (data: Date | null): string | null =>
  data ? data.toISOString().slice(0, 10) : null;
const paraDate = (iso: string | null): Date | null =>
  iso ? new Date(`${iso}T00:00:00.000Z`) : null;

export const NAO_CONFORMIDADE_EXPORT_DEFINITIONS: readonly ExportColumn<
  NaoConformidadeDto,
  NaoConformidadeExportColumn
>[] = [
  { key: 'titulo', header: 'Título', value: (n) => n.titulo, width: 4 },
  { key: 'setor', header: 'Setor', value: (n) => n.setor ?? '', width: 2 },
  { key: 'tipo', header: 'Tipo', value: (n) => TIPO_TEXTO[n.tipo] },
  {
    key: 'dataOcorrencia',
    header: 'Data Ocorrência',
    type: 'date',
    value: (n) => paraDate(n.dataOcorrencia),
  },
  { key: 'responsavel', header: 'Responsável', value: (n) => n.responsavel ?? '', width: 2 },
  { key: 'status', header: 'Status', value: (n) => STATUS_TEXTO[n.status] },
];

/** Registro e acompanhamento de não conformidades (tela Não Conformidades). */
@Injectable()
export class NaoConformidadesService {
  constructor(
    private readonly txHost: TransactionHost<PrismaAdapter>,
    private readonly exportService: ExportService,
  ) {}

  async list(query: ListNaoConformidadesQuery): Promise<Page<NaoConformidadeDto>> {
    const where = this.where(query);
    const orderBy = this.orderBy(query.sort);
    const pagina = await paginate(query, {
      findMany: (page) => this.txHost.tx.naoConformidade.findMany({ where, orderBy, ...page }),
      count: () => this.txHost.tx.naoConformidade.count({ where }),
    });
    return { ...pagina, data: pagina.data.map((nc) => this.paraDto(nc)) };
  }

  async findById(id: string): Promise<NaoConformidadeDto> {
    const nc = await this.txHost.tx.naoConformidade.findFirst({
      where: { id, ...NAO_EXCLUIDOS },
    });
    if (!nc) {
      throw new BusinessException(ErrorCode.NOT_FOUND, 'Não conformidade não encontrada', {
        status: 404,
      });
    }
    return this.paraDto(nc);
  }

  /** Toda NC nasce "Aberta"; o inventário ainda não define como o status avança (issue #68). */
  async create(input: CreateNaoConformidadeInput): Promise<NaoConformidadeDto> {
    const nc = await this.txHost.tx.naoConformidade.create({
      data: {
        ...input,
        tipo: paraTipoDb(input.tipo),
        dataOcorrencia: paraDate(input.dataOcorrencia),
        dataLimiteCorrecao: paraDate(input.dataLimiteCorrecao),
        status: 'ABERTA',
      },
    });
    return this.paraDto(nc);
  }

  async export(query: ExportNaoConformidadesQuery): Promise<ExportFile> {
    const where = this.where(query);
    this.exportService.ensureWithinLimit(await this.txHost.tx.naoConformidade.count({ where }));
    const rows = await this.txHost.tx.naoConformidade.findMany({
      where,
      orderBy: this.orderBy(query.sort),
    });
    return this.exportService.export({
      format: query.format,
      title: 'Não Conformidades',
      filename: 'nao-conformidades',
      columns: selectColumns(NAO_CONFORMIDADE_EXPORT_DEFINITIONS, query.columns),
      rows: rows.map((nc) => this.paraDto(nc)),
    });
  }

  private where(
    query: Pick<ListNaoConformidadesQuery, 'status'> & { search?: string },
  ): Prisma.NaoConformidadeWhereInput {
    return {
      ...NAO_EXCLUIDOS,
      ...(query.status ? { status: STATUS_PARA_DB[query.status] } : {}),
      ...searchWhere(query.search, ['titulo', 'setor', 'responsavel']),
    };
  }

  private orderBy(
    sort: ListNaoConformidadesQuery['sort'],
  ): Prisma.NaoConformidadeOrderByWithRelationInput[] {
    return [{ [sort.field]: sort.direction }, { id: sort.direction }];
  }

  private paraDto(nc: NaoConformidade): NaoConformidadeDto {
    return {
      id: nc.id,
      titulo: nc.titulo,
      descricao: nc.descricao,
      setor: nc.setor,
      tipo: paraTipo(nc.tipo),
      dataOcorrencia: paraIsoData(nc.dataOcorrencia),
      dataLimiteCorrecao: paraIsoData(nc.dataLimiteCorrecao),
      responsavel: nc.responsavel,
      acaoCorretiva: nc.acaoCorretiva,
      observacoes: nc.observacoes,
      status: STATUS_DO_DB[nc.status],
      createdAt: nc.createdAt.toISOString(),
      updatedAt: nc.updatedAt.toISOString(),
    };
  }
}
