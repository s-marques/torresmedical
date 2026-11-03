import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import type {
  CreateRespostaRapidaInput,
  ListRespostasRapidasQuery,
  UpdateRespostaRapidaInput,
} from '@torres/shared';
import type { Prisma, RespostaRapida } from '../../../generated/prisma/client';
import { BusinessException } from '../../../common/errors/api.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import { paginate, searchWhere, toOrderBy, type Page } from '../../../common/pagination/paginate';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';

const ATALHO_DUPLICADO = 'Já existe uma resposta rápida com este atalho';

/** Mensagens padrão para o atendimento WhatsApp (tela Respostas Rápidas). */
@Injectable()
export class RespostasRapidasService {
  constructor(private readonly txHost: TransactionHost<PrismaAdapter>) {}

  list(query: ListRespostasRapidasQuery): Promise<Page<RespostaRapida>> {
    const where: Prisma.RespostaRapidaWhereInput = {
      deletedAt: null,
      ...searchWhere(query.search, ['titulo', 'mensagem', 'categoria', 'atalho']),
    };
    const orderBy = toOrderBy(query.sort);
    return paginate(query, {
      findMany: (page) => this.txHost.tx.respostaRapida.findMany({ where, orderBy, ...page }),
      count: () => this.txHost.tx.respostaRapida.count({ where }),
    });
  }

  async findById(id: string): Promise<RespostaRapida> {
    const resposta = await this.txHost.tx.respostaRapida.findFirst({
      where: { id, deletedAt: null },
    });
    if (!resposta) {
      throw new BusinessException(ErrorCode.NOT_FOUND, 'Resposta rápida não encontrada', {
        status: 404,
      });
    }
    return resposta;
  }

  async create(input: CreateRespostaRapidaInput): Promise<RespostaRapida> {
    await this.ensureAtalhoDisponivel(input.atalho);
    return this.txHost.tx.respostaRapida.create({ data: input });
  }

  /** Substitui todos os campos: o modal Editar envia o formulário inteiro. */
  async update(id: string, input: UpdateRespostaRapidaInput): Promise<RespostaRapida> {
    await this.findById(id);
    await this.ensureAtalhoDisponivel(input.atalho, id);
    return this.txHost.tx.respostaRapida.update({ where: { id }, data: input });
  }

  /** Exclusão lógica: libera o atalho para outra resposta. */
  async remove(id: string): Promise<RespostaRapida> {
    await this.findById(id);
    return this.txHost.tx.respostaRapida.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  private async ensureAtalhoDisponivel(atalho: string | null, ignorarId?: string): Promise<void> {
    if (!atalho) return;
    const existente = await this.txHost.tx.respostaRapida.findFirst({
      where: {
        deletedAt: null,
        atalho: { equals: atalho, mode: 'insensitive' },
        id: ignorarId ? { not: ignorarId } : undefined,
      },
      select: { id: true },
    });
    if (existente) {
      // 400 com details: a mensagem aparece no campo Atalho do modal.
      throw new BusinessException('ATALHO_DUPLICADO', ATALHO_DUPLICADO, {
        status: 400,
        details: [{ field: 'atalho', message: ATALHO_DUPLICADO }],
      });
    }
  }
}
