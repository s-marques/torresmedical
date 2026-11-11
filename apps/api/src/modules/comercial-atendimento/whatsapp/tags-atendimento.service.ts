import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import type { CreateTagAtendimentoInput, ListTagsAtendimentoQuery } from '@torres/shared';
import type { TagAtendimento } from '../../../generated/prisma/client';
import { isUuid } from '../../../common/auth/tokens';
import { BusinessException } from '../../../common/errors/api.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import { paginate, toOrderBy, type Page } from '../../../common/pagination/paginate';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';

const NAO_EXCLUIDAS = { deletedAt: null } as const;

/** Tags das conversas (modal "Gerenciar Tags" da tela WhatsApp). */
@Injectable()
export class TagsAtendimentoService {
  constructor(private readonly txHost: TransactionHost<PrismaAdapter>) {}

  list(query: ListTagsAtendimentoQuery): Promise<Page<TagAtendimento>> {
    const orderBy = toOrderBy(query.sort);
    return paginate(query, {
      findMany: (page) =>
        this.txHost.tx.tagAtendimento.findMany({ where: NAO_EXCLUIDAS, orderBy, ...page }),
      count: () => this.txHost.tx.tagAtendimento.count({ where: NAO_EXCLUIDAS }),
    });
  }

  /** Nome único (sem diferenciar maiúsculas) entre as tags não excluídas. */
  async create(input: CreateTagAtendimentoInput): Promise<TagAtendimento> {
    const existente = await this.txHost.tx.tagAtendimento.findFirst({
      where: { ...NAO_EXCLUIDAS, nome: { equals: input.nome, mode: 'insensitive' } },
      select: { id: true },
    });
    if (existente) {
      throw new BusinessException(
        'TAG_ATENDIMENTO_DUPLICADA',
        `Já existe uma tag chamada '${input.nome}'.`,
        { status: 409 },
      );
    }
    return this.txHost.tx.tagAtendimento.create({ data: input });
  }

  /** Exclusão lógica: a tag sai do modal e da busca, e as conversas deixam de exibi-la. */
  async remove(id: string): Promise<TagAtendimento> {
    await this.findById(id);
    return this.txHost.tx.tagAtendimento.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  async findById(id: string): Promise<TagAtendimento> {
    const tag = isUuid(id)
      ? await this.txHost.tx.tagAtendimento.findFirst({ where: { id, ...NAO_EXCLUIDAS } })
      : null;
    if (!tag) {
      throw new BusinessException(ErrorCode.NOT_FOUND, 'Tag não encontrada', { status: 404 });
    }
    return tag;
  }
}
