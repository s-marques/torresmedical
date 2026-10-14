import { TransactionHost } from '@nestjs-cls/transactional';
import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  ARQUIVO_CAMPO,
  ARQUIVO_FORMATOS,
  ARQUIVO_OBRIGATORIO_MENSAGEM,
  formatoDoArquivo,
  validarArquivo,
  type ArquivoConteudoQuery,
  type ArquivoLink,
  type ArquivoUso,
} from '@torres/shared';
import { randomUUID } from 'node:crypto';
import type { Readable } from 'node:stream';
import type { Arquivo } from '../../generated/prisma/client';
import { RequestContextService } from '../context/request-context.service';
import { BusinessException, ValidationException } from '../errors/api.exception';
import { ErrorCode } from '../errors/error-codes';
import type { PrismaAdapter } from '../prisma/prisma-transaction';
import { conteudoConfere } from './content-signature';
import { STORAGE_DRIVER, type StorageDriver } from './drivers/storage-driver';
import { UrlSigner } from './signed-url';
import { STORAGE_CONFIG, type StorageConfig } from './storage.config';

/** Arquivo recebido no multipart (subconjunto do `Express.Multer.File`). */
export interface ArquivoRecebido {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

/** Metadados expostos: a chave interna do storage não sai da API. */
export type ArquivoDto = Omit<Arquivo, 'chave' | 'deletedAt'>;

export interface ConteudoArquivo {
  arquivo: ArquivoDto;
  stream: Readable;
}

const NOME_MAX = 255;
const SEM_CHAVE = { chave: true, deletedAt: true } as const;

/**
 * Serviço comum de arquivos (upload, metadados, link temporário e download).
 * Exportado para os módulos que guardam arquivos (avatar, logo, XML de NF-e...).
 */
@Injectable()
export class ArquivosService {
  private readonly logger = new Logger(ArquivosService.name);
  private readonly signer: UrlSigner;

  constructor(
    private readonly txHost: TransactionHost<PrismaAdapter>,
    private readonly context: RequestContextService,
    @Inject(STORAGE_DRIVER) private readonly storage: StorageDriver,
    @Inject(STORAGE_CONFIG) private readonly config: StorageConfig,
  ) {
    this.signer = new UrlSigner(config.urlSecret);
  }

  /** Valida tipo, tamanho e conteúdo, grava no storage com nome aleatório e registra os metadados. */
  async upload(uso: ArquivoUso, recebido: ArquivoRecebido | undefined): Promise<ArquivoDto> {
    if (!recebido) throw invalido(ARQUIVO_OBRIGATORIO_MENSAGEM);
    const nomeOriginal = sanitizarNome(recebido.originalname);
    const erro = validarArquivo(
      { nome: nomeOriginal, tipo: recebido.mimetype, tamanho: recebido.size },
      uso,
    );
    if (erro) throw invalido(erro);

    // validarArquivo garante que a extensão pertence ao uso.
    const formato = formatoDoArquivo(nomeOriginal, uso) as NonNullable<
      ReturnType<typeof formatoDoArquivo>
    >;
    if (!conteudoConfere(recebido.buffer, formato)) {
      throw invalido('O conteúdo do arquivo não corresponde ao tipo informado');
    }

    const chave = gerarChave(uso);
    const contentType = ARQUIVO_FORMATOS[formato].mimes[0];
    await this.storage.put(chave, recebido.buffer, contentType);
    try {
      return await this.txHost.tx.arquivo.create({
        data: {
          uso,
          nomeOriginal,
          contentType,
          tamanho: recebido.size,
          chave,
          criadoPor: this.context.getUserId() ?? null,
        },
        omit: SEM_CHAVE,
      });
    } catch (error) {
      // Sem registro no banco, o objeto ficaria órfão no storage.
      await this.storage.delete(chave).catch(() => undefined);
      throw error;
    }
  }

  async findById(id: string): Promise<ArquivoDto> {
    const arquivo = await this.txHost.tx.arquivo.findFirst({
      where: { id, deletedAt: null },
      omit: SEM_CHAVE,
    });
    if (!arquivo) throw naoEncontrado();
    return arquivo;
  }

  /** URL relativa e temporária para `<img src>`/`<a href>`, que não enviam o header de autenticação. */
  async link(id: string, agora = Date.now()): Promise<ArquivoLink> {
    await this.findById(id);
    const expira = Math.floor(agora / 1000) + this.config.urlTtlSeconds;
    const query = new URLSearchParams({
      expira: String(expira),
      assinatura: this.signer.sign(id, expira),
    });
    return {
      url: `/api/arquivos/${id}/conteudo?${query.toString()}`,
      expiraEm: new Date(expira * 1000).toISOString(),
    };
  }

  /** Confere a assinatura da URL e devolve o conteúdo do arquivo. */
  async conteudo(id: string, query: ArquivoConteudoQuery): Promise<ConteudoArquivo> {
    const verificacao = this.signer.verify(id, query.expira, query.assinatura);
    if (verificacao === 'invalido') {
      throw new BusinessException('LINK_INVALIDO', 'Link de download inválido', { status: 403 });
    }
    if (verificacao === 'expirado') {
      throw new BusinessException('LINK_EXPIRADO', 'Link de download expirado. Gere um novo', {
        status: 403,
      });
    }

    const registro = await this.txHost.tx.arquivo.findFirst({ where: { id, deletedAt: null } });
    if (!registro) throw naoEncontrado();
    const stream = await this.storage.get(registro.chave);
    if (!stream) {
      this.logger.error({ arquivoId: id }, 'Arquivo registrado sem conteúdo no storage');
      throw naoEncontrado();
    }
    this.logger.log({ arquivoId: id, userId: this.context.getUserId() }, 'Download de arquivo');
    return { arquivo: toDto(registro), stream };
  }

  /** Exclusão lógica: o objeto fica no storage (arquivos podem integrar histórico clínico). */
  async remove(id: string): Promise<ArquivoDto> {
    await this.findById(id);
    return this.txHost.tx.arquivo.update({
      where: { id },
      data: { deletedAt: new Date() },
      omit: SEM_CHAVE,
    });
  }
}

function toDto({
  id,
  uso,
  nomeOriginal,
  contentType,
  tamanho,
  criadoPor,
  createdAt,
}: Arquivo): ArquivoDto {
  return { id, uso, nomeOriginal, contentType, tamanho, criadoPor, createdAt };
}

function invalido(message: string): ValidationException {
  return new ValidationException([{ field: ARQUIVO_CAMPO, message }]);
}

function naoEncontrado(): BusinessException {
  return new BusinessException(ErrorCode.NOT_FOUND, 'Arquivo não encontrado', { status: 404 });
}

/** `<uso>/<aaaa>/<mm>/<uuid>`: sem o nome original nem a extensão. */
export function gerarChave(uso: ArquivoUso, agora = new Date()): string {
  const mes = String(agora.getUTCMonth() + 1).padStart(2, '0');
  return `${uso}/${agora.getUTCFullYear()}/${mes}/${randomUUID()}`;
}

/** Só o nome (sem caminho), sem caracteres de controle e com no máximo 255 caracteres. */
export function sanitizarNome(nome: string): string {
  const base = nome.split(/[/\\]/).pop() ?? '';
  // eslint-disable-next-line no-control-regex
  const limpo = base.replaceAll(/[\u0000-\u001f\u007f]/g, '').trim();
  if (limpo.length <= NOME_MAX) return limpo;
  const ponto = limpo.lastIndexOf('.');
  const extensao = ponto > 0 && limpo.length - ponto <= 10 ? limpo.slice(ponto) : '';
  return limpo.slice(0, NOME_MAX - extensao.length) + extensao;
}
