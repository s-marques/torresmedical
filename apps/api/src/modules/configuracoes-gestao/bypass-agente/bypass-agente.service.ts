import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import {
  BYPASS_AGENTE_TELEFONE_DUPLICADO,
  type CreateBypassAgenteInput,
  type ListBypassAgenteQuery,
  type UpdateBypassAgenteInput,
} from '@torres/shared';
import type { BypassAgente, Prisma } from '../../../generated/prisma/client';
import { BusinessException } from '../../../common/errors/api.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import { paginate, searchWhere, toOrderBy, type Page } from '../../../common/pagination/paginate';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';

/**
 * Telefones que o agente de IA não responde (tela Bypass Agente): as mensagens desses números vão
 * direto para a fila de atendentes. Aqui só se mantém a lista; a checagem na conversa é da #176.
 */
@Injectable()
export class BypassAgenteService {
  constructor(private readonly txHost: TransactionHost<PrismaAdapter>) {}

  list(query: ListBypassAgenteQuery): Promise<Page<BypassAgente>> {
    const where: Prisma.BypassAgenteWhereInput = {
      deletedAt: null,
      ativo: query.status ? query.status === 'ativo' : undefined,
      ...searchWhere(query.search, ['nome', 'telefone', 'cargo']),
    };
    const orderBy = toOrderBy(query.sort);
    return paginate(query, {
      findMany: (page) => this.txHost.tx.bypassAgente.findMany({ where, orderBy, ...page }),
      count: () => this.txHost.tx.bypassAgente.count({ where }),
    });
  }

  async findById(id: string): Promise<BypassAgente> {
    const registro = await this.txHost.tx.bypassAgente.findFirst({
      where: { id, deletedAt: null },
    });
    if (!registro) {
      throw new BusinessException(ErrorCode.NOT_FOUND, 'Telefone não encontrado', { status: 404 });
    }
    return registro;
  }

  async create(input: CreateBypassAgenteInput): Promise<BypassAgente> {
    await this.garantirTelefoneDisponivel(input.telefone);
    return this.txHost.tx.bypassAgente.create({ data: input });
  }

  async update(id: string, input: UpdateBypassAgenteInput): Promise<BypassAgente> {
    await this.findById(id);
    await this.garantirTelefoneDisponivel(input.telefone, id);
    return this.txHost.tx.bypassAgente.update({ where: { id }, data: input });
  }

  async alterarStatus(id: string, ativo: boolean): Promise<BypassAgente> {
    await this.findById(id);
    return this.txHost.tx.bypassAgente.update({ where: { id }, data: { ativo } });
  }

  /** Exclusão lógica. */
  async remove(id: string): Promise<BypassAgente> {
    await this.findById(id);
    return this.txHost.tx.bypassAgente.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  private async garantirTelefoneDisponivel(telefone: string, ignorarId?: string): Promise<void> {
    const existente = await this.txHost.tx.bypassAgente.findFirst({
      where: { telefone, deletedAt: null, id: ignorarId ? { not: ignorarId } : undefined },
      select: { id: true },
    });
    if (existente) {
      throw new BusinessException(ErrorCode.DUPLICATE, BYPASS_AGENTE_TELEFONE_DUPLICADO, {
        status: 409,
        details: [{ field: 'telefone', message: BYPASS_AGENTE_TELEFONE_DUPLICADO }],
      });
    }
  }
}
