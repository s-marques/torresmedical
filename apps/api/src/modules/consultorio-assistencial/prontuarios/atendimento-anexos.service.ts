import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import type {
  ArquivoLink,
  AtendimentoAnexo as AnexoDto,
  AtendimentoAnexoLista,
  CreateAtendimentoAnexoInput,
} from '@torres/shared';
import type { AtendimentoAnexo as AnexoModel } from '../../../generated/prisma/client';
import { isUuid } from '../../../common/auth/tokens';
import { RequestContextService } from '../../../common/context/request-context.service';
import { BusinessException } from '../../../common/errors/api.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import { ArquivosService } from '../../../common/storage/arquivos.service';
import { UsuariosLookupService } from '../../configuracoes-gestao/usuarios/usuarios.service';
import { AtendimentoAcessoService, atendimentoAssinado } from './atendimento-acesso.service';

const USO_ARQUIVO = 'anexo-atendimento';
const NAO_EXCLUIDO = { deletedAt: null } as const;

function paraData(valor: string): Date {
  return new Date(`${valor}T00:00:00.000Z`);
}

/**
 * Exames e anexos do atendimento (issue #151). O arquivo é enviado antes em `/api/arquivos`
 * (uso `anexo-atendimento`, privado) e aqui só se vincula ao atendimento. O download é por link
 * temporário, emitido depois de conferir o escopo do profissional responsável.
 */
@Injectable()
export class AtendimentoAnexosService {
  constructor(
    private readonly txHost: TransactionHost<PrismaAdapter>,
    private readonly acesso: AtendimentoAcessoService,
    private readonly arquivos: ArquivosService,
    private readonly usuarios: UsuariosLookupService,
    private readonly contexto: RequestContextService,
  ) {}

  async listar(pacienteId: string, atendimentoId: string): Promise<AtendimentoAnexoLista> {
    const atendimento = await this.acesso.carregar(pacienteId, atendimentoId, 'ANEXOS');
    const anexos = await this.txHost.tx.atendimentoAnexo.findMany({
      where: { atendimentoId: atendimento.id, ...NAO_EXCLUIDO },
      orderBy: [{ data: 'desc' }, { createdAt: 'desc' }],
    });
    return { data: await this.paraDtos(anexos) };
  }

  /** Anexar também vale depois da assinatura: o exame pode chegar depois do atendimento. */
  async criar(
    pacienteId: string,
    atendimentoId: string,
    input: CreateAtendimentoAnexoInput,
  ): Promise<AnexoDto> {
    const atendimento = await this.acesso.carregar(pacienteId, atendimentoId);
    const arquivo = await this.arquivos.findById(input.arquivoId);
    if (arquivo.uso !== USO_ARQUIVO) {
      throw new BusinessException('ARQUIVO_USO_INVALIDO', 'Arquivo inválido para este campo', {
        status: 400,
        details: [{ field: 'arquivoId', message: 'O arquivo enviado não é do tipo esperado' }],
      });
    }
    const criado = await this.txHost.tx.atendimentoAnexo.create({
      data: {
        atendimentoId: atendimento.id,
        tipo: input.tipo,
        arquivoId: input.arquivoId,
        data: paraData(input.data),
        descricao: input.descricao,
        criadoPorId: this.contexto.getUserId() ?? null,
      },
    });
    return (await this.paraDtos([criado]))[0] as AnexoDto;
  }

  /** Exclusão lógica; atendimento assinado mantém os exames (409). */
  async remover(pacienteId: string, atendimentoId: string, anexoId: string): Promise<AnexoDto> {
    const atendimento = await this.acesso.carregar(pacienteId, atendimentoId);
    if (atendimento.assinadoEm) throw atendimentoAssinado();
    const anexo = await this.buscar(atendimento.id, anexoId);
    const removido = await this.txHost.tx.atendimentoAnexo.update({
      where: { id: anexo.id },
      data: { deletedAt: new Date() },
    });
    return (await this.paraDtos([removido]))[0] as AnexoDto;
  }

  /** Link temporário de download. O escopo do responsável é conferido antes de gerar o link. */
  async link(pacienteId: string, atendimentoId: string, anexoId: string): Promise<ArquivoLink> {
    const atendimento = await this.acesso.carregar(pacienteId, atendimentoId, 'ANEXOS');
    const anexo = await this.buscar(atendimento.id, anexoId);
    return this.arquivos.link(anexo.arquivoId);
  }

  // --- Internos ----------------------------------------------------------------------------

  private async buscar(atendimentoId: string, anexoId: string): Promise<AnexoModel> {
    const anexo = isUuid(anexoId)
      ? await this.txHost.tx.atendimentoAnexo.findFirst({
          where: { id: anexoId, atendimentoId, ...NAO_EXCLUIDO },
        })
      : null;
    if (!anexo) {
      throw new BusinessException(ErrorCode.NOT_FOUND, 'Anexo não encontrado', { status: 404 });
    }
    return anexo;
  }

  private async paraDtos(anexos: readonly AnexoModel[]): Promise<AnexoDto[]> {
    const usuarioIds = anexos.flatMap((a) =>
      a.criadoPorId && isUuid(a.criadoPorId) ? [a.criadoPorId] : [],
    );
    const nomes = await this.usuarios.nomesPorIds(usuarioIds);
    const arquivos = new Map<string, string | null>();
    for (const id of new Set(anexos.map((a) => a.arquivoId))) {
      arquivos.set(
        id,
        await this.arquivos.findById(id).then(
          (a) => a.nomeOriginal,
          () => null,
        ),
      );
    }
    return anexos.map((a) => ({
      id: a.id,
      atendimentoId: a.atendimentoId,
      tipo: a.tipo,
      arquivoId: a.arquivoId,
      arquivoNome: arquivos.get(a.arquivoId) ?? null,
      data: a.data.toISOString().slice(0, 10),
      descricao: a.descricao,
      criadoPorNome: a.criadoPorId ? (nomes.get(a.criadoPorId) ?? null) : null,
      createdAt: a.createdAt.toISOString(),
    }));
  }
}
