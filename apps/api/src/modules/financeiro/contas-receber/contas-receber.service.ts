import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import {
  CONTA_RECEBER_ROTULO_STATUS,
  type ContaReceber,
  type ContaReceberExportColumn,
  type CreateContaReceberInput,
  type ExportContasReceberQuery,
  type ListContasReceberQuery,
  type UpdateContaReceberInput,
} from '@torres/shared';
import type { Prisma } from '../../../generated/prisma/client';
import { BusinessException } from '../../../common/errors/api.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import { ExportService, selectColumns } from '../../../common/export/export.service';
import type { ExportColumn, ExportFile } from '../../../common/export/export.types';
import { paginate, type Page } from '../../../common/pagination/paginate';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';

const INCLUDE = {
  paciente: { select: { nome: true } },
  formaPagamento: { select: { nome: true } },
  planoConta: { select: { nome: true } },
} as const;

type ContaReceberComRelacoes = Prisma.ContaReceberGetPayload<{ include: typeof INCLUDE }>;

const NAO_EXCLUIDAS = { deletedAt: null } as const;

export function toContaReceber(conta: ContaReceberComRelacoes): ContaReceber {
  return {
    id: conta.id,
    numero: conta.numero,
    descricao: conta.descricao,
    pacienteId: conta.pacienteId,
    pacienteNome: conta.paciente?.nome ?? null,
    valor: conta.valor.toString(),
    dataVencimento: conta.dataVencimento.toISOString().slice(0, 10),
    formaPagamentoId: conta.formaPagamentoId,
    formaPagamentoNome: conta.formaPagamento?.nome ?? null,
    planoContaId: conta.planoContaId,
    planoContaNome: conta.planoConta?.nome ?? null,
    documento: conta.documento,
    totalParcelas: conta.totalParcelas,
    status: conta.status,
    observacoes: conta.observacoes,
    createdAt: conta.createdAt.toISOString(),
    updatedAt: conta.updatedAt.toISOString(),
  };
}

/** Colunas exportáveis, iguais às do grid. */
export const CONTA_RECEBER_EXPORT_DEFINITIONS: readonly ExportColumn<
  ContaReceber,
  ContaReceberExportColumn
>[] = [
  { key: 'id', header: '#', type: 'number', value: (c) => c.numero },
  { key: 'descricao', header: 'Descrição', value: (c) => c.descricao, width: 3 },
  { key: 'cliente', header: 'Cliente', value: (c) => c.pacienteNome ?? '', width: 3 },
  { key: 'valor', header: 'Valor', type: 'currency', value: (c) => c.valor },
  { key: 'dataVencimento', header: 'Vencimento', type: 'date', value: (c) => c.dataVencimento },
  { key: 'status', header: 'Status', value: (c) => CONTA_RECEBER_ROTULO_STATUS[c.status] },
];

/** Contas a Receber do Financeiro (tela `/receber`). */
@Injectable()
export class ContasReceberService {
  constructor(
    private readonly txHost: TransactionHost<PrismaAdapter>,
    private readonly exportService: ExportService,
  ) {}

  async list(query: ListContasReceberQuery): Promise<Page<ContaReceber>> {
    const where = this.where(query);
    const orderBy = this.orderBy(query.sort);
    const page = await paginate(query, {
      findMany: (p) =>
        this.txHost.tx.contaReceber.findMany({ where, orderBy, include: INCLUDE, ...p }),
      count: () => this.txHost.tx.contaReceber.count({ where }),
    });
    return { ...page, data: page.data.map(toContaReceber) };
  }

  async findById(id: string): Promise<ContaReceber> {
    const conta = await this.txHost.tx.contaReceber.findFirst({
      where: { id, ...NAO_EXCLUIDAS },
      include: INCLUDE,
    });
    if (!conta) {
      throw new BusinessException(ErrorCode.NOT_FOUND, 'Conta a receber não encontrada', {
        status: 404,
      });
    }
    return toContaReceber(conta);
  }

  async create(input: CreateContaReceberInput): Promise<ContaReceber> {
    const conta = await this.txHost.tx.contaReceber.create({
      data: this.dados(input),
      include: INCLUDE,
    });
    return toContaReceber(conta);
  }

  async update(id: string, input: UpdateContaReceberInput): Promise<ContaReceber> {
    await this.findById(id);
    const conta = await this.txHost.tx.contaReceber.update({
      where: { id },
      data: this.dados(input),
      include: INCLUDE,
    });
    return toContaReceber(conta);
  }

  /** Exclusão lógica: histórico financeiro. */
  async remove(id: string): Promise<ContaReceber> {
    await this.findById(id);
    const conta = await this.txHost.tx.contaReceber.update({
      where: { id },
      data: { deletedAt: new Date() },
      include: INCLUDE,
    });
    return toContaReceber(conta);
  }

  async export(query: ExportContasReceberQuery): Promise<ExportFile> {
    const where = this.where(query);
    this.exportService.ensureWithinLimit(await this.txHost.tx.contaReceber.count({ where }));
    const rows = await this.txHost.tx.contaReceber.findMany({
      where,
      orderBy: this.orderBy(query.sort),
      include: INCLUDE,
    });
    return this.exportService.export({
      format: query.format,
      title: 'Contas a Receber',
      filename: 'contas-receber',
      columns: selectColumns(CONTA_RECEBER_EXPORT_DEFINITIONS, query.columns),
      rows: rows.map(toContaReceber),
    });
  }

  private dados(input: CreateContaReceberInput): Prisma.ContaReceberUncheckedCreateInput {
    return { ...input, dataVencimento: new Date(input.dataVencimento) };
  }

  private orderBy(
    sort: ListContasReceberQuery['sort'],
  ): Prisma.ContaReceberOrderByWithRelationInput[] {
    const { field, direction } = sort;
    const principal: Prisma.ContaReceberOrderByWithRelationInput =
      field === 'id'
        ? { numero: direction }
        : field === 'cliente'
          ? { paciente: { nome: direction } }
          : { [field]: direction };
    return [principal, { id: direction }];
  }

  private where(
    query: Pick<ListContasReceberQuery, 'search' | 'status' | 'vencimentoDe' | 'vencimentoAte'>,
  ): Prisma.ContaReceberWhereInput {
    return {
      ...NAO_EXCLUIDAS,
      status: query.status,
      dataVencimento: {
        gte: query.vencimentoDe ? new Date(query.vencimentoDe) : undefined,
        lte: query.vencimentoAte ? new Date(query.vencimentoAte) : undefined,
      },
      ...(query.search && {
        OR: [
          { descricao: { contains: query.search, mode: 'insensitive' } },
          { documento: { contains: query.search, mode: 'insensitive' } },
          { paciente: { nome: { contains: query.search, mode: 'insensitive' } } },
        ],
      }),
    };
  }
}
