import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import type {
  AtendimentoDocumento as DocumentoDto,
  AtendimentoDocumentoLista,
  CreateAtendimentoDocumentoInput,
} from '@torres/shared';
import type { AtendimentoDocumento as DocumentoModel } from '../../../generated/prisma/client';
import { isUuid } from '../../../common/auth/tokens';
import { RequestContextService } from '../../../common/context/request-context.service';
import { BusinessException } from '../../../common/errors/api.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import { UsuariosLookupService } from '../../configuracoes-gestao/usuarios/usuarios.service';
import { AtendimentoAcessoService, atendimentoAssinado } from './atendimento-acesso.service';

const NAO_EXCLUIDO = { deletedAt: null } as const;

/**
 * Documentos emitidos no atendimento: atestado, declaração e solicitação de exame (issue #151).
 * Guarda tipo, texto e data de emissão. PDF com timbre e modelos ficam para a #152.
 */
@Injectable()
export class AtendimentoDocumentosService {
  constructor(
    private readonly txHost: TransactionHost<PrismaAdapter>,
    private readonly acesso: AtendimentoAcessoService,
    private readonly usuarios: UsuariosLookupService,
    private readonly contexto: RequestContextService,
  ) {}

  async listar(pacienteId: string, atendimentoId: string): Promise<AtendimentoDocumentoLista> {
    const atendimento = await this.acesso.carregar(pacienteId, atendimentoId, 'DOCUMENTOS');
    const documentos = await this.txHost.tx.atendimentoDocumento.findMany({
      where: { atendimentoId: atendimento.id, ...NAO_EXCLUIDO },
      orderBy: [{ dataEmissao: 'desc' }, { createdAt: 'desc' }],
    });
    return { data: await this.paraDtos(documentos) };
  }

  /** Emitir também vale depois da assinatura: o atestado pode ser pedido depois da consulta. */
  async criar(
    pacienteId: string,
    atendimentoId: string,
    input: CreateAtendimentoDocumentoInput,
  ): Promise<DocumentoDto> {
    const atendimento = await this.acesso.carregar(pacienteId, atendimentoId);
    const criado = await this.txHost.tx.atendimentoDocumento.create({
      data: {
        atendimentoId: atendimento.id,
        tipo: input.tipo,
        texto: input.texto,
        dataEmissao: new Date(`${input.dataEmissao}T00:00:00.000Z`),
        criadoPorId: this.contexto.getUserId() ?? null,
      },
    });
    return (await this.paraDtos([criado]))[0] as DocumentoDto;
  }

  /** Exclusão lógica; atendimento assinado mantém os documentos (409). */
  async remover(
    pacienteId: string,
    atendimentoId: string,
    documentoId: string,
  ): Promise<DocumentoDto> {
    const atendimento = await this.acesso.carregar(pacienteId, atendimentoId);
    if (atendimento.assinadoEm) throw atendimentoAssinado();
    const documento = isUuid(documentoId)
      ? await this.txHost.tx.atendimentoDocumento.findFirst({
          where: { id: documentoId, atendimentoId: atendimento.id, ...NAO_EXCLUIDO },
        })
      : null;
    if (!documento) {
      throw new BusinessException(ErrorCode.NOT_FOUND, 'Documento não encontrado', {
        status: 404,
      });
    }
    const removido = await this.txHost.tx.atendimentoDocumento.update({
      where: { id: documento.id },
      data: { deletedAt: new Date() },
    });
    return (await this.paraDtos([removido]))[0] as DocumentoDto;
  }

  private async paraDtos(documentos: readonly DocumentoModel[]): Promise<DocumentoDto[]> {
    const usuarioIds = documentos.flatMap((d) =>
      d.criadoPorId && isUuid(d.criadoPorId) ? [d.criadoPorId] : [],
    );
    const nomes = await this.usuarios.nomesPorIds(usuarioIds);
    return documentos.map((d) => ({
      id: d.id,
      atendimentoId: d.atendimentoId,
      tipo: d.tipo,
      texto: d.texto,
      dataEmissao: d.dataEmissao.toISOString().slice(0, 10),
      criadoPorNome: d.criadoPorId ? (nomes.get(d.criadoPorId) ?? null) : null,
      createdAt: d.createdAt.toISOString(),
    }));
  }
}
