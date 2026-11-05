import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import {
  CONTA_RECEBER_ROTULO_STATUS_EXIBICAO,
  statusExibicaoContaReceber,
  type ContaReceber,
  type ContaReceberExportColumn,
  type ContaReceberStatus,
  type CreateContaReceberInput,
  type ExportContasReceberQuery,
  type ListContasReceberQuery,
  type UpdateContaReceberInput,
} from '@torres/shared';
import type { Prisma } from '../../../generated/prisma/client';
import { ExportService, selectColumns } from '../../../common/export/export.service';
import type { ExportFile } from '../../../common/export/export.types';
import { paginate, type Page } from '../../../common/pagination/paginate';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import {
  camposContaFinanceira,
  colunasExportContaFinanceira,
  contaNaoEncontrada,
  INCLUDE_CONTA_FINANCEIRA,
  NAO_EXCLUIDAS,
  orderByContaFinanceira,
  whereContaFinanceira,
} from '../conta-financeira';

const INCLUDE = {
  ...INCLUDE_CONTA_FINANCEIRA,
  paciente: { select: { nome: true } },
} as const;

type ContaReceberComRelacoes = Prisma.ContaReceberGetPayload<{ include: typeof INCLUDE }>;

export function toContaReceber(conta: ContaReceberComRelacoes): ContaReceber {
  return {
    ...camposContaFinanceira(conta),
    pacienteId: conta.pacienteId,
    pacienteNome: conta.paciente?.nome ?? null,
    status: conta.status,
  };
}

/** Colunas exportáveis, iguais às do grid. */
export const CONTA_RECEBER_EXPORT_DEFINITIONS = colunasExportContaFinanceira<
  ContaReceber,
  ContaReceberExportColumn
>(
  { key: 'cliente', header: 'Cliente', value: (c) => c.pacienteNome ?? '', width: 3 },
  (c) => CONTA_RECEBER_ROTULO_STATUS_EXIBICAO[statusExibicaoContaReceber(c)],
);

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
    if (!conta) throw contaNaoEncontrada('Conta a receber não encontrada');
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
    return this.atualizar(id, this.dados(input));
  }

  /** Exclusão lógica: histórico financeiro. */
  async remove(id: string): Promise<ContaReceber> {
    await this.findById(id);
    return this.atualizar(id, { deletedAt: new Date() });
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

  private async atualizar(
    id: string,
    data: Prisma.ContaReceberUncheckedUpdateInput,
  ): Promise<ContaReceber> {
    const conta = await this.txHost.tx.contaReceber.update({
      where: { id },
      data,
      include: INCLUDE,
    });
    return toContaReceber(conta);
  }

  private dados(input: CreateContaReceberInput): Prisma.ContaReceberUncheckedCreateInput {
    return { ...input, dataVencimento: new Date(input.dataVencimento) };
  }

  private orderBy(
    sort: ListContasReceberQuery['sort'],
  ): Prisma.ContaReceberOrderByWithRelationInput[] {
    return orderByContaFinanceira<Prisma.ContaReceberOrderByWithRelationInput>(
      sort,
      'cliente',
      (direction) => ({ paciente: { nome: direction } }),
    );
  }

  private where(
    query: Pick<ListContasReceberQuery, 'search' | 'status' | 'vencimentoDe' | 'vencimentoAte'>,
  ): Prisma.ContaReceberWhereInput {
    return whereContaFinanceira<ContaReceberStatus, Prisma.ContaReceberWhereInput>(query, [
      { paciente: { nome: { contains: query.search, mode: 'insensitive' } } },
    ]);
  }
}
