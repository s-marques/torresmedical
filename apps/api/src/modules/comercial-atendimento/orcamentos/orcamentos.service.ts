import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import {
  calcularTotaisOrcamento,
  listProtocolosMaeQuerySchema,
  listProtocolosQuerySchema,
  listServicosProfissionaisQuerySchema,
  ORCAMENTO_ROTULO_STATUS,
  type CatalogoOrcamentoItem,
  type CatalogoOrcamentoQuery,
  type CriarOrcamentoInput,
  type ExportOrcamentosQuery,
  type ListOrcamentosQuery,
  type Orcamento,
  type OrcamentoExportColumn,
  type OrcamentoOrigem,
  type SoroterapiaPacote,
} from '@torres/shared';
import type { Prisma } from '../../../generated/prisma/client';
import { ExportService, selectColumns } from '../../../common/export/export.service';
import type { ExportColumn, ExportFile } from '../../../common/export/export.types';
import { paginate, type Page } from '../../../common/pagination/paginate';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import { FormasPagamentoService } from '../../financeiro/formas-pagamento/formas-pagamento.service';
import { ProtocolosService } from '../../gestao-profissionais/protocolos/protocolos.service';
import { ProtocolosMaeService } from '../../gestao-profissionais/protocolos-mae/protocolos-mae.service';
import { ServicosProfissionaisService } from '../../gestao-profissionais/servicos-profissionais/servicos-profissionais.service';
import { PacientesService } from '../pacientes/pacientes.service';

const INCLUDE = {
  paciente: { select: { nome: true } },
  formaPagamento: { select: { nome: true } },
  itens: { orderBy: { posicao: 'asc' } },
} satisfies Prisma.OrcamentoInclude;
type OrcamentoCompleto = Prisma.OrcamentoGetPayload<{ include: typeof INCLUDE }>;

const NAO_EXCLUIDOS = { deletedAt: null } as const;

const ORIGEM_PARA_BANCO = {
  servico: 'SERVICO',
  protocolo: 'PROTOCOLO',
  'protocolo-mae': 'PROTOCOLO_MAE',
} as const satisfies Record<OrcamentoOrigem, string>;

const ORIGEM_DO_BANCO = {
  SERVICO: 'servico',
  PROTOCOLO: 'protocolo',
  PROTOCOLO_MAE: 'protocolo-mae',
} as const;

const STATUS_FILTRO = {
  pendente: 'PENDENTE',
  aprovado: 'APROVADO',
  concluido: 'CONCLUIDO',
  cancelado: 'CANCELADO',
} as const;

export function toOrcamento(o: OrcamentoCompleto): Orcamento {
  return {
    id: o.id,
    numero: o.numero,
    data: o.createdAt.toISOString(),
    pacienteId: o.pacienteId,
    cliente: o.paciente?.nome ?? null,
    formaPagamentoId: o.formaPagamentoId,
    formaPagamento: o.formaPagamento?.nome ?? null,
    observacoes: o.observacoes,
    descontoTipo: o.descontoTipo === 'PERCENTUAL' ? 'percentual' : 'valor',
    descontoValor: o.descontoValor.toString(),
    subtotal: o.subtotal.toString(),
    total: o.total.toString(),
    status: o.status,
    itens: o.itens.map((i) => ({
      id: i.id,
      origem: ORIGEM_DO_BANCO[i.origem],
      origemId: i.origemId,
      descricao: i.descricao,
      quantidade: i.quantidade,
      valorUnitario: i.valorUnitario.toString(),
      desconto: i.desconto.toString(),
      total: i.total.toString(),
    })),
  };
}

/** Colunas exportáveis, iguais às do grid. */
export const ORCAMENTO_EXPORT_DEFINITIONS: readonly ExportColumn<
  Orcamento,
  OrcamentoExportColumn
>[] = [
  { key: 'id', header: '#', type: 'number', value: (o) => o.numero },
  { key: 'data', header: 'Data', type: 'datetime', value: (o) => o.data },
  { key: 'cliente', header: 'Cliente', value: (o) => o.cliente ?? '-', width: 3 },
  { key: 'total', header: 'Total', type: 'currency', value: (o) => o.total },
  { key: 'status', header: 'Status', value: (o) => ORCAMENTO_ROTULO_STATUS[o.status] },
];

/** Orçamentos do Comercial/Atendimento: listagem, criação e catálogo de itens. */
@Injectable()
export class OrcamentosService {
  constructor(
    private readonly txHost: TransactionHost<PrismaAdapter>,
    private readonly exportService: ExportService,
    private readonly pacientes: PacientesService,
    private readonly formasPagamento: FormasPagamentoService,
    private readonly servicos: ServicosProfissionaisService,
    private readonly protocolos: ProtocolosService,
    private readonly protocolosMae: ProtocolosMaeService,
  ) {}

  async list(query: ListOrcamentosQuery): Promise<Page<Orcamento>> {
    const where = this.where(query);
    const orderBy = this.orderBy(query.sort);
    const page = await paginate(query, {
      findMany: (p) =>
        this.txHost.tx.orcamento.findMany({ where, orderBy, include: INCLUDE, ...p }),
      count: () => this.txHost.tx.orcamento.count({ where }),
    });
    return { ...page, data: page.data.map(toOrcamento) };
  }

  /**
   * Aba Pacotes da tela Soroterapia (#44): itens de protocolo dos orçamentos Aprovados, do mais
   * recente ao mais antigo. `pacienteIds` limita aos pacientes do escopo do usuário (`null` =
   * todos); orçamento sem paciente só aparece para quem não tem restrição.
   */
  async listarPacotesProtocolo(
    pacienteIds: readonly string[] | null,
  ): Promise<SoroterapiaPacote[]> {
    const itens = await this.txHost.tx.orcamentoItem.findMany({
      where: {
        origem: 'PROTOCOLO',
        orcamento: {
          ...NAO_EXCLUIDOS,
          status: 'APROVADO',
          ...(pacienteIds && { pacienteId: { in: [...pacienteIds] } }),
        },
      },
      include: {
        orcamento: {
          select: {
            id: true,
            numero: true,
            pacienteId: true,
            paciente: { select: { nome: true } },
          },
        },
      },
      orderBy: [{ orcamento: { numero: 'desc' } }, { posicao: 'asc' }],
    });
    return itens.map((item) => ({
      id: item.id,
      orcamentoId: item.orcamento.id,
      orcamentoNumero: item.orcamento.numero,
      pacienteId: item.orcamento.pacienteId,
      pacienteNome: item.orcamento.paciente?.nome ?? null,
      protocolo: item.descricao,
      quantidade: item.quantidade,
    }));
  }

  /** Cria como Pendente. Os totais são sempre recalculados aqui, nunca vêm do front. */
  async create(input: CriarOrcamentoInput): Promise<Orcamento> {
    if (input.pacienteId) await this.pacientes.findLookupById(input.pacienteId);
    if (input.formaPagamentoId) await this.formasPagamento.findLookupById(input.formaPagamentoId);
    for (const item of input.itens) await this.garantirOrigem(item.origem, item.origemId);

    const totais = calcularTotaisOrcamento(input.itens, input.descontoTipo, input.descontoValor);
    const criado = await this.txHost.tx.orcamento.create({
      data: {
        pacienteId: input.pacienteId,
        formaPagamentoId: input.formaPagamentoId,
        observacoes: input.observacoes,
        descontoTipo: input.descontoTipo === 'percentual' ? 'PERCENTUAL' : 'VALOR',
        descontoValor: input.descontoValor,
        subtotal: totais.subtotal,
        total: totais.total,
        itens: {
          create: input.itens.map((item, posicao) => ({
            origem: ORIGEM_PARA_BANCO[item.origem],
            origemId: item.origemId,
            descricao: item.descricao,
            quantidade: item.quantidade,
            valorUnitario: item.valorUnitario,
            desconto: item.desconto,
            total: totais.totaisItens[posicao] ?? 0,
            posicao,
          })),
        },
      },
      include: INCLUDE,
    });
    return toOrcamento(criado);
  }

  async export(query: ExportOrcamentosQuery): Promise<ExportFile> {
    const where = this.where(query);
    this.exportService.ensureWithinLimit(await this.txHost.tx.orcamento.count({ where }));
    const rows = await this.txHost.tx.orcamento.findMany({
      where,
      orderBy: this.orderBy(query.sort),
      include: INCLUDE,
    });
    return this.exportService.export({
      format: query.format,
      title: 'Orçamentos',
      filename: 'orcamentos',
      columns: selectColumns(ORCAMENTO_EXPORT_DEFINITIONS, query.columns),
      rows: rows.map(toOrcamento),
    });
  }

  /** Itens das abas do modal. Usa os services dos módulos donos, sem ler as tabelas deles. */
  async catalogo(query: CatalogoOrcamentoQuery): Promise<Page<CatalogoOrcamentoItem>> {
    const { page, pageSize, search } = query;
    if (query.tipo === 'servico') {
      const r = await this.servicos.list(
        listServicosProfissionaisQuerySchema.parse({ page, pageSize, search, status: 'ativo' }),
      );
      return {
        ...r,
        data: r.data.map((s) => ({
          id: s.id,
          nome: s.nome,
          detalhe: s.profissionalNome,
          valor: s.valor,
        })),
      };
    }
    if (query.tipo === 'protocolo') {
      const r = await this.protocolos.list(
        listProtocolosQuerySchema.parse({ page, pageSize, search }),
      );
      return {
        ...r,
        data: r.data.map((p) => ({
          id: p.id,
          nome: p.nome,
          detalhe: p.profissionalNome ?? p.categoria,
          valor: p.valorTotal,
        })),
      };
    }
    const r = await this.protocolosMae.list(
      listProtocolosMaeQuerySchema.parse({ page, pageSize, search }),
    );
    return {
      ...r,
      data: r.data.map((p) => ({
        id: p.id,
        nome: p.nome,
        detalhe: p.categoria,
        valor: p.valorTotal,
      })),
    };
  }

  /** O cadastro de origem precisa existir (404 se não). */
  private async garantirOrigem(origem: OrcamentoOrigem, id: string): Promise<void> {
    if (origem === 'servico') await this.servicos.findById(id);
    else if (origem === 'protocolo') await this.protocolos.findById(id);
    else await this.protocolosMae.findById(id);
  }

  private where(
    query: Pick<ListOrcamentosQuery, 'search' | 'status'> & { pacienteId?: string },
  ): Prisma.OrcamentoWhereInput {
    return {
      ...NAO_EXCLUIDOS,
      status: query.status && STATUS_FILTRO[query.status],
      pacienteId: query.pacienteId,
      ...(query.search && {
        paciente: { nome: { contains: query.search, mode: 'insensitive' } },
      }),
    };
  }

  private orderBy(sort: ListOrcamentosQuery['sort']): Prisma.OrcamentoOrderByWithRelationInput[] {
    const { field, direction } = sort;
    let principal: Prisma.OrcamentoOrderByWithRelationInput;
    if (field === 'cliente') principal = { paciente: { nome: direction } };
    else if (field === 'id') principal = { numero: direction };
    else if (field === 'data') principal = { createdAt: direction };
    else principal = { [field]: direction };
    return [principal, { id: direction }];
  }
}
