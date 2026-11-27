import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import {
  CONTA_RECEBER_BAIXA_EXCEDE_SALDO,
  CONTA_RECEBER_RENEGOCIACAO_SOMA,
  CONTA_RECEBER_ROTULO_STATUS_EXIBICAO,
  statusExibicaoContaReceber,
  type BaixarContaReceberInput,
  type ContaReceber,
  type ContaReceberBaixa,
  type ContaReceberExportColumn,
  type ContaReceberStatus,
  type CreateContaReceberInput,
  type ExportContasReceberQuery,
  type ExportReceitaProfissionaisQuery,
  type ListContasReceberQuery,
  type ListReceitaProfissionaisQuery,
  type ReceitaProfissional,
  type RenegociarContaReceberInput,
  type ResumoReceitaProfissionais,
  type ResumoReceitaProfissionaisQuery,
  type UpdateContaReceberInput,
  type UpdateReceitaProfissionalInput,
  type CancelarSemReagendamentoInput,
} from '@torres/shared';
import { Prisma } from '../../../generated/prisma/client';
import { AuditService } from '../../../common/audit/audit.service';
import type { FiltroProfissional } from '../../../common/auth/escopo-dados.service';
import { CancelamentosService } from '../../../common/cancelamentos/cancelamentos.service';
import { BusinessException } from '../../../common/errors/api.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import { ExportService, selectColumns } from '../../../common/export/export.service';
import type { ExportFile } from '../../../common/export/export.types';
import { paginate, type Page } from '../../../common/pagination/paginate';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import { ContasBancariasService } from '../contas-bancarias/contas-bancarias.service';
import {
  camposContaFinanceira,
  colunasExportContaFinanceira,
  contaNaoEncontrada,
  DO_TORRES,
  INCLUDE_CONTA_FINANCEIRA,
  NAO_EXCLUIDAS,
  orderByContaFinanceira,
  whereContaFinanceira,
} from '../conta-financeira';
import {
  orderByReceitas,
  RECEITA_PROFISSIONAL_EXPORT_DEFINITIONS,
  whereReceitaPorId,
  whereReceitas,
} from './receitas-profissionais';

const INCLUDE = {
  ...INCLUDE_CONTA_FINANCEIRA,
  paciente: { select: { nome: true } },
  contaBancaria: { select: { nome: true } },
  profissional: { select: { nome: true } },
  profissionalSacado: { select: { nome: true } },
  contratoSala: { select: { numero: true } },
  renegociadoDe: { select: { numero: true } },
  renegociacoes: {
    where: { deletedAt: null },
    select: { numero: true },
    orderBy: { numero: 'asc' },
  },
  baixas: { where: { deletedAt: null }, select: { valorRecebido: true } },
} as const;

type ContaReceberComRelacoes = Prisma.ContaReceberGetPayload<{ include: typeof INCLUDE }>;

const INCLUDE_BAIXA = {
  formaPagamento: { select: { nome: true } },
  contaBancaria: { select: { nome: true } },
} as const;

/**
 * Entrada de criação. Conta bancária e data de recebimento são opcionais para quem cria fora da
 * tela (ex.: cobrança de contrato de sala).
 */
type DadosContaReceber = Omit<
  CreateContaReceberInput,
  'contaBancariaId' | 'dataRecebimento' | 'profissionalSacadoId' | 'competencia'
> &
  Partial<
    Pick<
      CreateContaReceberInput,
      'contaBancariaId' | 'dataRecebimento' | 'profissionalSacadoId' | 'competencia'
    >
  > & {
    /** Só a tela Receita Profissionais informa (receita do profissional). */
    profissionalId?: string;
    /** Contrato de sala que originou a cobrança (issue #165). */
    contratoSalaId?: string;
  };

const hoje = () => new Date().toISOString().slice(0, 10);
const ZERO = new Prisma.Decimal(0);

function somaBaixas(baixas: readonly { valorRecebido: Prisma.Decimal }[]): Prisma.Decimal {
  return baixas.reduce((total, b) => total.add(b.valorRecebido), ZERO);
}

/** Competência `AAAA-MM` do vencimento (padrão quando o usuário não informa). */
const competenciaDoVencimento = (dataVencimento: string) => dataVencimento.slice(0, 7);

export function toContaReceber(conta: ContaReceberComRelacoes): ContaReceber {
  const recebido = somaBaixas(conta.baixas);
  const aberta = conta.status === 'PENDENTE' || conta.status === 'PARCIAL';
  return {
    ...camposContaFinanceira(conta),
    pacienteId: conta.pacienteId,
    pacienteNome: conta.paciente?.nome ?? null,
    profissionalSacadoId: conta.profissionalSacadoId,
    profissionalSacadoNome: conta.profissionalSacado?.nome ?? null,
    contratoSalaId: conta.contratoSalaId,
    contratoSalaNumero: conta.contratoSala?.numero ?? null,
    renegociadoDeId: conta.renegociadoDeId,
    renegociadoDeNumero: conta.renegociadoDe?.numero ?? null,
    renegociadoParaNumeros: conta.renegociacoes.map((n) => n.numero),
    competencia: conta.competencia,
    status: conta.status,
    valorRecebido: recebido.toFixed(2),
    saldo: (aberta ? Prisma.Decimal.max(conta.valor.sub(recebido), ZERO) : ZERO).toFixed(2),
    contaBancariaId: conta.contaBancariaId,
    contaBancariaNome: conta.contaBancaria?.nome ?? null,
    dataRecebimento: conta.dataRecebimento?.toISOString().slice(0, 10) ?? null,
  };
}

export function toContaReceberBaixa(
  baixa: Prisma.ContaReceberBaixaGetPayload<{ include: typeof INCLUDE_BAIXA }>,
): ContaReceberBaixa {
  return {
    id: baixa.id,
    contaReceberId: baixa.contaReceberId,
    dataRecebimento: baixa.dataRecebimento.toISOString().slice(0, 10),
    valorRecebido: baixa.valorRecebido.toString(),
    formaPagamentoId: baixa.formaPagamentoId,
    formaPagamentoNome: baixa.formaPagamento?.nome ?? null,
    contaBancariaId: baixa.contaBancariaId,
    contaBancariaNome: baixa.contaBancaria?.nome ?? null,
    documento: baixa.documento,
    observacoes: baixa.observacoes,
    createdAt: baixa.createdAt.toISOString(),
  };
}

export function toReceita(conta: ContaReceberComRelacoes): ReceitaProfissional {
  return {
    ...toContaReceber(conta),
    profissionalId: conta.profissionalId ?? '',
    profissionalNome: conta.profissional?.nome ?? '',
  };
}

/** Colunas exportáveis, iguais às do grid. */
export const CONTA_RECEBER_EXPORT_DEFINITIONS = colunasExportContaFinanceira<
  ContaReceber,
  ContaReceberExportColumn
>(
  {
    key: 'cliente',
    header: 'Cliente',
    value: (c) => c.pacienteNome ?? c.profissionalSacadoNome ?? '',
    width: 3,
  },
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
    private readonly cancelamentos: CancelamentosService,
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
    return toContaReceber(await this.buscarTorres(id));
  }

  /**
   * Cria a conta. Com status Pago (modal), grava a baixa total (data e conta bancária informadas;
   * sem data, a de hoje). A competência padrão é o mês do vencimento.
   */
  async create(input: DadosContaReceber): Promise<ContaReceber> {
    const { contaBancariaId, dataRecebimento, status, ...resto } = input;
    const pago = status === 'RECEBIDO';
    if (pago && contaBancariaId) await this.contasBancarias.garantirExiste(contaBancariaId);
    const conta = await this.txHost.tx.contaReceber.create({
      data: {
        ...resto,
        status: pago ? 'PENDENTE' : status,
        dataVencimento: new Date(resto.dataVencimento),
        competencia: resto.competencia ?? competenciaDoVencimento(resto.dataVencimento),
      },
      include: INCLUDE,
    });
    if (!pago) return toContaReceber(conta);
    return this.registrarBaixa(conta.id, {
      dataRecebimento: dataRecebimento ?? hoje(),
      valorRecebido: conta.valor,
      formaPagamentoId: conta.formaPagamentoId,
      contaBancariaId: contaBancariaId ?? null,
    });
  }

  /**
   * Cancela uma conta pendente (issue #162): o motivo da lista é obrigatório e o histórico guarda
   * quem, quando e por quê. Conta já recebida não se cancela: estorne o recebimento antes.
   */
  async cancelar(id: string, input: CancelarSemReagendamentoInput): Promise<ContaReceber> {
    const atual = await this.findById(id);
    if (atual.status !== 'PENDENTE') {
      throw new BusinessException(
        'CONTA_RECEBER_NAO_PENDENTE',
        'Só é possível cancelar uma conta a receber pendente.',
        { status: 409 },
      );
    }
    await this.cancelamentos.registrar({
      tipo: 'COBRANCA',
      entidade: 'ContaReceber',
      entidadeId: id,
      motivoId: input.motivoId,
      observacao: input.observacao,
    });
    return this.atualizar(id, { status: 'CANCELADO' });
  }

  async update(id: string, input: UpdateContaReceberInput): Promise<ContaReceber> {
    const atual = await this.buscarTorres(id);
    if (atual.status === 'RENEGOCIADO') {
      throw new BusinessException(
        ErrorCode.BUSINESS_RULE,
        'Um título renegociado não pode ser alterado.',
      );
    }
    const { contaBancariaId, dataRecebimento, status, ...resto } = input;
    const recebido = somaBaixas(atual.baixas);
    if (new Prisma.Decimal(resto.valor).lessThan(recebido)) {
      throw new BusinessException(
        ErrorCode.BUSINESS_RULE,
        'O valor não pode ser menor que o já recebido.',
      );
    }
    if (status === 'CANCELADO' && recebido.greaterThan(ZERO)) {
      throw new BusinessException(
        ErrorCode.BUSINESS_RULE,
        'Cancele as baixas antes de cancelar a conta.',
      );
    }
    if (status === 'RECEBIDO' && contaBancariaId) {
      await this.contasBancarias.garantirExiste(contaBancariaId);
    }
    // Reabrir um título pago pelo modal desfaz as baixas (o histórico fica, com exclusão lógica).
    if (status === 'PENDENTE' && atual.status === 'RECEBIDO') await this.excluirBaixas(id);

    await this.txHost.tx.contaReceber.update({
      where: { id },
      data: {
        ...resto,
        dataVencimento: new Date(resto.dataVencimento),
        competencia: resto.competencia ?? competenciaDoVencimento(resto.dataVencimento),
        // Sair de Cancelado pelo modal reabre a conta; o status final vem das baixas.
        status:
          status === 'CANCELADO'
            ? 'CANCELADO'
            : atual.status === 'CANCELADO'
              ? 'PENDENTE'
              : atual.status,
      },
    });
    if (status === 'CANCELADO') return this.findById(id);

    const saldo = new Prisma.Decimal(resto.valor).sub(
      status === 'PENDENTE' && atual.status === 'RECEBIDO' ? ZERO : recebido,
    );
    if (status === 'RECEBIDO' && saldo.greaterThan(ZERO)) {
      return this.registrarBaixa(id, {
        dataRecebimento: dataRecebimento ?? hoje(),
        valorRecebido: saldo,
        formaPagamentoId: resto.formaPagamentoId,
        contaBancariaId: contaBancariaId ?? null,
      });
    }
    if (status === 'RECEBIDO' && (contaBancariaId || dataRecebimento)) {
      await this.corrigirUltimaBaixa(id, dataRecebimento, contaBancariaId);
    }
    return this.recalcular(id);
  }

  /** Exclusão lógica: histórico financeiro. Título renegociado fica, para o rastreio. */
  async remove(id: string): Promise<ContaReceber> {
    const atual = await this.buscarTorres(id);
    if (atual.status === 'RENEGOCIADO') {
      throw new BusinessException(
        ErrorCode.BUSINESS_RULE,
        'Um título renegociado não pode ser excluído.',
      );
    }
    return this.atualizar(id, { deletedAt: new Date() });
  }

  async listBaixas(id: string): Promise<ContaReceberBaixa[]> {
    await this.buscarTorres(id);
    const baixas = await this.txHost.tx.contaReceberBaixa.findMany({
      where: { contaReceberId: id, deletedAt: null },
      include: INCLUDE_BAIXA,
      orderBy: { createdAt: 'desc' },
    });
    return baixas.map(toContaReceberBaixa);
  }

  /**
   * Modal "Baixar Conta a Receber": recebimento total ou parcial, até o saldo em aberto. A conta
   * vira Parcial enquanto houver saldo e Pago quando a soma das baixas atinge o valor.
   */
  async baixar(id: string, input: BaixarContaReceberInput): Promise<ContaReceber> {
    const conta = await this.buscarTorres(id);
    this.exigirAberta(conta, 'baixar');
    const saldo = conta.valor.sub(somaBaixas(conta.baixas));
    if (new Prisma.Decimal(input.valorRecebido).greaterThan(saldo)) {
      throw new BusinessException(
        CONTA_RECEBER_BAIXA_EXCEDE_SALDO,
        'O valor recebido é maior que o saldo em aberto.',
      );
    }
    if (input.formaPagamentoId) await this.garantirFormaPagamento(input.formaPagamentoId);
    if (input.contaBancariaId) await this.contasBancarias.garantirExiste(input.contaBancariaId);
    return this.registrarBaixa(id, input);
  }

  /** "Cancelar baixa": exclusão lógica da baixa mais recente e recálculo do status. */
  async cancelarBaixa(id: string): Promise<ContaReceber> {
    const conta = await this.buscarTorres(id);
    if (conta.status === 'CANCELADO' || conta.status === 'RENEGOCIADO') {
      throw new BusinessException(
        ErrorCode.BUSINESS_RULE,
        'Não é possível cancelar baixa de uma conta cancelada ou renegociada.',
      );
    }
    const ultima = await this.ultimaBaixa(id);
    if (!ultima) {
      throw new BusinessException(
        ErrorCode.BUSINESS_RULE,
        'Esta conta não tem baixa para cancelar.',
      );
    }
    await this.txHost.tx.contaReceberBaixa.update({
      where: { id: ultima.id },
      data: { deletedAt: new Date() },
    });
    return this.recalcular(id);
  }

  /**
   * Renegociação: o saldo em aberto vira um ou mais títulos novos (a soma das parcelas fecha com o
   * saldo) ligados ao original, que passa a Renegociado e continua rastreável. Só conta A vencer,
   * Vencida ou Parcial pode ser renegociada. Os títulos novos são auditados aqui; o original, pelo
   * `@Audit` do endpoint.
   */
  async renegociar(id: string, input: RenegociarContaReceberInput): Promise<ContaReceber> {
    const conta = await this.buscarTorres(id);
    this.exigirAberta(conta, 'renegociar');
    const saldo = conta.valor.sub(somaBaixas(conta.baixas));
    const soma = input.parcelas.reduce((total, p) => total.add(p.valor), ZERO);
    if (!soma.equals(saldo)) {
      throw new BusinessException(
        CONTA_RECEBER_RENEGOCIACAO_SOMA,
        'A soma das parcelas deve ser igual ao saldo em aberto.',
      );
    }
    const total = input.parcelas.length;
    for (const [indice, parcela] of input.parcelas.entries()) {
      const nova = await this.txHost.tx.contaReceber.create({
        data: {
          descricao: `${conta.descricao} (renegociação ${indice + 1}/${total})`,
          pacienteId: conta.pacienteId,
          profissionalSacadoId: conta.profissionalSacadoId,
          contratoSalaId: conta.contratoSalaId,
          renegociadoDeId: conta.id,
          competencia: conta.competencia,
          valor: parcela.valor,
          dataVencimento: new Date(parcela.dataVencimento),
          formaPagamentoId: conta.formaPagamentoId,
          planoContaId: conta.planoContaId,
          documento: conta.documento,
          observacoes: input.observacoes ?? conta.observacoes,
        },
        include: INCLUDE,
      });
      await this.audit.record({
        action: 'CREATE',
        entity: 'ContaReceber',
        entityId: nova.id,
        before: null,
        after: toContaReceber(nova),
      });
    }
    return this.atualizar(id, { status: 'RENEGOCIADO' });
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

  /** Receitas dos profissionais (tela Receita Profissionais); `profissional` é o escopo do usuário. */
  async listarReceitas(
    query: ListReceitaProfissionaisQuery,
    profissional: FiltroProfissional,
  ): Promise<Page<ReceitaProfissional>> {
    const where = whereReceitas(query, profissional);
    const orderBy = orderByReceitas(query.sort);
    const page = await paginate(query, {
      findMany: (p) =>
        this.txHost.tx.contaReceber.findMany({ where, orderBy, include: INCLUDE, ...p }),
      count: () => this.txHost.tx.contaReceber.count({ where }),
    });
    return { ...page, data: page.data.map(toReceita) };
  }

  /** Cards de totais e "Resumo por Profissional", sobre todas as páginas da consulta filtrada. */
  async resumirReceitas(
    query: ResumoReceitaProfissionaisQuery,
    profissional: FiltroProfissional,
  ): Promise<ResumoReceitaProfissionais> {
    const where = whereReceitas(query, profissional);
    const [grupos, nomes] = await Promise.all([
      this.txHost.tx.contaReceber.groupBy({
        by: ['profissionalId', 'status'],
        where,
        _sum: { valor: true },
        _count: { _all: true },
      }),
      this.txHost.tx.contaReceber.findMany({
        where,
        distinct: ['profissionalId'],
        select: { profissionalId: true, profissional: { select: { nome: true } } },
      }),
    ]);
    const zero = new Prisma.Decimal(0);
    const somar = (status: ContaReceberStatus) =>
      grupos
        .filter((g) => g.status === status)
        .reduce((total, g) => total.add(g._sum.valor ?? zero), zero);
    const porProfissional = nomes
      .map(({ profissionalId, profissional: dono }) => {
        const meus = grupos.filter((g) => g.profissionalId === profissionalId);
        return {
          profissionalId: profissionalId ?? '',
          profissionalNome: dono?.nome ?? '',
          totalRecebido: meus
            .filter((g) => g.status === 'RECEBIDO')
            .reduce((total, g) => total.add(g._sum.valor ?? zero), zero)
            .toFixed(2),
          registros: meus.reduce((total, g) => total + g._count._all, 0),
        };
      })
      .sort((a, b) => a.profissionalNome.localeCompare(b.profissionalNome, 'pt-BR'));
    return {
      totalRecebido: somar('RECEBIDO').toFixed(2),
      totalPendente: somar('PENDENTE').toFixed(2),
      registros: grupos.reduce((total, g) => total + g._count._all, 0),
      porProfissional,
    };
  }

  async exportarReceitas(
    query: ExportReceitaProfissionaisQuery,
    profissional: FiltroProfissional,
  ): Promise<ExportFile> {
    const where = whereReceitas(query, profissional);
    this.exportService.ensureWithinLimit(await this.txHost.tx.contaReceber.count({ where }));
    const rows = await this.txHost.tx.contaReceber.findMany({
      where,
      orderBy: orderByReceitas(query.sort),
      include: INCLUDE,
    });
    return this.exportService.export({
      format: query.format,
      title: 'Receita Profissionais',
      filename: 'receita-profissionais',
      columns: selectColumns(RECEITA_PROFISSIONAL_EXPORT_DEFINITIONS, query.columns),
      rows: rows.map(toReceita),
    });
  }

  /** Receita de um profissional (404 se a conta não existe ou não é de profissional). */
  async buscarReceita(id: string): Promise<ReceitaProfissional> {
    const conta = await this.txHost.tx.contaReceber.findFirst({
      where: whereReceitaPorId(id),
      include: INCLUDE,
    });
    if (!conta) throw contaNaoEncontrada('Receita não encontrada');
    return toReceita(conta);
  }

  async atualizarReceita(
    id: string,
    input: UpdateReceitaProfissionalInput,
  ): Promise<ReceitaProfissional> {
    const atual = await this.buscarReceita(id);
    const conta = await this.gravar(id, await this.dados(input, atual.dataRecebimento));
    return toReceita(conta);
  }

  /** Volta uma receita recebida para Pendente, limpando conta bancária e data do recebimento. */
  async estornarBaixaReceita(id: string): Promise<ReceitaProfissional> {
    const atual = await this.buscarReceita(id);
    if (atual.status !== 'RECEBIDO') {
      throw new BusinessException(
        'RECEITA_NAO_RECEBIDA',
        'Só é possível estornar a baixa de uma receita recebida',
      );
    }
    const conta = await this.gravar(id, {
      status: 'PENDENTE',
      contaBancariaId: null,
      dataRecebimento: null,
    });
    return toReceita(conta);
  }

  /** Exclusão lógica: histórico financeiro. */
  async removerReceita(id: string): Promise<ReceitaProfissional> {
    await this.buscarReceita(id);
    return toReceita(await this.gravar(id, { deletedAt: new Date() }));
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
      await this.cancelamentos.registrarContratoCancelado('ContaReceber', conta.id);
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

  private async buscarTorres(id: string): Promise<ContaReceberComRelacoes> {
    const conta = await this.txHost.tx.contaReceber.findFirst({
      where: { id, ...DO_TORRES },
      include: INCLUDE,
    });
    if (!conta) throw contaNaoEncontrada('Conta a receber não encontrada');
    return conta;
  }

  /** Baixar e renegociar só valem para conta A vencer, Vencida ou Parcial. */
  private exigirAberta(conta: ContaReceberComRelacoes, acao: 'baixar' | 'renegociar'): void {
    const motivos: Partial<Record<ContaReceberStatus, string>> = {
      RECEBIDO: 'já está paga',
      CANCELADO: 'está cancelada',
      RENEGOCIADO: 'já foi renegociada',
    };
    const motivo = motivos[conta.status];
    if (motivo) {
      throw new BusinessException(
        ErrorCode.BUSINESS_RULE,
        `Não é possível ${acao}: a conta ${motivo}.`,
      );
    }
  }

  private async garantirFormaPagamento(id: string): Promise<void> {
    const existe = await this.txHost.tx.formaPagamento.findFirst({
      where: { id, deletedAt: null },
      select: { id: true },
    });
    if (!existe) throw contaNaoEncontrada('Forma de pagamento não encontrada');
  }

  private ultimaBaixa(id: string) {
    return this.txHost.tx.contaReceberBaixa.findFirst({
      where: { contaReceberId: id, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async registrarBaixa(
    id: string,
    baixa: {
      dataRecebimento: string;
      valorRecebido: number | Prisma.Decimal;
      formaPagamentoId?: string | null;
      contaBancariaId?: string | null;
      documento?: string | null;
      observacoes?: string | null;
    },
  ): Promise<ContaReceber> {
    await this.txHost.tx.contaReceberBaixa.create({
      data: {
        contaReceberId: id,
        dataRecebimento: new Date(baixa.dataRecebimento),
        valorRecebido: baixa.valorRecebido,
        formaPagamentoId: baixa.formaPagamentoId ?? null,
        contaBancariaId: baixa.contaBancariaId ?? null,
        documento: baixa.documento ?? null,
        observacoes: baixa.observacoes ?? null,
      },
    });
    return this.recalcular(id);
  }

  private async excluirBaixas(id: string): Promise<void> {
    await this.txHost.tx.contaReceberBaixa.updateMany({
      where: { contaReceberId: id, deletedAt: null },
      data: { deletedAt: new Date() },
    });
  }

  private async corrigirUltimaBaixa(
    id: string,
    dataRecebimento: string | null | undefined,
    contaBancariaId: string | null | undefined,
  ): Promise<void> {
    const ultima = await this.ultimaBaixa(id);
    if (!ultima) return;
    await this.txHost.tx.contaReceberBaixa.update({
      where: { id: ultima.id },
      data: {
        ...(dataRecebimento && { dataRecebimento: new Date(dataRecebimento) }),
        ...(contaBancariaId && { contaBancariaId }),
      },
    });
  }

  /**
   * Recalcula o status pela soma das baixas (Pago, Parcial ou A vencer) e guarda na conta a data
   * e a conta bancária da baixa mais recente. Conta cancelada ou renegociada não muda.
   */
  private async recalcular(id: string): Promise<ContaReceber> {
    const conta = await this.buscarTorres(id);
    if (conta.status === 'CANCELADO' || conta.status === 'RENEGOCIADO') {
      return toContaReceber(conta);
    }
    const recebido = somaBaixas(conta.baixas);
    let status: ContaReceberStatus = 'PENDENTE';
    if (recebido.greaterThanOrEqualTo(conta.valor)) status = 'RECEBIDO';
    else if (recebido.greaterThan(ZERO)) status = 'PARCIAL';
    const ultima = await this.ultimaBaixa(id);
    return this.atualizar(id, {
      status,
      contaBancariaId: ultima?.contaBancariaId ?? null,
      dataRecebimento: ultima?.dataRecebimento ?? null,
    });
  }

  private async atualizar(
    id: string,
    data: Prisma.ContaReceberUncheckedUpdateInput,
  ): Promise<ContaReceber> {
    return toContaReceber(await this.gravar(id, data));
  }

  private gravar(
    id: string,
    data: Prisma.ContaReceberUncheckedUpdateInput,
  ): Promise<ContaReceberComRelacoes> {
    return this.txHost.tx.contaReceber.update({ where: { id }, data, include: INCLUDE });
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
    const { status } = query;
    const base = {
      ...whereContaFinanceira<ContaReceberStatus, Prisma.ContaReceberWhereInput>(
        { ...query, status: undefined },
        [
          { paciente: { nome: { contains: query.search, mode: 'insensitive' } } },
          { profissionalSacado: { nome: { contains: query.search, mode: 'insensitive' } } },
        ],
      ),
      ...DO_TORRES,
    };
    if (!status) return base;
    if (status !== 'A_VENCER' && status !== 'VENCIDO') return { ...base, status };
    // "A vencer" e "Vencido" dividem as contas Pendentes pelo dia de hoje.
    const inicioDoDia = new Date(`${hoje()}T00:00:00.000Z`);
    return {
      ...base,
      status: 'PENDENTE',
      AND: [{ dataVencimento: status === 'VENCIDO' ? { lt: inicioDoDia } : { gte: inicioDoDia } }],
    };
  }
}
