import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import type {
  CreateCentroCustoInput,
  ListCentrosCustoQuery,
  LookupItem,
  LookupQuery,
  UpdateCentroCustoInput,
} from '@torres/shared';
import type { CentroCusto, Prisma } from '../../../generated/prisma/client';
import { BusinessException } from '../../../common/errors/api.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import {
  EntidadeLookupService,
  SELECIONAVEIS,
  type FonteLookup,
} from '../../../common/lookups/lookup-query';
import { paginate, searchWhere, toOrderBy, type Page } from '../../../common/pagination/paginate';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';

const NAO_EXCLUIDOS = { deletedAt: null } as const;

/**
 * Centro de custo das contas a pagar (issue #163): cadastro simples (nome e ativo). Dono da
 * entidade; Contas a Pagar o usa pelo lookup `centros-custo`.
 */
@Injectable()
export class CentrosCustoService extends EntidadeLookupService<
  LookupQuery<'centros-custo'>,
  Prisma.CentroCustoWhereInput,
  CentroCusto
> {
  protected readonly naoEncontrado = 'Centro de custo não encontrado';
  protected readonly fonte: FonteLookup<Prisma.CentroCustoWhereInput, CentroCusto> = {
    findMany: (args) => this.txHost.tx.centroCusto.findMany(args),
    count: (args) => this.txHost.tx.centroCusto.count(args),
    findFirst: (args) => this.txHost.tx.centroCusto.findFirst(args),
  };

  constructor(private readonly txHost: TransactionHost<PrismaAdapter>) {
    super();
  }

  list(query: ListCentrosCustoQuery): Promise<Page<CentroCusto>> {
    const where: Prisma.CentroCustoWhereInput = {
      ...NAO_EXCLUIDOS,
      ...searchWhere(query.search, ['nome']),
    };
    const orderBy = toOrderBy(query.sort);
    return paginate(query, {
      findMany: (page) => this.txHost.tx.centroCusto.findMany({ where, orderBy, ...page }),
      count: () => this.txHost.tx.centroCusto.count({ where }),
    });
  }

  async create(input: CreateCentroCustoInput): Promise<CentroCusto> {
    await this.garantirNomeLivre(input.nome);
    return this.txHost.tx.centroCusto.create({ data: { nome: input.nome } });
  }

  async update(id: string, input: UpdateCentroCustoInput): Promise<CentroCusto> {
    await this.findById(id);
    if (input.nome !== undefined) await this.garantirNomeLivre(input.nome, id);
    return this.txHost.tx.centroCusto.update({ where: { id }, data: input });
  }

  /** Exclusão lógica: as contas já lançadas continuam mostrando o nome. */
  async remove(id: string): Promise<CentroCusto> {
    await this.findById(id);
    return this.txHost.tx.centroCusto.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  protected filtro(query: LookupQuery<'centros-custo'>): Prisma.CentroCustoWhereInput {
    return { ...SELECIONAVEIS, ...searchWhere(query.search, ['nome']) };
  }

  protected toItem(centro: CentroCusto): LookupItem {
    return { id: centro.id, label: centro.nome, descricao: null };
  }

  private async garantirNomeLivre(nome: string, ignorarId?: string): Promise<void> {
    const existe = await this.txHost.tx.centroCusto.findFirst({
      where: {
        ...NAO_EXCLUIDOS,
        nome: { equals: nome, mode: 'insensitive' },
        ...(ignorarId && { id: { not: ignorarId } }),
      },
      select: { id: true },
    });
    if (existe) {
      throw new BusinessException(
        ErrorCode.DUPLICATE,
        'Já existe um centro de custo com este nome',
        { status: 409 },
      );
    }
  }
}
