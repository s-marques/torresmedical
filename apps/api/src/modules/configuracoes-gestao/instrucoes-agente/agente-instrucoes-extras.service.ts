import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import type {
  CreateAgenteInstrucaoExtraInput,
  ListAgenteInstrucaoExtraQuery,
  UpdateAgenteInstrucaoExtraInput,
} from '@torres/shared';
import type { AgenteInstrucaoExtra, Prisma } from '../../../generated/prisma/client';
import { BusinessException } from '../../../common/errors/api.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import { paginate, searchWhere, toOrderBy, type Page } from '../../../common/pagination/paginate';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';

/** Instruções extras (promoções, regras especiais) enviadas ao agente enquanto estiverem ativas. */
@Injectable()
export class AgenteInstrucoesExtrasService {
  constructor(private readonly txHost: TransactionHost<PrismaAdapter>) {}

  list(query: ListAgenteInstrucaoExtraQuery): Promise<Page<AgenteInstrucaoExtra>> {
    const where: Prisma.AgenteInstrucaoExtraWhereInput = {
      deletedAt: null,
      ativo: query.status ? query.status === 'ativo' : undefined,
      ...searchWhere(query.search, ['titulo', 'descricao']),
    };
    const orderBy = toOrderBy(query.sort);
    return paginate(query, {
      findMany: (page) => this.txHost.tx.agenteInstrucaoExtra.findMany({ where, orderBy, ...page }),
      count: () => this.txHost.tx.agenteInstrucaoExtra.count({ where }),
    });
  }

  async findById(id: string): Promise<AgenteInstrucaoExtra> {
    const registro = await this.txHost.tx.agenteInstrucaoExtra.findFirst({
      where: { id, deletedAt: null },
    });
    if (!registro) {
      throw new BusinessException(ErrorCode.NOT_FOUND, 'Instrução extra não encontrada', {
        status: 404,
      });
    }
    return registro;
  }

  create(input: CreateAgenteInstrucaoExtraInput): Promise<AgenteInstrucaoExtra> {
    return this.txHost.tx.agenteInstrucaoExtra.create({ data: input });
  }

  async update(id: string, input: UpdateAgenteInstrucaoExtraInput): Promise<AgenteInstrucaoExtra> {
    await this.findById(id);
    return this.txHost.tx.agenteInstrucaoExtra.update({ where: { id }, data: input });
  }

  async alterarAtivo(id: string, ativo: boolean): Promise<AgenteInstrucaoExtra> {
    await this.findById(id);
    return this.txHost.tx.agenteInstrucaoExtra.update({ where: { id }, data: { ativo } });
  }

  /** Exclusão lógica. */
  async remove(id: string): Promise<AgenteInstrucaoExtra> {
    await this.findById(id);
    return this.txHost.tx.agenteInstrucaoExtra.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
