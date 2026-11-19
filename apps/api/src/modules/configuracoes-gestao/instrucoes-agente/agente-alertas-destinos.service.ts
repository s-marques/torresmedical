import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import {
  AGENTE_ALERTA_DUPLICADO,
  type CreateAgenteAlertaDestinoInput,
  type ListAgenteAlertaDestinoQuery,
} from '@torres/shared';
import type { AgenteAlertaDestino, Prisma } from '../../../generated/prisma/client';
import { BusinessException } from '../../../common/errors/api.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import { paginate, searchWhere, toOrderBy, type Page } from '../../../common/pagination/paginate';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';

/** Números e grupos de WhatsApp avisados quando o agente não sabe responder uma dúvida. */
@Injectable()
export class AgenteAlertasDestinosService {
  constructor(private readonly txHost: TransactionHost<PrismaAdapter>) {}

  list(query: ListAgenteAlertaDestinoQuery): Promise<Page<AgenteAlertaDestino>> {
    const where: Prisma.AgenteAlertaDestinoWhereInput = {
      deletedAt: null,
      ...searchWhere(query.search, ['nome', 'numero']),
    };
    const orderBy = toOrderBy(query.sort);
    return paginate(query, {
      findMany: (page) => this.txHost.tx.agenteAlertaDestino.findMany({ where, orderBy, ...page }),
      count: () => this.txHost.tx.agenteAlertaDestino.count({ where }),
    });
  }

  async create(input: CreateAgenteAlertaDestinoInput): Promise<AgenteAlertaDestino> {
    const existente = await this.txHost.tx.agenteAlertaDestino.findFirst({
      where: { numero: input.numero, deletedAt: null },
      select: { id: true },
    });
    if (existente) {
      throw new BusinessException(ErrorCode.DUPLICATE, AGENTE_ALERTA_DUPLICADO, {
        status: 409,
        details: [{ field: 'numero', message: AGENTE_ALERTA_DUPLICADO }],
      });
    }
    return this.txHost.tx.agenteAlertaDestino.create({ data: input });
  }

  /** Exclusão lógica. */
  async remove(id: string): Promise<AgenteAlertaDestino> {
    const registro = await this.txHost.tx.agenteAlertaDestino.findFirst({
      where: { id, deletedAt: null },
    });
    if (!registro) {
      throw new BusinessException(ErrorCode.NOT_FOUND, 'Destino de alerta não encontrado', {
        status: 404,
      });
    }
    return this.txHost.tx.agenteAlertaDestino.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
