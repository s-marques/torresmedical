import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import {
  FORMA_PAGAMENTO_ROTULO_FINALIDADE,
  FORMA_PAGAMENTO_ROTULO_TIPO,
  type CreateFormaPagamentoInput,
  type ExportFormasPagamentoQuery,
  type FinalidadePagamento,
  type FormaPagamentoExportColumn,
  type FormaPagamentoTipo,
  type ListFormasPagamentoQuery,
  type LookupItem,
  type LookupQuery,
  type UpdateFormaPagamentoInput,
} from '@torres/shared';
import type {
  FinalidadePagamento as FinalidadePagamentoPrisma,
  FormaPagamento,
  Prisma,
  TipoFormaPagamento,
} from '../../../generated/prisma/client';
import { ExportService, selectColumns } from '../../../common/export/export.service';
import type { ExportColumn, ExportFile } from '../../../common/export/export.types';
import {
  EntidadeLookupService,
  SELECIONAVEIS,
  type FonteLookup,
} from '../../../common/lookups/lookup-query';
import { paginate, searchWhere, toOrderBy, type Page } from '../../../common/pagination/paginate';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';

const FINALIDADE: Readonly<Record<FinalidadePagamento, FinalidadePagamentoPrisma>> = {
  receber: 'RECEBER',
  pagar: 'PAGAR',
};

const TIPO: Readonly<Record<FormaPagamentoTipo, TipoFormaPagamento>> = {
  dinheiro: 'DINHEIRO',
  pix: 'PIX',
  boleto: 'BOLETO',
  cartao_credito: 'CARTAO_CREDITO',
  cartao_debito: 'CARTAO_DEBITO',
  convenio: 'CONVENIO',
  cortesia: 'CORTESIA',
  permuta: 'PERMUTA',
  pagamento: 'PAGAMENTO',
};

const NAO_EXCLUIDAS = { deletedAt: null } as const;

const TIPOS_CARTAO: readonly TipoFormaPagamento[] = ['CARTAO_CREDITO', 'CARTAO_DEBITO'];

/** Colunas exportáveis, iguais às do grid. */
export const FORMA_PAGAMENTO_EXPORT_DEFINITIONS: readonly ExportColumn<
  FormaPagamento,
  FormaPagamentoExportColumn
>[] = [
  { key: 'nome', header: 'Nome', value: (f) => f.nome, width: 3 },
  {
    key: 'finalidade',
    header: 'Finalidade',
    value: (f) => FORMA_PAGAMENTO_ROTULO_FINALIDADE[f.finalidade],
  },
  { key: 'tipo', header: 'Tipo', value: (f) => FORMA_PAGAMENTO_ROTULO_TIPO[f.tipo] },
  {
    key: 'prazoRecebimentoDias',
    header: 'Prazo (dias)',
    type: 'number',
    value: (f) => f.prazoRecebimentoDias,
  },
  { key: 'maxParcelas', header: 'Max. Parcelas', type: 'number', value: (f) => f.maxParcelas },
  { key: 'ativo', header: 'Status', value: (f) => (f.ativo ? 'Ativo' : 'Inativo') },
];

/** Forma de pagamento do Financeiro (Vendas, Caixas, Contas, Receita Profissionais). */
@Injectable()
export class FormasPagamentoService extends EntidadeLookupService<
  LookupQuery<'formas-pagamento'>,
  Prisma.FormaPagamentoWhereInput,
  FormaPagamento
> {
  protected readonly naoEncontrado = 'Forma de pagamento não encontrada';
  protected readonly fonte: FonteLookup<Prisma.FormaPagamentoWhereInput, FormaPagamento> = {
    findMany: (args) => this.txHost.tx.formaPagamento.findMany(args),
    count: (args) => this.txHost.tx.formaPagamento.count(args),
    findFirst: (args) => this.txHost.tx.formaPagamento.findFirst(args),
  };

  constructor(
    private readonly txHost: TransactionHost<PrismaAdapter>,
    private readonly exportService: ExportService,
  ) {
    super();
  }

  list(query: ListFormasPagamentoQuery): Promise<Page<FormaPagamento>> {
    const where = this.where(query);
    const orderBy = toOrderBy(query.sort);
    return paginate(query, {
      findMany: (page) => this.txHost.tx.formaPagamento.findMany({ where, orderBy, ...page }),
      count: () => this.txHost.tx.formaPagamento.count({ where }),
    });
  }

  create(input: CreateFormaPagamentoInput): Promise<FormaPagamento> {
    return this.txHost.tx.formaPagamento.create({
      data: { ...input, finalidade: FINALIDADE[input.finalidade], tipo: TIPO[input.tipo] },
    });
  }

  /** Também serve ao botão Ativar/Desativar da linha (`{ ativo }`). */
  async update(id: string, input: UpdateFormaPagamentoInput): Promise<FormaPagamento> {
    await this.findById(id);
    return this.txHost.tx.formaPagamento.update({ where: { id }, data: this.dados(input) });
  }

  /** Exclusão lógica: a forma pode estar em vendas e contas já lançadas. */
  async remove(id: string): Promise<FormaPagamento> {
    await this.findById(id);
    return this.txHost.tx.formaPagamento.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  async export(query: ExportFormasPagamentoQuery): Promise<ExportFile> {
    const where = this.where(query);
    this.exportService.ensureWithinLimit(await this.txHost.tx.formaPagamento.count({ where }));
    const rows = await this.txHost.tx.formaPagamento.findMany({
      where,
      orderBy: toOrderBy(query.sort),
    });
    return this.exportService.export({
      format: query.format,
      title: 'Formas de Pagamento',
      filename: 'formas-pagamento',
      columns: selectColumns(FORMA_PAGAMENTO_EXPORT_DEFINITIONS, query.columns),
      rows,
    });
  }

  private where(
    query: Pick<ListFormasPagamentoQuery, 'search' | 'status' | 'finalidade' | 'tipo'>,
  ): Prisma.FormaPagamentoWhereInput {
    return {
      ...NAO_EXCLUIDAS,
      ativo: query.status ? query.status === 'ativo' : undefined,
      finalidade: query.finalidade ? FINALIDADE[query.finalidade] : undefined,
      tipo: query.tipo ? TIPO[query.tipo] : undefined,
      ...searchWhere(query.search, ['nome']),
    };
  }

  private dados(input: UpdateFormaPagamentoInput): Prisma.FormaPagamentoUncheckedUpdateInput {
    const { finalidade, tipo, ...resto } = input;
    return {
      ...resto,
      finalidade: finalidade ? FINALIDADE[finalidade] : undefined,
      tipo: tipo ? TIPO[tipo] : undefined,
    };
  }

  /**
   * Formas de recebimento sem cartão, em ordem alfabética (aba Pagamento do Atendimento Médico,
   * #38): o cartão se lança pela Agenda, que tem bandeira, NSU e parcelas.
   */
  async paraRecebimentoSemCartao(): Promise<LookupItem[]> {
    const formas = await this.txHost.tx.formaPagamento.findMany({
      where: { ...SELECIONAVEIS, finalidade: 'RECEBER', tipo: { notIn: [...TIPOS_CARTAO] } },
      orderBy: [{ nome: 'asc' }, { id: 'asc' }],
    });
    return formas.map((forma) => this.toItem(forma));
  }

  /** A forma é de cartão (crédito ou débito)? 404 se não existir. */
  async ehCartao(id: string): Promise<boolean> {
    return TIPOS_CARTAO.includes((await this.findById(id)).tipo);
  }

  protected filtro(query: LookupQuery<'formas-pagamento'>): Prisma.FormaPagamentoWhereInput {
    return {
      ...SELECIONAVEIS,
      finalidade: query.finalidade ? FINALIDADE[query.finalidade] : undefined,
      ...searchWhere(query.search, ['nome']),
    };
  }

  protected toItem(forma: FormaPagamento): LookupItem {
    return {
      id: forma.id,
      label: forma.nome,
      descricao: FORMA_PAGAMENTO_ROTULO_FINALIDADE[forma.finalidade],
    };
  }
}
