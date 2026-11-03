import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import type {
  Comissao as ComissaoDto,
  ComissaoPage,
  CreateComissaoInput,
  ListComissoesQuery,
  UpdateComissaoInput,
} from '@torres/shared';
import type { Comissao, Prisma } from '../../../generated/prisma/client';
import { BusinessException } from '../../../common/errors/api.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import { paginate, toOrderBy } from '../../../common/pagination/paginate';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';

/** Comissões lançadas manualmente por funcionário (aba "Comissões" da tela Funcionários). */
@Injectable()
export class ComissoesService {
  constructor(private readonly txHost: TransactionHost<PrismaAdapter>) {}

  async list(funcionarioId: string, query: ListComissoesQuery): Promise<ComissaoPage> {
    const where = this.where(funcionarioId, query);
    const orderBy = toOrderBy(query.sort);
    const pagina = await paginate(query, {
      findMany: (page) => this.txHost.tx.comissao.findMany({ where, orderBy, ...page }),
      count: () => this.txHost.tx.comissao.count({ where }),
    });
    return { ...pagina, data: pagina.data.map((c) => this.toDto(c)) };
  }

  async findById(funcionarioId: string, id: string): Promise<ComissaoDto> {
    const comissao = await this.txHost.tx.comissao.findFirst({
      where: { id, funcionarioId, deletedAt: null },
    });
    if (!comissao) {
      throw new BusinessException(ErrorCode.NOT_FOUND, 'Comissão não encontrada', { status: 404 });
    }
    return this.toDto(comissao);
  }

  async create(funcionarioId: string, input: CreateComissaoInput): Promise<ComissaoDto> {
    const criada = await this.txHost.tx.comissao.create({
      data: { ...this.dados(input), funcionarioId },
    });
    return this.toDto(criada);
  }

  async update(
    funcionarioId: string,
    id: string,
    input: UpdateComissaoInput,
  ): Promise<ComissaoDto> {
    await this.findById(funcionarioId, id);
    const atualizada = await this.txHost.tx.comissao.update({
      where: { id },
      data: this.dados(input),
    });
    return this.toDto(atualizada);
  }

  /** Exclusão lógica (registro financeiro, CLAUDE.md seção 3). */
  async remove(funcionarioId: string, id: string): Promise<ComissaoDto> {
    await this.findById(funcionarioId, id);
    const removida = await this.txHost.tx.comissao.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return this.toDto(removida);
  }

  private where(
    funcionarioId: string,
    query: Pick<ListComissoesQuery, 'status'>,
  ): Prisma.ComissaoWhereInput {
    return {
      funcionarioId,
      deletedAt: null,
      status: query.status ? query.status.toUpperCase() : undefined,
    } as Prisma.ComissaoWhereInput;
  }

  private dados(
    input: CreateComissaoInput,
  ): Pick<
    Prisma.ComissaoUncheckedCreateInput,
    'valor' | 'dataReferencia' | 'descricao' | 'status'
  > {
    const { dataReferencia, status, ...campos } = input;
    return {
      ...campos,
      dataReferencia: new Date(dataReferencia),
      status: status.toUpperCase() as Prisma.ComissaoUncheckedCreateInput['status'],
    };
  }

  private toDto(comissao: Comissao): ComissaoDto {
    return {
      id: comissao.id,
      funcionarioId: comissao.funcionarioId,
      valor: comissao.valor.toString(),
      dataReferencia: comissao.dataReferencia.toISOString().slice(0, 10),
      descricao: comissao.descricao,
      status: comissao.status.toLowerCase() as ComissaoDto['status'],
      createdAt: comissao.createdAt.toISOString(),
      updatedAt: comissao.updatedAt.toISOString(),
    };
  }
}
