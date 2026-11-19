import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import {
  despesaMensalImovel,
  IMOVEL_TIPO_ROTULOS,
  type CreateImovelInput,
  type ExportImoveisQuery,
  type Imovel as ImovelDto,
  type ImovelExportColumn,
  type ListImoveisQuery,
  type UpdateImovelInput,
} from '@torres/shared';
import { isUuid } from '../../../common/auth/tokens';
import { BusinessException } from '../../../common/errors/api.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import { ExportService, selectColumns } from '../../../common/export/export.service';
import type { ExportColumn, ExportFile } from '../../../common/export/export.types';
import { paginate, searchWhere, toOrderBy, type Page } from '../../../common/pagination/paginate';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import type { Imovel, Prisma } from '../../../generated/prisma/client';

const NAO_EXCLUIDOS = { deletedAt: null } as const;

/** "Buscar imóveis..." procura na descrição, no endereço e na matrícula. */
const CAMPOS_BUSCA = ['descricao', 'endereco', 'matricula'] as const;

const numeroOuNull = (valor: { toString(): string } | null) =>
  valor === null ? null : Number(valor);

/** Coluna `date` (meia-noite UTC) ↔ `AAAA-MM-DD`. */
const paraData = (valor: string | null) => (valor ? new Date(`${valor}T00:00:00.000Z`) : null);
const dataOuNull = (valor: Date | null) => (valor ? valor.toISOString().slice(0, 10) : null);

function toData(input: CreateImovelInput): Prisma.ImovelUncheckedCreateInput {
  return {
    ...input,
    dataCompra: paraData(input.dataCompra),
    vencimentoFinanciamento: paraData(input.vencimentoFinanciamento),
  };
}

export function toDto(imovel: Imovel): ImovelDto {
  const despesas = {
    condominio: numeroOuNull(imovel.condominio),
    contaLuz: numeroOuNull(imovel.contaLuz),
    contaAgua: numeroOuNull(imovel.contaAgua),
    internet: numeroOuNull(imovel.internet),
    seguro: numeroOuNull(imovel.seguro),
  };
  return {
    id: imovel.id,
    descricao: imovel.descricao,
    tipo: imovel.tipo,
    endereco: imovel.endereco,
    matricula: imovel.matricula,
    valorCompra: numeroOuNull(imovel.valorCompra),
    dataCompra: dataOuNull(imovel.dataCompra),
    iptuAnual: numeroOuNull(imovel.iptuAnual),
    itbiPago: numeroOuNull(imovel.itbiPago),
    banco: imovel.banco,
    financiamentoParcela: numeroOuNull(imovel.financiamentoParcela),
    saldoDevedor: numeroOuNull(imovel.saldoDevedor),
    vencimentoFinanciamento: dataOuNull(imovel.vencimentoFinanciamento),
    ...despesas,
    despesaMensal: despesaMensalImovel(despesas),
    observacoes: imovel.observacoes,
    createdAt: imovel.createdAt.toISOString(),
    updatedAt: imovel.updatedAt.toISOString(),
  };
}

/** Colunas exportáveis, iguais às do grid. */
export const IMOVEL_EXPORT_DEFINITIONS: readonly ExportColumn<ImovelDto, ImovelExportColumn>[] = [
  { key: 'descricao', header: 'Descrição', value: (i) => i.descricao, width: 3 },
  { key: 'tipo', header: 'Tipo', value: (i) => IMOVEL_TIPO_ROTULOS[i.tipo] },
  { key: 'endereco', header: 'Endereço', value: (i) => i.endereco ?? '', width: 3 },
  { key: 'valorCompra', header: 'Valor Compra', type: 'currency', value: (i) => i.valorCompra },
  {
    key: 'financiamentoParcela',
    header: 'Financ. Parcela',
    type: 'currency',
    value: (i) => i.financiamentoParcela,
  },
  { key: 'despesaMensal', header: 'Desp. Mensal', type: 'currency', value: (i) => i.despesaMensal },
];

/** Imóveis do patrimônio (tela Imóveis, `/imoveis`, issue #61). */
@Injectable()
export class ImoveisService {
  constructor(
    private readonly txHost: TransactionHost<PrismaAdapter>,
    private readonly exportService: ExportService,
  ) {}

  async list(query: ListImoveisQuery): Promise<Page<ImovelDto>> {
    const where = this.where(query);
    const orderBy = toOrderBy(query.sort);
    const page = await paginate(query, {
      findMany: (p) => this.txHost.tx.imovel.findMany({ where, orderBy, ...p }),
      count: () => this.txHost.tx.imovel.count({ where }),
    });
    return { ...page, data: page.data.map(toDto) };
  }

  async findById(id: string): Promise<ImovelDto> {
    return toDto(await this.buscar(id));
  }

  async create(input: CreateImovelInput): Promise<ImovelDto> {
    return toDto(await this.txHost.tx.imovel.create({ data: toData(input) }));
  }

  /** Substitui todos os campos: o modal Editar envia o formulário inteiro. */
  async update(id: string, input: UpdateImovelInput): Promise<ImovelDto> {
    await this.buscar(id);
    return toDto(await this.txHost.tx.imovel.update({ where: { id }, data: toData(input) }));
  }

  /** Exclusão lógica (registro com dados financeiros). */
  async remove(id: string): Promise<ImovelDto> {
    await this.buscar(id);
    return toDto(
      await this.txHost.tx.imovel.update({ where: { id }, data: { deletedAt: new Date() } }),
    );
  }

  async export(query: ExportImoveisQuery): Promise<ExportFile> {
    const where = this.where(query);
    this.exportService.ensureWithinLimit(await this.txHost.tx.imovel.count({ where }));
    const rows = await this.txHost.tx.imovel.findMany({ where, orderBy: toOrderBy(query.sort) });
    return this.exportService.export({
      format: query.format,
      title: 'Imóveis',
      filename: 'imoveis',
      columns: selectColumns(IMOVEL_EXPORT_DEFINITIONS, query.columns),
      rows: rows.map(toDto),
    });
  }

  private where(query: Pick<ListImoveisQuery, 'search'>): Prisma.ImovelWhereInput {
    return { ...NAO_EXCLUIDOS, ...searchWhere(query.search, CAMPOS_BUSCA) };
  }

  private async buscar(id: string): Promise<Imovel> {
    const imovel = isUuid(id)
      ? await this.txHost.tx.imovel.findFirst({ where: { id, ...NAO_EXCLUIDOS } })
      : null;
    if (!imovel) {
      throw new BusinessException(ErrorCode.NOT_FOUND, 'Imóvel não encontrado', { status: 404 });
    }
    return imovel;
  }
}
