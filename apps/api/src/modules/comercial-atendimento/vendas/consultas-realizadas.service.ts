import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import {
  CONSULTA_SEM_COBRANCA,
  intervaloDoPeriodo,
  type ConsultaExportColumn,
  type ConsultaRealizada,
  type ExportConsultasRealizadasQuery,
  type ListConsultasRealizadasQuery,
  type TotaisConsultasRealizadas,
  type TotaisConsultasRealizadasQuery,
} from '@torres/shared';
import type { Prisma } from '../../../generated/prisma/client';
import { ExportService, selectColumns } from '../../../common/export/export.service';
import type { ExportColumn, ExportFile } from '../../../common/export/export.types';
import { paginate, type Page } from '../../../common/pagination/paginate';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';

const INCLUDE = {
  paciente: { select: { nome: true, celular: true, telefone: true } },
  profissional: { select: { nome: true } },
  tipoAgendamento: { select: { nome: true } },
  formaPagamento: { select: { nome: true } },
} satisfies Prisma.AgendamentoInclude;
type AgendamentoCompleto = Prisma.AgendamentoGetPayload<{ include: typeof INCLUDE }>;

type Filtros = Pick<ListConsultasRealizadasQuery, 'de' | 'ate' | 'pagamento'>;

export function toConsultaRealizada(a: AgendamentoCompleto): ConsultaRealizada {
  return {
    id: a.id,
    data: a.inicio.toISOString(),
    pacienteId: a.pacienteId,
    paciente: a.paciente.nome,
    pacienteTelefone: a.paciente.celular ?? a.paciente.telefone,
    profissional: a.profissional.nome,
    tipo: a.tipoAgendamento?.nome ?? null,
    valor: (a.valor ?? 0).toString(),
    pago: a.pagoEm !== null,
    formaPagamento: a.formaPagamento?.nome ?? null,
  };
}

/** Texto da coluna Pagamento: "Pago (Voucher)" ou "Sem cobrança". */
export function rotuloPagamento(c: Pick<ConsultaRealizada, 'pago' | 'formaPagamento'>): string {
  if (!c.pago) return CONSULTA_SEM_COBRANCA;
  return c.formaPagamento ? `Pago (${c.formaPagamento})` : 'Pago';
}

/** Colunas exportáveis, iguais às do grid. */
export const CONSULTA_EXPORT_DEFINITIONS: readonly ExportColumn<
  ConsultaRealizada,
  ConsultaExportColumn
>[] = [
  { key: 'data', header: 'Data', type: 'datetime', value: (c) => c.data },
  { key: 'paciente', header: 'Paciente', value: (c) => c.paciente, width: 3 },
  { key: 'profissional', header: 'Profissional', value: (c) => c.profissional, width: 3 },
  { key: 'tipo', header: 'Tipo', value: (c) => c.tipo ?? '-' },
  { key: 'valor', header: 'Valor', type: 'currency', value: (c) => c.valor },
  { key: 'pagamento', header: 'Pagamento', value: rotuloPagamento },
];

/**
 * Aba "Consultas Realizadas" da tela Vendas/PDV: agendamentos atendidos no período, com o estado
 * do recebimento. O fluxo "Receber"/NFSe fica para depois da confirmação da QA (issue #15).
 */
@Injectable()
export class ConsultasRealizadasService {
  constructor(
    private readonly txHost: TransactionHost<PrismaAdapter>,
    private readonly exportService: ExportService,
  ) {}

  async list(query: ListConsultasRealizadasQuery): Promise<Page<ConsultaRealizada>> {
    const where = this.where(query);
    const orderBy = this.orderBy(query.sort);
    const page = await paginate(query, {
      findMany: (p) =>
        this.txHost.tx.agendamento.findMany({ where, orderBy, include: INCLUDE, ...p }),
      count: () => this.txHost.tx.agendamento.count({ where }),
    });
    return { ...page, data: page.data.map(toConsultaRealizada) };
  }

  /** Cards Total Consultas / Valor Total / Recebido, com o mesmo período e filtro da listagem. */
  async totais(query: TotaisConsultasRealizadasQuery): Promise<TotaisConsultasRealizadas> {
    const where = this.where(query);
    const [geral, recebido] = await Promise.all([
      this.txHost.tx.agendamento.aggregate({
        where,
        _count: { _all: true },
        _sum: { valor: true },
      }),
      this.txHost.tx.agendamento.aggregate({
        // AND, não spread: com o filtro Pendente o Recebido precisa dar zero.
        where: { AND: [where, { pagoEm: { not: null } }] },
        _sum: { valor: true },
      }),
    ]);
    return {
      totalConsultas: geral._count._all,
      valorTotal: (geral._sum.valor ?? 0).toString(),
      recebido: (recebido._sum.valor ?? 0).toString(),
    };
  }

  async export(query: ExportConsultasRealizadasQuery): Promise<ExportFile> {
    const where = this.where(query);
    this.exportService.ensureWithinLimit(await this.txHost.tx.agendamento.count({ where }));
    const rows = await this.txHost.tx.agendamento.findMany({
      where,
      orderBy: this.orderBy(query.sort),
      include: INCLUDE,
    });
    return this.exportService.export({
      format: query.format,
      title: 'Consultas Realizadas',
      filename: 'consultas-realizadas',
      columns: selectColumns(CONSULTA_EXPORT_DEFINITIONS, query.columns),
      rows: rows.map(toConsultaRealizada),
    });
  }

  private where(filtros: Filtros): Prisma.AgendamentoWhereInput {
    const { inicio, fim } = intervaloDoPeriodo(filtros.de, filtros.ate);
    return {
      deletedAt: null,
      status: 'ATENDIDO',
      ...((inicio || fim) && {
        inicio: { ...(inicio && { gte: inicio }), ...(fim && { lt: fim }) },
      }),
      ...(filtros.pagamento && { pagoEm: filtros.pagamento === 'pago' ? { not: null } : null }),
    };
  }

  private orderBy(
    sort: ListConsultasRealizadasQuery['sort'],
  ): Prisma.AgendamentoOrderByWithRelationInput[] {
    const { field, direction } = sort;
    const principal: Prisma.AgendamentoOrderByWithRelationInput = {
      data: { inicio: direction },
      paciente: { paciente: { nome: direction } },
      profissional: { profissional: { nome: direction } },
      tipo: { tipoAgendamento: { nome: direction } },
      valor: { valor: direction },
      pagamento: { formaPagamento: { nome: direction } },
    }[field];
    return [principal, { id: direction }];
  }
}
