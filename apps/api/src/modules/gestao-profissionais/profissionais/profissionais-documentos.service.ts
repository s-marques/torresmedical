import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable, Logger } from '@nestjs/common';
import {
  alertaDoDocumento,
  diasParaVencer,
  PROFISSIONAL_DOCUMENTO_ALERTA_60_DIAS,
  situacaoEfetiva,
  tiposObrigatorios,
  type ArquivoLink,
  type ProfissionalDocumento as DocumentoDto,
  type ProfissionalDocumentoDecisao,
  type ProfissionalDocumentoInput,
  type ProfissionalDocumentosResponse,
  type ProfissionalDocumentoTipo,
} from '@torres/shared';
import type { ProfissionalDocumento } from '../../../generated/prisma/client';
import { EscopoDadosService } from '../../../common/auth/escopo-dados.service';
import { isUuid } from '../../../common/auth/tokens';
import { RequestContextService } from '../../../common/context/request-context.service';
import { BusinessException } from '../../../common/errors/api.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import { ArquivosService } from '../../../common/storage/arquivos.service';
import { UsuariosLookupService } from '../../configuracoes-gestao/usuarios/usuarios.service';
import { hojeEmSaoPaulo } from '../salas/data-local';

const USO_ARQUIVO = 'documento-profissional';
const NAO_EXCLUIDO = { deletedAt: null } as const;

export type DocumentoAlertaDto = DocumentoDto & { profissionalNome: string };

function dataIso(valor: Date | null): string | null {
  return valor ? valor.toISOString().slice(0, 10) : null;
}

function paraData(valor: string | null): Date | null {
  return valor ? new Date(`${valor}T00:00:00.000Z`) : null;
}

function somarDias(dia: string, dias: number): string {
  const data = new Date(`${dia}T00:00:00.000Z`);
  data.setUTCDate(data.getUTCDate() + dias);
  return data.toISOString().slice(0, 10);
}

/**
 * Documentos do profissional (issue #141): upload (arquivo já enviado em `/api/arquivos`),
 * validação, remoção, link temporário de download e alertas de vencimento. A situação `VENCIDO`
 * é calculada na leitura pela validade, nunca gravada.
 */
@Injectable()
export class ProfissionaisDocumentosService {
  private readonly logger = new Logger(ProfissionaisDocumentosService.name);

  constructor(
    private readonly txHost: TransactionHost<PrismaAdapter>,
    private readonly arquivos: ArquivosService,
    private readonly usuarios: UsuariosLookupService,
    private readonly escopo: EscopoDadosService,
    private readonly contexto: RequestContextService,
  ) {}

  /** Documentos do profissional, os obrigatórios sem envio e se a documentação está completa. */
  async listar(
    profissionalId: string,
    agora = new Date(),
  ): Promise<ProfissionalDocumentosResponse> {
    const profissao = await this.garantirProfissional(profissionalId);
    const registros = await this.txHost.tx.profissionalDocumento.findMany({
      where: { profissionalId, ...NAO_EXCLUIDO },
      orderBy: [{ tipo: 'asc' }, { createdAt: 'desc' }],
    });
    const hoje = hojeEmSaoPaulo(agora);
    const data = await this.toDtos(registros, hoje);

    const obrigatorios = tiposObrigatorios(profissao);
    const pendentes = obrigatorios.filter(
      (tipo) => !data.some((d) => d.tipo === tipo && d.situacao !== 'RECUSADO'),
    );
    const documentacaoValidada = obrigatorios.every((tipo) =>
      data.some((d) => d.tipo === tipo && d.situacao === 'VALIDADO'),
    );
    return { data, pendentes: [...pendentes], documentacaoValidada };
  }

  /**
   * Documentos vencidos ou a vencer em até 60 dias, do mais urgente para o menos (insumo da
   * central de notificações, #160). Recusados ficam de fora. Respeita o escopo do usuário.
   */
  async alertas(agora = new Date()): Promise<DocumentoAlertaDto[]> {
    const hoje = hojeEmSaoPaulo(agora);
    const limite = new Date(
      `${somarDias(hoje, PROFISSIONAL_DOCUMENTO_ALERTA_60_DIAS)}T00:00:00.000Z`,
    );
    const registros = await this.txHost.tx.profissionalDocumento.findMany({
      where: {
        ...NAO_EXCLUIDO,
        situacao: { not: 'RECUSADO' },
        validade: { not: null, lte: limite },
        profissionalId: this.escopo.filtroProfissional(),
        profissional: { deletedAt: null },
      },
      include: { profissional: { select: { nome: true } } },
      orderBy: [{ validade: 'asc' }, { createdAt: 'asc' }],
    });
    const dtos = await this.toDtos(registros, hoje);
    return dtos.map((dto, indice) => ({
      ...dto,
      profissionalNome: registros[indice]?.profissional.nome ?? '',
    }));
  }

  async criar(profissionalId: string, input: ProfissionalDocumentoInput): Promise<DocumentoDto> {
    await this.garantirProfissional(profissionalId);
    await this.garantirArquivo(input.arquivoId);
    const criado = await this.txHost.tx.profissionalDocumento.create({
      data: { profissionalId, ...this.dados(input) },
    });
    return this.toDto(criado);
  }

  /** Qualquer alteração devolve o documento para `ENVIADO` e descarta a validação anterior. */
  async atualizar(
    profissionalId: string,
    documentoId: string,
    input: ProfissionalDocumentoInput,
  ): Promise<DocumentoDto> {
    await this.garantirProfissional(profissionalId);
    const atual = await this.buscar(profissionalId, documentoId);
    if (input.arquivoId !== atual.arquivoId) await this.garantirArquivo(input.arquivoId);
    const alterado = await this.txHost.tx.profissionalDocumento.update({
      where: { id: documentoId },
      data: {
        ...this.dados(input),
        situacao: 'ENVIADO',
        motivoRecusa: null,
        validadoPorId: null,
        validadoEm: null,
      },
    });
    return this.toDto(alterado);
  }

  /** Validar ou recusar (a recusa guarda o motivo). Grava quem decidiu e quando. */
  async decidir(
    profissionalId: string,
    documentoId: string,
    decisao: ProfissionalDocumentoDecisao,
  ): Promise<DocumentoDto> {
    await this.garantirProfissional(profissionalId);
    await this.buscar(profissionalId, documentoId);
    const validar = decisao.decisao === 'VALIDAR';
    const alterado = await this.txHost.tx.profissionalDocumento.update({
      where: { id: documentoId },
      data: {
        situacao: validar ? 'VALIDADO' : 'RECUSADO',
        motivoRecusa: validar ? null : decisao.motivo,
        validadoPorId: this.usuarioAtual(),
        validadoEm: new Date(),
      },
    });
    return this.toDto(alterado);
  }

  /** Exclusão lógica: o arquivo continua no storage (histórico). */
  async remover(profissionalId: string, documentoId: string): Promise<DocumentoDto> {
    await this.garantirProfissional(profissionalId);
    await this.buscar(profissionalId, documentoId);
    const removido = await this.txHost.tx.profissionalDocumento.update({
      where: { id: documentoId },
      data: { deletedAt: new Date() },
    });
    return this.toDto(removido);
  }

  /** Link temporário do arquivo do documento. A permissão e o escopo são conferidos aqui. */
  async link(profissionalId: string, documentoId: string): Promise<ArquivoLink> {
    await this.garantirProfissional(profissionalId);
    const documento = await this.buscar(profissionalId, documentoId);
    this.logger.log(
      { documentoId, profissionalId, userId: this.contexto.getUserId() },
      'Link de download de documento do profissional',
    );
    return this.arquivos.link(documento.arquivoId);
  }

  // --- Internos --------------------------------------------------------------------------

  /** Profissional existente e dentro do escopo do usuário; devolve a profissão (obrigatórios). */
  private async garantirProfissional(profissionalId: string) {
    const profissional = isUuid(profissionalId)
      ? await this.txHost.tx.profissional.findFirst({
          where: { id: profissionalId, deletedAt: null },
          select: { id: true, profissao: true },
        })
      : null;
    if (!profissional) {
      throw new BusinessException(ErrorCode.NOT_FOUND, 'Profissional não encontrado', {
        status: 404,
      });
    }
    this.escopo.garantirProfissional(profissional.id);
    return profissional.profissao;
  }

  private async buscar(
    profissionalId: string,
    documentoId: string,
  ): Promise<ProfissionalDocumento> {
    const documento = isUuid(documentoId)
      ? await this.txHost.tx.profissionalDocumento.findFirst({
          where: { id: documentoId, profissionalId, ...NAO_EXCLUIDO },
        })
      : null;
    if (!documento) {
      throw new BusinessException(ErrorCode.NOT_FOUND, 'Documento não encontrado', {
        status: 404,
      });
    }
    return documento;
  }

  private async garantirArquivo(arquivoId: string): Promise<void> {
    const arquivo = await this.arquivos.findById(arquivoId);
    if (arquivo.uso !== USO_ARQUIVO) {
      throw new BusinessException('ARQUIVO_USO_INVALIDO', 'Arquivo inválido para este campo', {
        status: 400,
        details: [{ field: 'arquivoId', message: 'O arquivo enviado não é do tipo esperado' }],
      });
    }
  }

  private dados(input: ProfissionalDocumentoInput) {
    return {
      tipo: input.tipo,
      arquivoId: input.arquivoId,
      numero: input.numero,
      emissao: paraData(input.emissao),
      validade: paraData(input.validade),
      observacao: input.observacao,
    };
  }

  private usuarioAtual(): string | null {
    const id = this.contexto.getUserId();
    return id && isUuid(id) ? id : null;
  }

  private async toDto(documento: ProfissionalDocumento): Promise<DocumentoDto> {
    const [dto] = await this.toDtos([documento], hojeEmSaoPaulo());
    return dto as DocumentoDto;
  }

  private async toDtos(
    documentos: readonly ProfissionalDocumento[],
    hoje: string,
  ): Promise<DocumentoDto[]> {
    const usuarioIds = [...new Set(documentos.map((d) => d.validadoPorId))].filter(
      (id): id is string => id !== null,
    );
    const nomes = await this.usuarios.nomesPorIds(usuarioIds);
    const nomesArquivo = new Map<string, string | null>();
    for (const id of new Set(documentos.map((d) => d.arquivoId))) {
      nomesArquivo.set(
        id,
        await this.arquivos.findById(id).then(
          (a) => a.nomeOriginal,
          () => null,
        ),
      );
    }
    return documentos.map((d) => {
      const validade = dataIso(d.validade);
      return {
        id: d.id,
        profissionalId: d.profissionalId,
        tipo: d.tipo as ProfissionalDocumentoTipo,
        arquivoId: d.arquivoId,
        arquivoNome: nomesArquivo.get(d.arquivoId) ?? null,
        numero: d.numero,
        emissao: dataIso(d.emissao),
        validade,
        observacao: d.observacao,
        situacao: situacaoEfetiva(d.situacao, validade, hoje),
        alerta: alertaDoDocumento(validade, hoje),
        diasParaVencer: validade ? diasParaVencer(validade, hoje) : null,
        motivoRecusa: d.motivoRecusa,
        validadoPorId: d.validadoPorId,
        validadoPorNome: d.validadoPorId ? (nomes.get(d.validadoPorId) ?? null) : null,
        validadoEm: d.validadoEm ? d.validadoEm.toISOString() : null,
        createdAt: d.createdAt.toISOString(),
      };
    });
  }
}
