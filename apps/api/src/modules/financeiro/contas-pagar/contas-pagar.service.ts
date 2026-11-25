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
  CONTA_PAGAR_APROVACAO_INVALIDA,
  CONTA_PAGAR_APROVADOR_IGUAL_LANCADOR,
  CONTA_PAGAR_BAIXA_DIVERGENTE,
  CONTA_PAGAR_NAO_APROVADA,
  type CreateContaPagarInput,
  type ExportContasPagarQuery,
  type ListContasPagarQuery,
  type RecusarContaPagarInput,
  type UpdateContaPagarInput,
} from '@torres/shared';
import { Prisma } from '../../../generated/prisma/client';
import { UsuariosService } from '../../configuracoes-gestao/usuarios/usuarios.service';
import { FornecedoresService } from '../../compras-estoque/fornecedores/fornecedores.service';
import { FuncionariosService } from '../../regulatorio-qualidade/funcionarios/funcionarios.service';
import { CentrosCustoService } from '../centros-custo/centros-custo.service';
import { RequestContextService } from '../../../common/context/request-context.service';
import { BusinessException } from '../../../common/errors/api.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import { ExportService, selectColumns } from '../../../common/export/export.service';
import type { ExportFile } from '../../../common/export/export.types';
import { paginate, type Page } from '../../../common/pagination/paginate';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import { ContasPagarDuplicidadeService } from './contas-pagar-duplicidade.service';
import { nomeBeneficiario } from './nome-beneficiario';
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
  centroCusto: { select: { nome: true } },
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
    divergencia: baixa.divergencia?.toString() ?? null,
    justificativaDivergencia: baixa.justificativaDivergencia,
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
    private readonly centrosCusto: CentrosCustoService,
    private readonly duplicidade: ContasPagarDuplicidadeService,
    private readonly usuarios: UsuariosService,
    private readonly contexto: RequestContextService,
  ) {}

  async list(query: ListContasPagarQuery): Promise<Page<ContaPagar>> {
    const where = this.where(query);
    const orderBy = this.orderBy(query.sort);
    const page = await paginate(query, {
      findMany: (p) =>
        this.txHost.tx.contaPagar.findMany({ where, orderBy, include: INCLUDE, ...p }),
      count: () => this.txHost.tx.contaPagar.count({ where }),
    });
    const nomes = await this.nomesDecisores(page.data);
    const data = await Promise.all(page.data.map((c) => this.toContaPagar(c, nomes)));
    return { ...page, data };
  }

  async findById(id: string): Promise<ContaPagar> {
    const conta = await this.buscarAtiva(id);
    return this.toContaPagar(conta, await this.nomesDecisores([conta]));
  }

  async create(input: CreateContaPagarInput): Promise<ContaPagar> {
    await this.validarBeneficiario(input.beneficiarioTipo, input.beneficiarioId);
    await this.validarCentroCusto(input.centroCustoId);
    // Conta nova nasce aguardando aprovação: não pode ser criada já paga (issue #164).
    this.exigirAprovadaParaPago(input.status, 'LANCADA');
    const candidatos = await this.duplicidade.exigirConfirmacao(input, input.duplicidadeConfirmada);
    const conta = await this.txHost.tx.contaPagar.create({
      data: { ...this.dados(input), lancadoPorId: this.contexto.getUserId() ?? null },
      include: INCLUDE,
    });
    await this.duplicidade.registrarConfirmacao(conta.id, candidatos);
    return this.toContaPagar(conta);
  }

  async update(id: string, input: UpdateContaPagarInput): Promise<ContaPagar> {
    const atual = await this.buscarAtiva(id);
    await this.validarBeneficiario(input.beneficiarioTipo, input.beneficiarioId);
    await this.validarCentroCusto(input.centroCustoId);
    const reenviar = this.exigeNovaAprovacao(atual, input);
    this.exigirAprovadaParaPago(input.status, reenviar ? 'LANCADA' : atual.aprovacao, atual.status);
    const candidatos = await this.duplicidade.exigirConfirmacao(
      input,
      input.duplicidadeConfirmada,
      id,
    );
    const conta = await this.txHost.tx.contaPagar.update({
      where: { id },
      data: {
        ...this.dados(input),
        ...(reenviar && {
          aprovacao: 'LANCADA' as const,
          lancadoPorId: this.contexto.getUserId() ?? null,
          aprovadoPorId: null,
          aprovadoEm: null,
          recusadoPorId: null,
          recusadoEm: null,
          motivoRecusa: null,
        }),
      },
      include: INCLUDE,
    });
    await this.duplicidade.registrarConfirmacao(id, candidatos);
    return this.toContaPagar(conta, await this.nomesDecisores([conta]));
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
    if (conta.aprovacao !== 'APROVADA') {
      throw new BusinessException(
        CONTA_PAGAR_NAO_APROVADA,
        'A conta precisa ser aprovada antes da baixa.',
      );
    }
    if (input.formaPagamentoId) await this.buscarFormaPagamento(input.formaPagamentoId);
    if (input.contaBancariaId) await this.buscarContaBancaria(input.contaBancariaId);

    const { divergencia, justificativaDivergencia } = await this.divergenciaDaBaixa(conta, input);
    await this.txHost.tx.contaPagarBaixa.create({
      data: {
        contaPagarId: id,
        dataPagamento: new Date(input.dataPagamento),
        valorPago: input.valorPago,
        juros: input.juros,
        desconto: input.desconto,
        formaPagamentoId: input.formaPagamentoId,
        contaBancariaId: input.contaBancariaId,
        documento: input.documento,
        observacoes: input.observacoes,
        comprovanteArquivoId: input.comprovanteArquivoId,
        divergencia,
        justificativaDivergencia,
      },
    });
    return this.recalcularStatus(id);
  }

  /** Aprova a conta aguardando aprovação (issue #164). Quem lançou não aprova a própria. */
  async aprovar(id: string): Promise<ContaPagar> {
    const usuarioId = this.exigirDecisor(await this.buscarAtiva(id));
    const conta = await this.txHost.tx.contaPagar.update({
      where: { id },
      data: {
        aprovacao: 'APROVADA',
        aprovadoPorId: usuarioId,
        aprovadoEm: new Date(),
        recusadoPorId: null,
        recusadoEm: null,
        motivoRecusa: null,
      },
      include: INCLUDE,
    });
    return this.toContaPagar(conta, await this.nomesDecisores([conta]));
  }

  /** Recusa a conta aguardando aprovação, com motivo. Editar a conta a reenvia para aprovação. */
  async recusar(id: string, input: RecusarContaPagarInput): Promise<ContaPagar> {
    const usuarioId = this.exigirDecisor(await this.buscarAtiva(id));
    const conta = await this.txHost.tx.contaPagar.update({
      where: { id },
      data: {
        aprovacao: 'RECUSADA',
        recusadoPorId: usuarioId,
        recusadoEm: new Date(),
        motivoRecusa: input.motivo,
        aprovadoPorId: null,
        aprovadoEm: null,
      },
      include: INCLUDE,
    });
    return this.toContaPagar(conta, await this.nomesDecisores([conta]));
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
    const nomes = await this.nomesDecisores(rows);
    const data = await Promise.all(rows.map((c) => this.toContaPagar(c, nomes)));
    return this.exportService.export({
      format: query.format,
      title: 'Contas a Pagar',
      filename: 'contas-pagar',
      columns: selectColumns(CONTA_PAGAR_EXPORT_DEFINITIONS, query.columns),
      rows: data,
    });
  }

  /** Devolve o usuário logado se ele pode decidir sobre a conta; senão, erro de negócio. */
  private exigirDecisor(conta: ContaPagarComRelacoes): string {
    if (conta.status !== 'PENDENTE' || conta.aprovacao !== 'LANCADA') {
      throw new BusinessException(
        CONTA_PAGAR_APROVACAO_INVALIDA,
        'Só uma conta pendente e aguardando aprovação pode ser aprovada ou recusada.',
      );
    }
    const usuarioId = this.contexto.getUserId();
    if (!usuarioId || usuarioId === conta.lancadoPorId) {
      throw new BusinessException(
        CONTA_PAGAR_APROVADOR_IGUAL_LANCADOR,
        'Quem lançou a conta não pode aprová-la nem recusá-la.',
      );
    }
    return usuarioId;
  }

  /**
   * A aprovação vale para o que foi aprovado: mudar valor, vencimento, beneficiário ou documento de
   * conta aprovada ainda não paga a devolve para aprovação. Conta recusada, ao ser editada, é
   * reenviada.
   */
  private exigeNovaAprovacao(atual: ContaPagarComRelacoes, input: UpdateContaPagarInput): boolean {
    if (atual.aprovacao === 'RECUSADA') return true;
    if (atual.aprovacao !== 'APROVADA' || atual.status !== 'PENDENTE') return false;
    const beneficiarioAtual = atual.fornecedorId ?? atual.funcionarioId;
    return (
      !atual.valor.equals(new Prisma.Decimal(input.valor)) ||
      atual.dataVencimento.toISOString().slice(0, 10) !== input.dataVencimento ||
      atual.beneficiarioTipo !== input.beneficiarioTipo ||
      beneficiarioAtual !== input.beneficiarioId ||
      (atual.documento ?? null) !== (input.documento ?? null)
    );
  }

  /** "Pago" só pela baixa, que exige conta aprovada: o campo Status do modal não contorna isso. */
  private exigirAprovadaParaPago(
    status: ContaPagarStatus,
    aprovacao: string,
    statusAtual?: ContaPagarStatus,
  ): void {
    if (status === 'PAGO' && statusAtual !== 'PAGO' && aprovacao !== 'APROVADA') {
      throw new BusinessException(
        CONTA_PAGAR_NAO_APROVADA,
        'A conta precisa ser aprovada antes de ser marcada como paga.',
      );
    }
  }

  /** `id → nome` de quem aprovou ou recusou as contas, numa consulta só. */
  private nomesDecisores(
    contas: readonly { aprovadoPorId?: string | null; recusadoPorId?: string | null }[],
  ): Promise<ReadonlyMap<string, string>> {
    const ids = contas.flatMap((c) => [c.aprovadoPorId, c.recusadoPorId]).filter((id) => !!id);
    return this.usuarios.nomesPorIds(ids as string[]);
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

  /** Centro de custo opcional; quando informado, precisa existir e estar ativo. */
  private async validarCentroCusto(centroCustoId: string | null): Promise<void> {
    if (!centroCustoId) return;
    const centro = await this.centrosCusto.findById(centroCustoId);
    if (!centro.ativo) {
      throw new BusinessException(ErrorCode.BUSINESS_RULE, 'Centro de custo inativo.');
    }
  }

  /**
   * Divergência da baixa: valor pago menos o saldo do título (juros e desconto são campos à
   * parte e não entram na conta). Qualquer diferença exige justificativa e entra no relatório.
   */
  private async divergenciaDaBaixa(
    conta: ContaPagarComRelacoes,
    input: BaixarContaPagarInput,
  ): Promise<{ divergencia: Prisma.Decimal | null; justificativaDivergencia: string | null }> {
    const anteriores = await this.txHost.tx.contaPagarBaixa.findMany({
      where: { contaPagarId: conta.id, deletedAt: null },
      select: { valorPago: true },
    });
    const saldo = conta.valor.sub(somaBaixas(anteriores));
    const diferenca = new Prisma.Decimal(input.valorPago).sub(saldo);
    // Pagar menos de propósito (checkbox "Pagamento parcial") não é divergência.
    const parcialIntencional = input.pagamentoParcial && diferenca.isNegative();
    if (diferenca.isZero() || parcialIntencional)
      return { divergencia: null, justificativaDivergencia: null };
    if (!input.justificativaDivergencia) {
      throw new BusinessException(
        CONTA_PAGAR_BAIXA_DIVERGENTE,
        'O valor pago é diferente do saldo do título. Informe a justificativa.',
      );
    }
    return { divergencia: diferenca, justificativaDivergencia: input.justificativaDivergencia };
  }

  /** Nome do beneficiário pelo módulo dono; nulo se o cadastro foi excluído depois. */
  private nomeBeneficiario(
    tipo: ContaPagar['beneficiarioTipo'],
    beneficiarioId: string | null,
  ): Promise<string | null> {
    return nomeBeneficiario(this.fornecedores, this.funcionarios, tipo, beneficiarioId);
  }

  private async toContaPagar(
    conta: ContaPagarComRelacoes,
    nomes: ReadonlyMap<string, string> = new Map(),
  ): Promise<ContaPagar> {
    const beneficiarioId = conta.fornecedorId ?? conta.funcionarioId;
    return {
      ...camposContaFinanceira(conta),
      beneficiarioTipo: conta.beneficiarioTipo,
      beneficiarioId,
      beneficiarioNome: await this.nomeBeneficiario(conta.beneficiarioTipo, beneficiarioId),
      status: conta.status,
      aprovacao: conta.aprovacao,
      aprovadoPorNome: (conta.aprovadoPorId && nomes.get(conta.aprovadoPorId)) || null,
      aprovadoEm: conta.aprovadoEm?.toISOString() ?? null,
      recusadoPorNome: (conta.recusadoPorId && nomes.get(conta.recusadoPorId)) || null,
      recusadoEm: conta.recusadoEm?.toISOString() ?? null,
      motivoRecusa: conta.motivoRecusa,
      valorPago: somaBaixas(conta.baixas).toString(),
      competencia: conta.competencia,
      centroCustoId: conta.centroCustoId,
      centroCustoNome: conta.centroCusto?.nome ?? null,
      documentoArquivoId: conta.documentoArquivoId,
    };
  }

  private dados(input: CreateContaPagarInput): Prisma.ContaPagarUncheckedCreateInput {
    // A confirmação do alerta de duplicidade (#163) vai para a auditoria, não para a tabela.
    const { beneficiarioTipo, beneficiarioId, dataVencimento, ...resto } = input;
    delete resto.duplicidadeConfirmada;
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
    query: Pick<
      ListContasPagarQuery,
      'search' | 'status' | 'vencimentoDe' | 'vencimentoAte' | 'aprovacao'
    >,
  ): Prisma.ContaPagarWhereInput {
    return {
      ...whereContaFinanceira<ContaPagarStatus, Prisma.ContaPagarWhereInput>(query),
      aprovacao: query.aprovacao,
    };
  }
}
