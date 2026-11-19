import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import {
  AGENTE_REGRA_NOME_DUPLICADO,
  type CreateAgenteRegraInput,
  type ListAgenteRegraQuery,
  type UpdateAgenteRegraInput,
} from '@torres/shared';
import type { AgenteRegra, Prisma } from '../../../generated/prisma/client';
import { BusinessException } from '../../../common/errors/api.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import { paginate, searchWhere, toOrderBy, type Page } from '../../../common/pagination/paginate';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';

/** Regras de validação do agente (pré-tool e pós-resposta). A execução delas é de outro card. */
@Injectable()
export class AgenteRegrasService {
  constructor(private readonly txHost: TransactionHost<PrismaAdapter>) {}

  list(query: ListAgenteRegraQuery): Promise<Page<AgenteRegra>> {
    const where: Prisma.AgenteRegraWhereInput = {
      deletedAt: null,
      ativo: query.status ? query.status === 'ativo' : undefined,
      tipo: query.tipo,
      acao: query.acao,
      ...searchWhere(query.search, ['nome', 'descricao']),
    };
    const orderBy = toOrderBy(query.sort);
    return paginate(query, {
      findMany: (page) => this.txHost.tx.agenteRegra.findMany({ where, orderBy, ...page }),
      count: () => this.txHost.tx.agenteRegra.count({ where }),
    });
  }

  async findById(id: string): Promise<AgenteRegra> {
    const registro = await this.txHost.tx.agenteRegra.findFirst({ where: { id, deletedAt: null } });
    if (!registro) {
      throw new BusinessException(ErrorCode.NOT_FOUND, 'Regra não encontrada', { status: 404 });
    }
    return registro;
  }

  async create(input: CreateAgenteRegraInput): Promise<AgenteRegra> {
    await this.garantirNomeDisponivel(input.nome);
    return this.txHost.tx.agenteRegra.create({ data: input });
  }

  async update(id: string, input: UpdateAgenteRegraInput): Promise<AgenteRegra> {
    await this.findById(id);
    await this.garantirNomeDisponivel(input.nome, id);
    return this.txHost.tx.agenteRegra.update({ where: { id }, data: input });
  }

  async alterarAtivo(id: string, ativo: boolean): Promise<AgenteRegra> {
    await this.findById(id);
    return this.txHost.tx.agenteRegra.update({ where: { id }, data: { ativo } });
  }

  /** Exclusão lógica. */
  async remove(id: string): Promise<AgenteRegra> {
    await this.findById(id);
    return this.txHost.tx.agenteRegra.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  private async garantirNomeDisponivel(nome: string, ignorarId?: string): Promise<void> {
    const existente = await this.txHost.tx.agenteRegra.findFirst({
      where: { nome, deletedAt: null, id: ignorarId ? { not: ignorarId } : undefined },
      select: { id: true },
    });
    if (existente) {
      throw new BusinessException(ErrorCode.DUPLICATE, AGENTE_REGRA_NOME_DUPLICADO, {
        status: 409,
        details: [{ field: 'nome', message: AGENTE_REGRA_NOME_DUPLICADO }],
      });
    }
  }
}
