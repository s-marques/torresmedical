import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import {
  BEM_TIPO_ROTULOS,
  valorDoBem,
  type Bem as BemDto,
  type BemExportColumn,
  type CreateBemInput,
  type ExportBensQuery,
  type ListBensQuery,
  type ResumoPatrimonio,
  type UpdateBemInput,
} from '@torres/shared';
import { isUuid } from '../../../common/auth/tokens';
import { BusinessException } from '../../../common/errors/api.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import { ExportService, selectColumns } from '../../../common/export/export.service';
import type { ExportColumn, ExportFile } from '../../../common/export/export.types';
import { paginate, searchWhere, toOrderBy, type Page } from '../../../common/pagination/paginate';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import type { Bem, Prisma } from '../../../generated/prisma/client';

const NAO_EXCLUIDOS = { deletedAt: null } as const;

/** "Buscar bens..." procura na descrição, na placa e no RENAVAM. */
const CAMPOS_BUSCA = ['descricao', 'placa', 'renavam'] as const;

const numeroOuNull = (valor: { toString(): string } | null) =>
  valor === null ? null : Number(valor);

const paraData = (valor: string | null) => (valor ? new Date(`${valor}T00:00:00.000Z`) : null);
const dataOuNull = (valor: Date | null) => (valor ? valor.toISOString().slice(0, 10) : null);

/** Dados do Veículo só valem para Automóvel: nos outros tipos são descartados. */
function toData(input: CreateBemInput): Prisma.BemUncheckedCreateInput {
  const veiculo = input.tipo === 'AUTOMOVEL';
  return {
    produtoId: input.produtoId,
    descricao: input.descricao,
    tipo: input.tipo,
    valorCompra: input.valorCompra,
    dataAquisicao: paraData(input.dataAquisicao),
    marca: veiculo ? input.marca : null,
    modelo: veiculo ? input.modelo : null,
    ano: veiculo ? input.ano : null,
    placa: veiculo ? input.placa : null,
    renavam: veiculo ? input.renavam : null,
    financiado: veiculo && input.financiado,
    possuiSeguro: veiculo && input.possuiSeguro,
  };
}

export function toDto(bem: Bem): BemDto {
  return {
    id: bem.id,
    produtoId: bem.produtoId,
    descricao: bem.descricao,
    tipo: bem.tipo,
    valorCompra: numeroOuNull(bem.valorCompra),
    valorAtual: numeroOuNull(bem.valorAtual),
    dataAquisicao: dataOuNull(bem.dataAquisicao),
    marca: bem.marca,
    modelo: bem.modelo,
    ano: bem.ano,
    placa: bem.placa,
    renavam: bem.renavam,
    financiado: bem.financiado,
    possuiSeguro: bem.possuiSeguro,
    // Ainda não há cadastro de impostos/taxas (sem print nem regra no card #62).
    impostosPendentes: 0,
    createdAt: bem.createdAt.toISOString(),
    updatedAt: bem.updatedAt.toISOString(),
  };
}

/** Colunas exportáveis, iguais às do grid. */
export const BEM_EXPORT_DEFINITIONS: readonly ExportColumn<BemDto, BemExportColumn>[] = [
  { key: 'descricao', header: 'Descrição', value: (b) => b.descricao, width: 3 },
  { key: 'tipo', header: 'Tipo', value: (b) => BEM_TIPO_ROTULOS[b.tipo] },
  { key: 'valorCompra', header: 'Valor Compra', type: 'currency', value: (b) => b.valorCompra },
  { key: 'valorAtual', header: 'Valor Atual', type: 'currency', value: (b) => b.valorAtual },
  { key: 'dataAquisicao', header: 'Data Aquisição', type: 'date', value: (b) => b.dataAquisicao },
  {
    key: 'impostosPendentes',
    header: 'Impostos Pend.',
    type: 'number',
    value: (b) => b.impostosPendentes,
  },
];

/** Bens do patrimônio (tela Patrimônio, `/patrimonio`, issue #62). */
@Injectable()
export class PatrimonioService {
  constructor(
    private readonly txHost: TransactionHost<PrismaAdapter>,
    private readonly exportService: ExportService,
  ) {}

  async list(query: ListBensQuery): Promise<Page<BemDto>> {
    const where = this.where(query);
    const orderBy = toOrderBy(query.sort);
    const page = await paginate(query, {
      findMany: (p) => this.txHost.tx.bem.findMany({ where, orderBy, ...p }),
      count: () => this.txHost.tx.bem.count({ where }),
    });
    return { ...page, data: page.data.map(toDto) };
  }

  /** Cartões do topo: Valor Total Patrimônio, Impostos Pendentes e Alertas Próximos. */
  async resumo(): Promise<ResumoPatrimonio> {
    const bens = await this.txHost.tx.bem.findMany({
      where: NAO_EXCLUIDOS,
      select: { valorAtual: true, valorCompra: true },
    });
    const centavos = bens.reduce(
      (total, b) =>
        total +
        Math.round(
          valorDoBem({
            valorAtual: numeroOuNull(b.valorAtual),
            valorCompra: numeroOuNull(b.valorCompra),
          }) * 100,
        ),
      0,
    );
    return { valorTotal: centavos / 100, impostosPendentes: 0, alertasProximos: 0 };
  }

  async findById(id: string): Promise<BemDto> {
    return toDto(await this.buscar(id));
  }

  async create(input: CreateBemInput): Promise<BemDto> {
    return toDto(await this.txHost.tx.bem.create({ data: toData(input) }));
  }

  /** Substitui todos os campos: o modal Editar envia o formulário inteiro. */
  async update(id: string, input: UpdateBemInput): Promise<BemDto> {
    await this.buscar(id);
    return toDto(await this.txHost.tx.bem.update({ where: { id }, data: toData(input) }));
  }

  /** Exclusão lógica (registro com dados financeiros). */
  async remove(id: string): Promise<BemDto> {
    await this.buscar(id);
    return toDto(
      await this.txHost.tx.bem.update({ where: { id }, data: { deletedAt: new Date() } }),
    );
  }

  async export(query: ExportBensQuery): Promise<ExportFile> {
    const where = this.where(query);
    this.exportService.ensureWithinLimit(await this.txHost.tx.bem.count({ where }));
    const rows = await this.txHost.tx.bem.findMany({ where, orderBy: toOrderBy(query.sort) });
    return this.exportService.export({
      format: query.format,
      title: 'Patrimônio',
      filename: 'patrimonio',
      columns: selectColumns(BEM_EXPORT_DEFINITIONS, query.columns),
      rows: rows.map(toDto),
    });
  }

  private where(query: Pick<ListBensQuery, 'search' | 'tipo'>): Prisma.BemWhereInput {
    return {
      ...NAO_EXCLUIDOS,
      ...(query.tipo && { tipo: query.tipo }),
      ...searchWhere(query.search, CAMPOS_BUSCA),
    };
  }

  private async buscar(id: string): Promise<Bem> {
    const bem = isUuid(id)
      ? await this.txHost.tx.bem.findFirst({ where: { id, ...NAO_EXCLUIDOS } })
      : null;
    if (!bem) {
      throw new BusinessException(ErrorCode.NOT_FOUND, 'Bem não encontrado', { status: 404 });
    }
    return bem;
  }
}
