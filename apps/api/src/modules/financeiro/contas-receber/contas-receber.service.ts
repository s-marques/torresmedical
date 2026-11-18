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
import { AuditService } from '../../../common/audit/audit.service';
import { ExportService, selectColumns } from '../../../common/export/export.service';
import type { ExportFile } from '../../../common/export/export.types';
import { paginate, type Page } from '../../../common/pagination/paginate';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import { ContasBancariasService } from '../contas-bancarias/contas-bancarias.service';
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
  contaBancaria: { select: { nome: true } },
} as const;

type ContaReceberComRelacoes = Prisma.ContaReceberGetPayload<{ include: typeof INCLUDE }>;

/**
 * Entrada de criação. Conta bancária e data de recebimento são opcionais para quem cria fora da
 * tela (ex.: cobrança de contrato de sala).
 */
type DadosContaReceber = Omit<CreateContaReceberInput, 'contaBancariaId' | 'dataRecebimento'> &
  Partial<Pick<CreateContaReceberInput, 'contaBancariaId' | 'dataRecebimento'>>;

const hoje = () => new Date().toISOString().slice(0, 10);

export function toContaReceber(conta: ContaReceberComRelacoes): ContaReceber {
  return {
    ...camposContaFinanceira(conta),
    pacienteId: conta.pacienteId,
    pacienteNome: conta.paciente?.nome ?? null,
    status: conta.status,
    contaBancariaId: conta.contaBancariaId,
    contaBancariaNome: conta.contaBancaria?.nome ?? null,
    dataRecebimento: conta.dataRecebimento?.toISOString().slice(0, 10) ?? null,
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
    private readonly audit: AuditService,
    private readonly contasBancarias: ContasBancariasService,
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

  async create(input: DadosContaReceber): Promise<ContaReceber> {
    const conta = await this.txHost.tx.contaReceber.create({
      data: await this.dados(input),
      include: INCLUDE,
    });
    return toContaReceber(conta);
  }

  async update(id: string, input: UpdateContaReceberInput): Promise<ContaReceber> {
    const atual = await this.findById(id);
    return this.atualizar(id, await this.dados(input, atual.dataRecebimento));
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

  /**
   * Cria uma conta a receber fora do fluxo da tela (ex.: cobrança de contrato de sala, Gestão
   * Profissionais), com auditoria própria já que não passa pelo `AuditInterceptor` do controller.
   */
  async criarDeOrigemExterna(input: DadosContaReceber): Promise<ContaReceber> {
    const conta = await this.create(input);
    await this.audit.record({
      action: 'CREATE',
      entity: 'ContaReceber',
      entityId: conta.id,
      before: null,
      after: conta,
    });
    return conta;
  }

  /**
   * Cancela (status `CANCELADO`) as contas pendentes entre os ids informados com vencimento
   * depois de `apartirDe` (`AAAA-MM-DD`). Usado quando um contrato de sala é encerrado ou
   * cancelado: as parcelas futuras não são mais cobradas. Retorna quantas foram canceladas.
   */
  async cancelarPendentesComVencimentoApos(
    ids: readonly string[],
    apartirDe: string,
  ): Promise<number> {
    if (ids.length === 0) return 0;
    const contas = await this.txHost.tx.contaReceber.findMany({
      where: {
        id: { in: [...ids] },
        status: 'PENDENTE',
        dataVencimento: { gt: new Date(`${apartirDe}T00:00:00.000Z`) },
        ...NAO_EXCLUIDAS,
      },
      include: INCLUDE,
    });
    for (const conta of contas) {
      const antes = toContaReceber(conta);
      const depois = await this.atualizar(conta.id, { status: 'CANCELADO' });
      await this.audit.record({
        action: 'UPDATE',
        entity: 'ContaReceber',
        entityId: conta.id,
        before: antes,
        after: depois,
      });
    }
    return contas.length;
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

  /**
   * Conta bancária e data de recebimento só valem com status Recebido (decisão do dev na #46):
   * sem data, vale a já gravada ou a de hoje; fora de Recebido, os dois são limpos.
   */
  private async dados(
    input: DadosContaReceber,
    dataRecebimentoAtual: string | null = null,
  ): Promise<Prisma.ContaReceberUncheckedCreateInput> {
    const { contaBancariaId, dataRecebimento, ...resto } = input;
    const recebido = input.status === 'RECEBIDO';
    if (recebido && contaBancariaId) await this.contasBancarias.garantirExiste(contaBancariaId);
    return {
      ...resto,
      dataVencimento: new Date(input.dataVencimento),
      contaBancariaId: recebido ? (contaBancariaId ?? null) : null,
      dataRecebimento: recebido
        ? new Date(dataRecebimento ?? dataRecebimentoAtual ?? hoje())
        : null,
    };
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
