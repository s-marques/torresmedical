import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import {
  VEICULO_TIPO_ROTULOS,
  VEICULO_USO_ROTULOS,
  type CreateVeiculoInput,
  type ExportVeiculosQuery,
  type ListVeiculosQuery,
  type UpdateVeiculoInput,
  type Veiculo as VeiculoDto,
  type VeiculoExportColumn,
} from '@torres/shared';
import { isUuid } from '../../../common/auth/tokens';
import { BusinessException } from '../../../common/errors/api.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import { ExportService, selectColumns } from '../../../common/export/export.service';
import type { ExportColumn, ExportFile } from '../../../common/export/export.types';
import { paginate, searchWhere, toOrderBy, type Page } from '../../../common/pagination/paginate';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import type { Prisma, Veiculo } from '../../../generated/prisma/client';

const NAO_EXCLUIDOS = { deletedAt: null } as const;

/** "Buscar veiculos..." procura na descrição, na placa, no RENAVAM e no chassi. */
const CAMPOS_BUSCA = ['descricao', 'placa', 'renavam', 'chassi'] as const;

const numeroOuNull = (valor: { toString(): string } | null) =>
  valor === null ? null : Number(valor);

/** Coluna `date` (meia-noite UTC) ↔ `AAAA-MM-DD`. */
const paraData = (valor: string | null) => (valor ? new Date(`${valor}T00:00:00.000Z`) : null);
const dataOuNull = (valor: Date | null) => (valor ? valor.toISOString().slice(0, 10) : null);

function toData(input: CreateVeiculoInput): Prisma.VeiculoUncheckedCreateInput {
  return {
    ...input,
    dataCompra: paraData(input.dataCompra),
    vencimentoSeguro: paraData(input.vencimentoSeguro),
    vencimentoFinanciamento: paraData(input.vencimentoFinanciamento),
  };
}

export function toDto(veiculo: Veiculo): VeiculoDto {
  return {
    id: veiculo.id,
    descricao: veiculo.descricao,
    tipo: veiculo.tipo,
    placa: veiculo.placa,
    renavam: veiculo.renavam,
    chassi: veiculo.chassi,
    ano: veiculo.ano,
    cor: veiculo.cor,
    uso: veiculo.uso,
    valorCompra: numeroOuNull(veiculo.valorCompra),
    dataCompra: dataOuNull(veiculo.dataCompra),
    ipvaAnual: numeroOuNull(veiculo.ipvaAnual),
    licenciamento: numeroOuNull(veiculo.licenciamento),
    seguroAnual: numeroOuNull(veiculo.seguroAnual),
    vencimentoSeguro: dataOuNull(veiculo.vencimentoSeguro),
    banco: veiculo.banco,
    financiamentoParcela: numeroOuNull(veiculo.financiamentoParcela),
    saldoDevedor: numeroOuNull(veiculo.saldoDevedor),
    vencimentoFinanciamento: dataOuNull(veiculo.vencimentoFinanciamento),
    observacoes: veiculo.observacoes,
    createdAt: veiculo.createdAt.toISOString(),
    updatedAt: veiculo.updatedAt.toISOString(),
  };
}

/** Colunas exportáveis, iguais às do grid. */
export const VEICULO_EXPORT_DEFINITIONS: readonly ExportColumn<VeiculoDto, VeiculoExportColumn>[] =
  [
    { key: 'descricao', header: 'Descrição', value: (v) => v.descricao, width: 3 },
    { key: 'placa', header: 'Placa', value: (v) => v.placa ?? '' },
    { key: 'tipo', header: 'Tipo', value: (v) => VEICULO_TIPO_ROTULOS[v.tipo] },
    { key: 'uso', header: 'Uso', value: (v) => VEICULO_USO_ROTULOS[v.uso] },
    { key: 'ipvaAnual', header: 'IPVA', type: 'currency', value: (v) => v.ipvaAnual },
    { key: 'seguroAnual', header: 'Seguro', type: 'currency', value: (v) => v.seguroAnual },
    {
      key: 'financiamentoParcela',
      header: 'Financ. Parcela',
      type: 'currency',
      value: (v) => v.financiamentoParcela,
    },
  ];

/** Veículos do patrimônio (tela Veículos, `/veiculos`, issue #63). */
@Injectable()
export class VeiculosService {
  constructor(
    private readonly txHost: TransactionHost<PrismaAdapter>,
    private readonly exportService: ExportService,
  ) {}

  async list(query: ListVeiculosQuery): Promise<Page<VeiculoDto>> {
    const where = this.where(query);
    const orderBy = toOrderBy(query.sort);
    const page = await paginate(query, {
      findMany: (p) => this.txHost.tx.veiculo.findMany({ where, orderBy, ...p }),
      count: () => this.txHost.tx.veiculo.count({ where }),
    });
    return { ...page, data: page.data.map(toDto) };
  }

  async findById(id: string): Promise<VeiculoDto> {
    return toDto(await this.buscar(id));
  }

  async create(input: CreateVeiculoInput): Promise<VeiculoDto> {
    return toDto(await this.txHost.tx.veiculo.create({ data: toData(input) }));
  }

  /** Substitui todos os campos: o modal Editar envia o formulário inteiro. */
  async update(id: string, input: UpdateVeiculoInput): Promise<VeiculoDto> {
    await this.buscar(id);
    return toDto(await this.txHost.tx.veiculo.update({ where: { id }, data: toData(input) }));
  }

  /** Exclusão lógica (registro com dados financeiros). */
  async remove(id: string): Promise<VeiculoDto> {
    await this.buscar(id);
    return toDto(
      await this.txHost.tx.veiculo.update({ where: { id }, data: { deletedAt: new Date() } }),
    );
  }

  async export(query: ExportVeiculosQuery): Promise<ExportFile> {
    const where = this.where(query);
    this.exportService.ensureWithinLimit(await this.txHost.tx.veiculo.count({ where }));
    const rows = await this.txHost.tx.veiculo.findMany({ where, orderBy: toOrderBy(query.sort) });
    return this.exportService.export({
      format: query.format,
      title: 'Veículos',
      filename: 'veiculos',
      columns: selectColumns(VEICULO_EXPORT_DEFINITIONS, query.columns),
      rows: rows.map(toDto),
    });
  }

  private where(query: Pick<ListVeiculosQuery, 'search'>): Prisma.VeiculoWhereInput {
    return { ...NAO_EXCLUIDOS, ...searchWhere(query.search, CAMPOS_BUSCA) };
  }

  private async buscar(id: string): Promise<Veiculo> {
    const veiculo = isUuid(id)
      ? await this.txHost.tx.veiculo.findFirst({ where: { id, ...NAO_EXCLUIDOS } })
      : null;
    if (!veiculo) {
      throw new BusinessException(ErrorCode.NOT_FOUND, 'Veículo não encontrado', { status: 404 });
    }
    return veiculo;
  }
}
