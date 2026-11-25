import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import type {
  ContaPagarDivergencia,
  ContaPagarDivergenciaExportColumn,
  ExportDivergenciasContaPagarQuery,
  ListDivergenciasContaPagarQuery,
} from '@torres/shared';
import type { Prisma } from '../../../generated/prisma/client';
import { ExportService, selectColumns } from '../../../common/export/export.service';
import type { ExportColumn, ExportFile } from '../../../common/export/export.types';
import { paginate, type Page } from '../../../common/pagination/paginate';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import { FornecedoresService } from '../../compras-estoque/fornecedores/fornecedores.service';
import { FuncionariosService } from '../../regulatorio-qualidade/funcionarios/funcionarios.service';
import { nomeBeneficiario } from './nome-beneficiario';

const INCLUDE = {
  contaPagar: {
    select: {
      numero: true,
      descricao: true,
      valor: true,
      beneficiarioTipo: true,
      fornecedorId: true,
      funcionarioId: true,
      deletedAt: true,
    },
  },
} as const;

type BaixaComConta = Prisma.ContaPagarBaixaGetPayload<{ include: typeof INCLUDE }>;

/** Colunas exportáveis, iguais às do grid de divergências. */
export const CONTA_PAGAR_DIVERGENCIA_EXPORT_DEFINITIONS: readonly ExportColumn<
  ContaPagarDivergencia,
  ContaPagarDivergenciaExportColumn
>[] = [
  { key: 'numero', header: '#', type: 'number', value: (d) => d.numero },
  { key: 'descricao', header: 'Descrição', value: (d) => d.descricao, width: 3 },
  {
    key: 'beneficiario',
    header: 'Fornecedor / Funcionário',
    value: (d) => d.beneficiarioNome ?? '',
    width: 3,
  },
  { key: 'valor', header: 'Valor do título', type: 'currency', value: (d) => d.valor },
  { key: 'valorPago', header: 'Valor pago', type: 'currency', value: (d) => d.valorPago },
  { key: 'divergencia', header: 'Divergência', type: 'currency', value: (d) => d.divergencia },
  { key: 'justificativa', header: 'Justificativa', value: (d) => d.justificativa ?? '', width: 3 },
  {
    key: 'dataPagamento',
    header: 'Data do pagamento',
    type: 'date',
    value: (d) => d.dataPagamento,
  },
];

/** Relatório de divergências: baixas com valor pago diferente do saldo do título (issue #163). */
@Injectable()
export class ContasPagarDivergenciasService {
  constructor(
    private readonly txHost: TransactionHost<PrismaAdapter>,
    private readonly exportService: ExportService,
    private readonly fornecedores: FornecedoresService,
    private readonly funcionarios: FuncionariosService,
  ) {}

  async list(query: ListDivergenciasContaPagarQuery): Promise<Page<ContaPagarDivergencia>> {
    const where = this.where(query);
    const orderBy = this.orderBy(query.sort);
    const page = await paginate(query, {
      findMany: (p) =>
        this.txHost.tx.contaPagarBaixa.findMany({ where, orderBy, include: INCLUDE, ...p }),
      count: () => this.txHost.tx.contaPagarBaixa.count({ where }),
    });
    const data = await Promise.all(page.data.map((b) => this.toDivergencia(b)));
    return { ...page, data };
  }

  async export(query: ExportDivergenciasContaPagarQuery): Promise<ExportFile> {
    const where = this.where(query);
    this.exportService.ensureWithinLimit(await this.txHost.tx.contaPagarBaixa.count({ where }));
    const linhas = await this.txHost.tx.contaPagarBaixa.findMany({
      where,
      orderBy: this.orderBy(query.sort),
      include: INCLUDE,
    });
    const rows = await Promise.all(linhas.map((b) => this.toDivergencia(b)));
    return this.exportService.export({
      format: query.format,
      title: 'Divergências de Contas a Pagar',
      filename: 'contas-pagar-divergencias',
      columns: selectColumns(CONTA_PAGAR_DIVERGENCIA_EXPORT_DEFINITIONS, query.columns),
      rows,
    });
  }

  private async toDivergencia(baixa: BaixaComConta): Promise<ContaPagarDivergencia> {
    const { contaPagar: conta } = baixa;
    return {
      baixaId: baixa.id,
      contaPagarId: baixa.contaPagarId,
      numero: conta.numero,
      descricao: conta.descricao,
      beneficiarioNome: await nomeBeneficiario(
        this.fornecedores,
        this.funcionarios,
        conta.beneficiarioTipo,
        conta.fornecedorId ?? conta.funcionarioId,
      ),
      valor: conta.valor.toString(),
      valorPago: baixa.valorPago.toString(),
      divergencia: (baixa.divergencia ?? 0).toString(),
      justificativa: baixa.justificativaDivergencia,
      dataPagamento: baixa.dataPagamento.toISOString().slice(0, 10),
    };
  }

  private where(
    query: Pick<ListDivergenciasContaPagarQuery, 'pagamentoDe' | 'pagamentoAte'>,
  ): Prisma.ContaPagarBaixaWhereInput {
    return {
      deletedAt: null,
      divergencia: { not: null },
      contaPagar: { deletedAt: null },
      dataPagamento: {
        gte: query.pagamentoDe ? new Date(query.pagamentoDe) : undefined,
        lte: query.pagamentoAte ? new Date(query.pagamentoAte) : undefined,
      },
    };
  }

  private orderBy(
    sort: ListDivergenciasContaPagarQuery['sort'],
  ): Prisma.ContaPagarBaixaOrderByWithRelationInput[] {
    return [{ [sort.field]: sort.direction }, { id: sort.direction }];
  }
}
