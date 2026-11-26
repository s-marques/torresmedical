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
  type ExportReceitaProfissionaisQuery,
  type ListContasReceberQuery,
  type ListReceitaProfissionaisQuery,
  type ReceitaProfissional,
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
} as const;

type ContaReceberComRelacoes = Prisma.ContaReceberGetPayload<{ include: typeof INCLUDE }>;

/**
 * Entrada de criação. Conta bancária e data de recebimento são opcionais para quem cria fora da
 * tela (ex.: cobrança de contrato de sala).
 */
type DadosContaReceber = Omit<CreateContaReceberInput, 'contaBancariaId' | 'dataRecebimento'> &
  Partial<Pick<CreateContaReceberInput, 'contaBancariaId' | 'dataRecebimento'>> & {
    /** Só a tela Receita Profissionais informa (receita do profissional). */
    profissionalId?: string;
  };

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
    const conta = await this.txHost.tx.contaReceber.findFirst({
      where: { id, ...DO_TORRES },
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
    return {
      ...whereContaFinanceira<ContaReceberStatus, Prisma.ContaReceberWhereInput>(query, [
        { paciente: { nome: { contains: query.search, mode: 'insensitive' } } },
      ]),
      ...DO_TORRES,
    };
  }
}
