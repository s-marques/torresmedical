import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import {
  CONTA_PAGAR_ROTULO_STATUS_EXIBICAO,
  statusExibicaoContaPagar,
  type BaixarContaPagarInput,
  type ContaPagar,
  type ContaPagarBaixa,
  type ContaPagarExportColumn,
  type ContaPagarStatus,
  type CreateContaPagarInput,
  type ExportContasPagarQuery,
  type ListContasPagarQuery,
  type UpdateContaPagarInput,
} from '@torres/shared';
import { Prisma } from '../../../generated/prisma/client';
import { FornecedoresService } from '../../compras-estoque/fornecedores/fornecedores.service';
import { FuncionariosService } from '../../regulatorio-qualidade/funcionarios/funcionarios.service';
import { BusinessException } from '../../../common/errors/api.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
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
  baixas: { where: { deletedAt: null }, select: { valorPago: true } },
} as const;

type ContaPagarComRelacoes = Prisma.ContaPagarGetPayload<{ include: typeof INCLUDE }>;

const INCLUDE_BAIXA = {
  formaPagamento: { select: { nome: true } },
  contaBancaria: { select: { nome: true } },
} as const;

type ContaPagarBaixaComRelacoes = Prisma.ContaPagarBaixaGetPayload<{
  include: typeof INCLUDE_BAIXA;
}>;

function somaBaixas(baixas: readonly { valorPago: Prisma.Decimal }[]): Prisma.Decimal {
  return baixas.reduce((total, b) => total.add(b.valorPago), new Prisma.Decimal(0));
}

export function toContaPagarBaixa(baixa: ContaPagarBaixaComRelacoes): ContaPagarBaixa {
  return {
    id: baixa.id,
    contaPagarId: baixa.contaPagarId,
    dataPagamento: baixa.dataPagamento.toISOString().slice(0, 10),
    valorPago: baixa.valorPago.toString(),
    juros: baixa.juros.toString(),
    desconto: baixa.desconto.toString(),
    formaPagamentoId: baixa.formaPagamentoId,
    formaPagamentoNome: baixa.formaPagamento?.nome ?? null,
    contaBancariaId: baixa.contaBancariaId,
    contaBancariaNome: baixa.contaBancaria?.nome ?? null,
    documento: baixa.documento,
    observacoes: baixa.observacoes,
    comprovanteArquivoId: baixa.comprovanteArquivoId,
    createdAt: baixa.createdAt.toISOString(),
  };
}

/** Colunas exportáveis, iguais às do grid. */
export const CONTA_PAGAR_EXPORT_DEFINITIONS = colunasExportContaFinanceira<
  ContaPagar,
  ContaPagarExportColumn
>(
  {
    key: 'beneficiario',
    header: 'Fornecedor / Funcionário',
    value: (c) => c.beneficiarioNome ?? '',
    width: 3,
  },
  (c) => CONTA_PAGAR_ROTULO_STATUS_EXIBICAO[statusExibicaoContaPagar(c)],
);

/** Contas a Pagar do Financeiro (tela `/pagar`), com beneficiário Fornecedor ou Funcionário. */
@Injectable()
export class ContasPagarService {
  constructor(
    private readonly txHost: TransactionHost<PrismaAdapter>,
    private readonly exportService: ExportService,
    private readonly fornecedores: FornecedoresService,
    private readonly funcionarios: FuncionariosService,
  ) {}

  async list(query: ListContasPagarQuery): Promise<Page<ContaPagar>> {
    const where = this.where(query);
    const orderBy = this.orderBy(query.sort);
    const page = await paginate(query, {
      findMany: (p) =>
        this.txHost.tx.contaPagar.findMany({ where, orderBy, include: INCLUDE, ...p }),
      count: () => this.txHost.tx.contaPagar.count({ where }),
    });
    const data = await Promise.all(page.data.map((c) => this.toContaPagar(c)));
    return { ...page, data };
  }

  async findById(id: string): Promise<ContaPagar> {
    const conta = await this.buscarAtiva(id);
    return this.toContaPagar(conta);
  }

  async create(input: CreateContaPagarInput): Promise<ContaPagar> {
    await this.validarBeneficiario(input.beneficiarioTipo, input.beneficiarioId);
    const conta = await this.txHost.tx.contaPagar.create({
      data: this.dados(input),
      include: INCLUDE,
    });
    return this.toContaPagar(conta);
  }

  async update(id: string, input: UpdateContaPagarInput): Promise<ContaPagar> {
    await this.buscarAtiva(id);
    await this.validarBeneficiario(input.beneficiarioTipo, input.beneficiarioId);
    const conta = await this.txHost.tx.contaPagar.update({
      where: { id },
      data: this.dados(input),
      include: INCLUDE,
    });
    return this.toContaPagar(conta);
  }

  /** Exclusão lógica: histórico financeiro. */
  async remove(id: string): Promise<ContaPagar> {
    await this.buscarAtiva(id);
    const conta = await this.txHost.tx.contaPagar.update({
      where: { id },
      data: { deletedAt: new Date() },
      include: INCLUDE,
    });
    return this.toContaPagar(conta);
  }

  async listBaixas(id: string): Promise<ContaPagarBaixa[]> {
    await this.buscarAtiva(id);
    const baixas = await this.txHost.tx.contaPagarBaixa.findMany({
      where: { contaPagarId: id, deletedAt: null },
      include: INCLUDE_BAIXA,
      orderBy: { createdAt: 'desc' },
    });
    return baixas.map(toContaPagarBaixa);
  }

  /** Modal "Baixar Conta a Pagar". Quita a conta quando a soma das baixas atinge o valor. */
  async baixar(id: string, input: BaixarContaPagarInput): Promise<ContaPagar> {
    const conta = await this.buscarAtiva(id);
    if (conta.status === 'CANCELADO') {
      throw new BusinessException(
        ErrorCode.BUSINESS_RULE,
        'Não é possível baixar uma conta cancelada.',
      );
    }
    if (conta.status === 'PAGO') {
      throw new BusinessException(ErrorCode.BUSINESS_RULE, 'Esta conta já está paga.');
    }
    if (input.formaPagamentoId) await this.buscarFormaPagamento(input.formaPagamentoId);
    if (input.contaBancariaId) await this.buscarContaBancaria(input.contaBancariaId);

    await this.txHost.tx.contaPagarBaixa.create({
      data: { contaPagarId: id, ...input, dataPagamento: new Date(input.dataPagamento) },
    });
    return this.recalcularStatus(id);
  }

  /** "Cancelar Baixa": exclusão lógica da baixa mais recente e recálculo do status. */
  async cancelarBaixa(id: string): Promise<ContaPagar> {
    await this.buscarAtiva(id);
    const ultima = await this.txHost.tx.contaPagarBaixa.findFirst({
      where: { contaPagarId: id, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (!ultima) {
      throw new BusinessException(
        ErrorCode.BUSINESS_RULE,
        'Esta conta não tem baixa para cancelar.',
      );
    }
    await this.txHost.tx.contaPagarBaixa.update({
      where: { id: ultima.id },
      data: { deletedAt: new Date() },
    });
    return this.recalcularStatus(id);
  }

  async export(query: ExportContasPagarQuery): Promise<ExportFile> {
    const where = this.where(query);
    this.exportService.ensureWithinLimit(await this.txHost.tx.contaPagar.count({ where }));
    const rows = await this.txHost.tx.contaPagar.findMany({
      where,
      orderBy: this.orderBy(query.sort),
      include: INCLUDE,
    });
    const data = await Promise.all(rows.map((c) => this.toContaPagar(c)));
    return this.exportService.export({
      format: query.format,
      title: 'Contas a Pagar',
      filename: 'contas-pagar',
      columns: selectColumns(CONTA_PAGAR_EXPORT_DEFINITIONS, query.columns),
      rows: data,
    });
  }

  /** Recalcula o total pago e o status (Pago quando atinge o valor; Pendente caso contrário). */
  private async recalcularStatus(id: string): Promise<ContaPagar> {
    const conta = await this.buscarAtiva(id);
    const baixas = await this.txHost.tx.contaPagarBaixa.findMany({
      where: { contaPagarId: id, deletedAt: null },
      select: { valorPago: true },
    });
    const totalPago = somaBaixas(baixas);
    const status = totalPago.greaterThanOrEqualTo(conta.valor) ? 'PAGO' : 'PENDENTE';
    const atualizada = await this.txHost.tx.contaPagar.update({
      where: { id },
      data: { status },
      include: INCLUDE,
    });
    return this.toContaPagar(atualizada);
  }

  private async buscarAtiva(id: string): Promise<ContaPagarComRelacoes> {
    const conta = await this.txHost.tx.contaPagar.findFirst({
      where: { id, ...NAO_EXCLUIDAS },
      include: INCLUDE,
    });
    if (!conta) throw contaNaoEncontrada('Conta a pagar não encontrada');
    return conta;
  }

  private async buscarFormaPagamento(id: string): Promise<void> {
    const existe = await this.txHost.tx.formaPagamento.findFirst({
      where: { id, deletedAt: null },
      select: { id: true },
    });
    if (!existe) throw contaNaoEncontrada('Forma de pagamento não encontrada');
  }

  private async buscarContaBancaria(id: string): Promise<void> {
    const existe = await this.txHost.tx.contaBancaria.findFirst({
      where: { id, deletedAt: null },
      select: { id: true },
    });
    if (!existe) throw contaNaoEncontrada('Conta bancária não encontrada');
  }

  /** Beneficiário opcional; quando informado, precisa existir no módulo dono (sem FK). */
  private async validarBeneficiario(
    tipo: CreateContaPagarInput['beneficiarioTipo'],
    beneficiarioId: string | null,
  ): Promise<void> {
    if (!beneficiarioId) return;
    if (tipo === 'FORNECEDOR') await this.fornecedores.findById(beneficiarioId);
    else await this.funcionarios.findById(beneficiarioId);
  }

  /** Nome do beneficiário pelo módulo dono; `null` se o cadastro foi excluído depois. */
  private async nomeBeneficiario(
    tipo: ContaPagar['beneficiarioTipo'],
    beneficiarioId: string | null,
  ): Promise<string | null> {
    if (!beneficiarioId) return null;
    try {
      const registro =
        tipo === 'FORNECEDOR'
          ? await this.fornecedores.findById(beneficiarioId)
          : await this.funcionarios.findById(beneficiarioId);
      return registro.nome;
    } catch {
      return null;
    }
  }

  private async toContaPagar(conta: ContaPagarComRelacoes): Promise<ContaPagar> {
    const beneficiarioId = conta.fornecedorId ?? conta.funcionarioId;
    return {
      ...camposContaFinanceira(conta),
      beneficiarioTipo: conta.beneficiarioTipo,
      beneficiarioId,
      beneficiarioNome: await this.nomeBeneficiario(conta.beneficiarioTipo, beneficiarioId),
      status: conta.status,
      valorPago: somaBaixas(conta.baixas).toString(),
    };
  }

  private dados(input: CreateContaPagarInput): Prisma.ContaPagarUncheckedCreateInput {
    const { beneficiarioTipo, beneficiarioId, dataVencimento, ...resto } = input;
    return {
      ...resto,
      beneficiarioTipo,
      fornecedorId: beneficiarioTipo === 'FORNECEDOR' ? beneficiarioId : null,
      funcionarioId: beneficiarioTipo === 'FUNCIONARIO' ? beneficiarioId : null,
      dataVencimento: new Date(dataVencimento),
    };
  }

  private orderBy(sort: ListContasPagarQuery['sort']): Prisma.ContaPagarOrderByWithRelationInput[] {
    return orderByContaFinanceira<Prisma.ContaPagarOrderByWithRelationInput>(
      sort,
      'beneficiario',
      (direction) => ({ descricao: direction }),
    );
  }

  private where(
    query: Pick<ListContasPagarQuery, 'search' | 'status' | 'vencimentoDe' | 'vencimentoAte'>,
  ): Prisma.ContaPagarWhereInput {
    return whereContaFinanceira<ContaPagarStatus, Prisma.ContaPagarWhereInput>(query);
  }
}
