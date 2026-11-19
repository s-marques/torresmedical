import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import type {
  CreateDocumentoConhecimentoInput,
  ListDocumentosConhecimentoQuery,
  UpdateDocumentoConhecimentoInput,
} from '@torres/shared';
import { Prisma, type DocumentoConhecimento } from '../../../generated/prisma/client';
import { BusinessException } from '../../../common/errors/api.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import { paginate, searchWhere, toOrderBy, type Page } from '../../../common/pagination/paginate';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';

export const PROFISSIONAL_INVALIDO = 'Profissional não encontrado';

/**
 * Documentos que o agente de IA usa para responder pacientes (tela Base de Conhecimento).
 * Toda gravação indexa o documento ("Salvar e Indexar"); a indexação para a IA em si é da #174.
 */
@Injectable()
export class BaseConhecimentoService {
  constructor(private readonly txHost: TransactionHost<PrismaAdapter>) {}

  list(query: ListDocumentosConhecimentoQuery): Promise<Page<DocumentoConhecimento>> {
    const where: Prisma.DocumentoConhecimentoWhereInput = {
      deletedAt: null,
      categoria: query.categoria,
      AND: [
        // Filtrar por profissional traz também os gerais (sem profissional).
        query.profissionalId
          ? { OR: [{ profissionalId: query.profissionalId }, { profissionalId: null }] }
          : {},
        searchWhere(query.search, ['titulo', 'conteudo']) ?? {},
      ],
    };
    const orderBy = toOrderBy(query.sort);
    return paginate(query, {
      findMany: (page) =>
        this.txHost.tx.documentoConhecimento.findMany({ where, orderBy, ...page }),
      count: () => this.txHost.tx.documentoConhecimento.count({ where }),
    });
  }

  async findById(id: string): Promise<DocumentoConhecimento> {
    const documento = await this.txHost.tx.documentoConhecimento.findFirst({
      where: { id, deletedAt: null },
    });
    if (!documento) {
      throw new BusinessException(ErrorCode.NOT_FOUND, 'Documento não encontrado', {
        status: 404,
      });
    }
    return documento;
  }

  create(input: CreateDocumentoConhecimentoInput): Promise<DocumentoConhecimento> {
    return this.gravar(() =>
      this.txHost.tx.documentoConhecimento.create({
        data: { ...input, indexadoEm: new Date() },
      }),
    );
  }

  /** Substitui todos os campos: o modal Editar envia o formulário inteiro. */
  async update(
    id: string,
    input: UpdateDocumentoConhecimentoInput,
  ): Promise<DocumentoConhecimento> {
    await this.findById(id);
    return this.gravar(() =>
      this.txHost.tx.documentoConhecimento.update({
        where: { id },
        data: { ...input, indexadoEm: new Date() },
      }),
    );
  }

  /**
   * O profissional é de outro módulo: a FK valida o id e a violação vira erro no campo
   * Profissional (mesmo padrão de Canais WhatsApp).
   */
  private async gravar<T>(operacao: () => Promise<T>): Promise<T> {
    try {
      return await operacao();
    } catch (erro) {
      if (
        erro instanceof Prisma.PrismaClientKnownRequestError &&
        (erro.code === 'P2003' || erro.code === 'P2025')
      ) {
        throw new BusinessException('PROFISSIONAL_INVALIDO', PROFISSIONAL_INVALIDO, {
          status: 400,
          details: [{ field: 'profissionalId', message: PROFISSIONAL_INVALIDO }],
        });
      }
      throw erro;
    }
  }
}
