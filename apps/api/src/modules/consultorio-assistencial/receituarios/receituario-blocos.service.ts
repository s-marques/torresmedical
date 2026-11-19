import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import {
  formatarNumeracaoBloco,
  RECEITUARIO_BLOCO_STATUS_ROTULOS,
  RECEITUARIO_TIPO_ROTULOS,
  type CreateReceituarioBlocoInput,
  type ExportReceituarioBlocosQuery,
  type ListReceituarioBlocosQuery,
  type ReceituarioBloco,
  type ReceituarioBlocoExportColumn,
} from '@torres/shared';
import type {
  Prisma,
  ReceituarioBloco as ReceituarioBlocoModel,
} from '../../../generated/prisma/client';
import { EscopoDadosService } from '../../../common/auth/escopo-dados.service';
import { BusinessException } from '../../../common/errors/api.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import { ExportService, selectColumns } from '../../../common/export/export.service';
import type { ExportColumn, ExportFile } from '../../../common/export/export.types';
import type { Page } from '../../../common/pagination/paginate';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import { ProfissionaisService } from '../../gestao-profissionais/profissionais/profissionais.service';
import { naOrdem, paginarPorNome } from './ordenar-por-nome';

const NAO_EXCLUIDOS = { deletedAt: null } as const;

export const FAIXA_SOBREPOSTA = 'Já existe bloco deste tipo com numeração nesta faixa';

const dia = (data: Date) => data.toISOString().slice(0, 10);

/** Total de folhas do bloco (faixa inclusiva). */
export function totalFolhas(bloco: Pick<ReceituarioBlocoModel, 'numeroInicio' | 'numeroFim'>) {
  return bloco.numeroFim - bloco.numeroInicio + 1;
}

export function toReceituarioBloco(
  bloco: ReceituarioBlocoModel,
  profissionalNome: string | null,
): ReceituarioBloco {
  return {
    id: bloco.id,
    tipo: bloco.tipo,
    numeroInicio: bloco.numeroInicio,
    numeroFim: bloco.numeroFim,
    localizacao: bloco.localizacao,
    profissionalId: bloco.profissionalId,
    profissionalNome,
    dataRecebimento: bloco.dataRecebimento ? dia(bloco.dataRecebimento) : null,
    usados: bloco.usados,
    total: totalFolhas(bloco),
    status: bloco.status,
    createdAt: bloco.createdAt.toISOString(),
    updatedAt: bloco.updatedAt.toISOString(),
  };
}

/** Colunas exportáveis, iguais às do grid Blocos. */
export const RECEITUARIO_BLOCO_EXPORT_DEFINITIONS: readonly ExportColumn<
  ReceituarioBloco,
  ReceituarioBlocoExportColumn
>[] = [
  { key: 'tipo', header: 'Tipo', value: (b) => RECEITUARIO_TIPO_ROTULOS[b.tipo] },
  { key: 'numeracao', header: 'Numeracao', value: (b) => formatarNumeracaoBloco(b), width: 2 },
  { key: 'localizacao', header: 'Localizacao', value: (b) => b.localizacao ?? '', width: 2 },
  { key: 'medico', header: 'Medico', value: (b) => b.profissionalNome ?? '', width: 3 },
  { key: 'usados', header: 'Usados/Total', value: (b) => `${b.usados}/${b.total}` },
  { key: 'status', header: 'Status', value: (b) => RECEITUARIO_BLOCO_STATUS_ROTULOS[b.status] },
];

type FiltrosBloco = Pick<ListReceituarioBlocosQuery, 'search' | 'tipo' | 'status' | 'sort'>;

/**
 * Aba Blocos da tela Receituários (`/receituarios`, issue #42). O médico é de outro módulo
 * (gestao-profissionais), lido pelo service exportado. O usuário restrito só vê e cadastra
 * blocos dos profissionais vinculados (issue #153).
 */
@Injectable()
export class ReceituarioBlocosService {
  constructor(
    private readonly txHost: TransactionHost<PrismaAdapter>,
    private readonly exportService: ExportService,
    private readonly profissionais: ProfissionaisService,
    private readonly escopo: EscopoDadosService,
  ) {}

  async list(query: ListReceituarioBlocosQuery): Promise<Page<ReceituarioBloco>> {
    const { registros, total } = await this.buscar(query, query);
    return {
      data: await this.comNomes(registros),
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.ceil(total / query.pageSize),
      },
    };
  }

  /** Select "Bloco" da Nova Prescricao: Ativos, com médico e no escopo. */
  async disponiveis(): Promise<ReceituarioBloco[]> {
    const registros = await this.txHost.tx.receituarioBloco.findMany({
      where: {
        ...NAO_EXCLUIDOS,
        status: 'ATIVO',
        profissionalId: this.escopo.filtroProfissional() ?? { not: null },
      },
      orderBy: [{ tipo: 'asc' }, { numeroInicio: 'asc' }, { id: 'asc' }],
    });
    return this.comNomes(registros);
  }

  async create(input: CreateReceituarioBlocoInput): Promise<ReceituarioBloco> {
    // Restrito sem médico: o bloco ficaria fora do escopo e sumiria da própria lista.
    this.escopo.garantirProfissional(input.profissionalId);
    const profissional = input.profissionalId
      ? await this.profissionais.detalhe(input.profissionalId)
      : null;
    await this.garantirFaixaLivre(input);
    const bloco = await this.txHost.tx.receituarioBloco.create({
      data: {
        tipo: input.tipo,
        numeroInicio: input.numeroInicio,
        numeroFim: input.numeroFim,
        localizacao: input.localizacao,
        profissionalId: input.profissionalId,
        dataRecebimento: input.dataRecebimento
          ? new Date(`${input.dataRecebimento}T00:00:00.000Z`)
          : null,
      },
    });
    return toReceituarioBloco(bloco, profissional?.nome ?? null);
  }

  async export(query: ExportReceituarioBlocosQuery): Promise<ExportFile> {
    const where = await this.where(query);
    this.exportService.ensureWithinLimit(await this.txHost.tx.receituarioBloco.count({ where }));
    const { registros } = await this.buscar(query, null);
    return this.exportService.export({
      format: query.format,
      title: 'Receituarios ANVISA - Blocos',
      filename: 'receituarios-blocos',
      columns: selectColumns(RECEITUARIO_BLOCO_EXPORT_DEFINITIONS, query.columns),
      rows: await this.comNomes(registros),
    });
  }

  /** Nome do médico de cada bloco (sem FK). */
  async comNomes(registros: readonly ReceituarioBlocoModel[]): Promise<ReceituarioBloco[]> {
    const nomes = await this.profissionais.nomesPorIds(
      registros.map((b) => b.profissionalId).filter((id): id is string => id !== null),
    );
    return registros.map((b) =>
      toReceituarioBloco(b, b.profissionalId ? (nomes.get(b.profissionalId) ?? null) : null),
    );
  }

  /** Mesmo tipo e faixas que se cruzam: 409 (decisão do dev na issue #42). */
  private async garantirFaixaLivre(input: CreateReceituarioBlocoInput): Promise<void> {
    const conflito = await this.txHost.tx.receituarioBloco.findFirst({
      where: {
        ...NAO_EXCLUIDOS,
        tipo: input.tipo,
        numeroInicio: { lte: input.numeroFim },
        numeroFim: { gte: input.numeroInicio },
      },
      select: { id: true },
    });
    if (conflito) {
      throw new BusinessException('FAIXA_SOBREPOSTA', FAIXA_SOBREPOSTA, { status: 409 });
    }
  }

  /** Página (ou tudo, na exportação) na ordem pedida. */
  private async buscar(
    query: FiltrosBloco,
    pagina: { page: number; pageSize: number } | null,
  ): Promise<{ registros: ReceituarioBlocoModel[]; total: number }> {
    const where = await this.where(query);
    const { field, direction } = query.sort;
    if (field === 'medico') {
      const chaves = await this.txHost.tx.receituarioBloco.findMany({
        where,
        select: { id: true, profissionalId: true },
      });
      const nomes = await this.profissionais.nomesPorIds(
        chaves.map((c) => c.profissionalId).filter((id): id is string => id !== null),
      );
      const { ids, total } = paginarPorNome(
        chaves.map((c) => ({ id: c.id, refId: c.profissionalId })),
        nomes,
        { page: pagina?.page ?? 1, pageSize: pagina?.pageSize ?? chaves.length, direction },
      );
      const registros = await this.txHost.tx.receituarioBloco.findMany({
        where: { id: { in: ids } },
      });
      return { registros: naOrdem(ids, registros), total };
    }
    const orderBy: Prisma.ReceituarioBlocoOrderByWithRelationInput[] = [
      field === 'localizacao'
        ? { localizacao: { sort: direction, nulls: 'last' } }
        : { [field]: direction },
      { createdAt: direction },
      { id: direction },
    ];
    const [registros, total] = await Promise.all([
      this.txHost.tx.receituarioBloco.findMany({
        where,
        orderBy,
        ...(pagina && { skip: (pagina.page - 1) * pagina.pageSize, take: pagina.pageSize }),
      }),
      this.txHost.tx.receituarioBloco.count({ where }),
    ]);
    return { registros, total };
  }

  /** "Buscar blocos...": localização, nome do médico ou número de uma folha do bloco. */
  private async where(query: FiltrosBloco): Promise<Prisma.ReceituarioBlocoWhereInput> {
    const where: Prisma.ReceituarioBlocoWhereInput = {
      ...NAO_EXCLUIDOS,
      tipo: query.tipo,
      status: query.status,
      profissionalId: this.escopo.filtroProfissional(),
    };
    if (!query.search) return where;
    const numero = /^\d{1,6}$/.test(query.search) ? Number(query.search) : null;
    const profissionalIds = await this.profissionais.idsPorBusca(query.search);
    return {
      ...where,
      OR: [
        { localizacao: { contains: query.search, mode: 'insensitive' } },
        ...(profissionalIds.length > 0 ? [{ profissionalId: { in: profissionalIds } }] : []),
        ...(numero === null ? [] : [{ numeroInicio: { lte: numero }, numeroFim: { gte: numero } }]),
      ],
    };
  }
}

/** Erro 404 padrão do bloco. */
export function blocoNaoEncontrado(): BusinessException {
  return new BusinessException(ErrorCode.NOT_FOUND, 'Bloco não encontrado', { status: 404 });
}
