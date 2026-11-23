import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import {
  COLETA_RESIDUO_TIPO_ROTULOS,
  type ColetaResiduo as ColetaResiduoDto,
  type ColetaResiduoExportColumn,
  type CreateColetaResiduoInput,
  type ExportColetasResiduoQuery,
  type ListColetasResiduoQuery,
  type UpdateColetaResiduoInput,
} from '@torres/shared';
import { isUuid } from '../../../common/auth/tokens';
import { BusinessException } from '../../../common/errors/api.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import { ExportService, selectColumns } from '../../../common/export/export.service';
import type { ExportColumn, ExportFile } from '../../../common/export/export.types';
import { paginate, searchWhere, toOrderBy, type Page } from '../../../common/pagination/paginate';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import type { ColetaResiduo, Prisma } from '../../../generated/prisma/client';

const NAO_EXCLUIDAS = { deletedAt: null } as const;

/** "Buscar coletas..." procura na empresa coletora, no manifesto MTR e no responsável. */
const CAMPOS_BUSCA = ['empresaColetora', 'manifestoMtr', 'responsavel'] as const;

/** Coluna `date` (meia-noite UTC) ↔ `AAAA-MM-DD`. */
const paraData = (valor: string) => new Date(`${valor}T00:00:00.000Z`);
const dataOuNull = (valor: Date | null) => (valor ? valor.toISOString().slice(0, 10) : null);

function toData(input: CreateColetaResiduoInput): Prisma.ColetaResiduoUncheckedCreateInput {
  return {
    ...input,
    dataColeta: paraData(input.dataColeta),
    proximaColeta: input.proximaColeta ? paraData(input.proximaColeta) : null,
  };
}

export function toDto(coleta: ColetaResiduo): ColetaResiduoDto {
  return {
    id: coleta.id,
    dataColeta: coleta.dataColeta.toISOString().slice(0, 10),
    proximaColeta: dataOuNull(coleta.proximaColeta),
    empresaColetora: coleta.empresaColetora,
    manifestoMtr: coleta.manifestoMtr,
    pesoKg: coleta.pesoKg === null ? null : Number(coleta.pesoKg),
    tipoResiduo: coleta.tipoResiduo,
    responsavel: coleta.responsavel,
    observacoes: coleta.observacoes,
    createdAt: coleta.createdAt.toISOString(),
    updatedAt: coleta.updatedAt.toISOString(),
  };
}

/** Formata `AAAA-MM-DD` como `DD/MM/AAAA` (a exportação é sempre em português). */
const dataBr = (valor: string | null) => (valor ? valor.split('-').reverse().join('/') : '');

/** Colunas exportáveis, iguais às do grid. */
export const COLETA_RESIDUO_EXPORT_DEFINITIONS: readonly ExportColumn<
  ColetaResiduoDto,
  ColetaResiduoExportColumn
>[] = [
  { key: 'dataColeta', header: 'Data Coleta', value: (c) => dataBr(c.dataColeta) },
  { key: 'proximaColeta', header: 'Próxima Coleta', value: (c) => dataBr(c.proximaColeta) },
  {
    key: 'empresaColetora',
    header: 'Empresa Coletora',
    value: (c) => c.empresaColetora ?? '',
    width: 3,
  },
  { key: 'manifestoMtr', header: 'MTR', value: (c) => c.manifestoMtr ?? '' },
  { key: 'pesoKg', header: 'Peso (kg)', type: 'number', value: (c) => c.pesoKg },
  {
    key: 'tipoResiduo',
    header: 'Tipo Resíduo',
    value: (c) => COLETA_RESIDUO_TIPO_ROTULOS[c.tipoResiduo],
  },
  { key: 'responsavel', header: 'Responsável', value: (c) => c.responsavel ?? '', width: 2 },
];

/** Coletas de resíduos (tela Coleta Resíduos, `/coletas-residuo`, issue #65). */
@Injectable()
export class ColetasResiduoService {
  constructor(
    private readonly txHost: TransactionHost<PrismaAdapter>,
    private readonly exportService: ExportService,
  ) {}

  async list(query: ListColetasResiduoQuery): Promise<Page<ColetaResiduoDto>> {
    const where = this.where(query);
    const orderBy = toOrderBy(query.sort);
    const page = await paginate(query, {
      findMany: (p) => this.txHost.tx.coletaResiduo.findMany({ where, orderBy, ...p }),
      count: () => this.txHost.tx.coletaResiduo.count({ where }),
    });
    return { ...page, data: page.data.map(toDto) };
  }

  async findById(id: string): Promise<ColetaResiduoDto> {
    return toDto(await this.buscar(id));
  }

  async create(input: CreateColetaResiduoInput): Promise<ColetaResiduoDto> {
    return toDto(await this.txHost.tx.coletaResiduo.create({ data: toData(input) }));
  }

  /** Substitui todos os campos: o modal Editar envia o formulário inteiro. */
  async update(id: string, input: UpdateColetaResiduoInput): Promise<ColetaResiduoDto> {
    await this.buscar(id);
    return toDto(await this.txHost.tx.coletaResiduo.update({ where: { id }, data: toData(input) }));
  }

  /** Exclusão lógica (registro regulatório). */
  async remove(id: string): Promise<ColetaResiduoDto> {
    await this.buscar(id);
    return toDto(
      await this.txHost.tx.coletaResiduo.update({
        where: { id },
        data: { deletedAt: new Date() },
      }),
    );
  }

  async export(query: ExportColetasResiduoQuery): Promise<ExportFile> {
    const where = this.where(query);
    this.exportService.ensureWithinLimit(await this.txHost.tx.coletaResiduo.count({ where }));
    const rows = await this.txHost.tx.coletaResiduo.findMany({
      where,
      orderBy: toOrderBy(query.sort),
    });
    return this.exportService.export({
      format: query.format,
      title: 'Coletas de Resíduo',
      filename: 'coletas-residuo',
      columns: selectColumns(COLETA_RESIDUO_EXPORT_DEFINITIONS, query.columns),
      rows: rows.map(toDto),
    });
  }

  private where(query: Pick<ListColetasResiduoQuery, 'search'>): Prisma.ColetaResiduoWhereInput {
    return { ...NAO_EXCLUIDAS, ...searchWhere(query.search, CAMPOS_BUSCA) };
  }

  private async buscar(id: string): Promise<ColetaResiduo> {
    const coleta = isUuid(id)
      ? await this.txHost.tx.coletaResiduo.findFirst({ where: { id, ...NAO_EXCLUIDAS } })
      : null;
    if (!coleta) {
      throw new BusinessException(ErrorCode.NOT_FOUND, 'Coleta não encontrada', { status: 404 });
    }
    return coleta;
  }
}
