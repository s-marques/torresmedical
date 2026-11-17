import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import {
  gerarCodigoOrigemCliente,
  type Estagio,
  type EstagioInput,
  type MotivoPerda,
  type MotivoPerdaInput,
  type Pipeline,
  type PipelineInput,
} from '@torres/shared';
import type {
  EstagioPipeline,
  MotivoPerda as MotivoPerdaRow,
  Pipeline as PipelineRow,
} from '../../../generated/prisma/client';
import { BusinessException } from '../../../common/errors/api.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import { isUuid } from '../../../common/auth/tokens';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';

const NAO_EXCLUIDOS = { deletedAt: null } as const;
const POR_ORDEM = [{ ordem: 'asc' }, { id: 'asc' }] as const;

function naoEncontrado(mensagem: string): BusinessException {
  return new BusinessException(ErrorCode.NOT_FOUND, mensagem, { status: 404 });
}

export function toEstagio(estagio: EstagioPipeline, quantidade = 0): Estagio {
  return {
    id: estagio.id,
    pipelineId: estagio.pipelineId,
    nome: estagio.nome,
    cor: estagio.cor,
    marco: estagio.marco,
    ordem: estagio.ordem,
    quantidade,
  };
}

function toMotivoPerda(motivo: MotivoPerdaRow): MotivoPerda {
  return { id: motivo.id, nome: motivo.nome, codigo: motivo.codigo, ordem: motivo.ordem };
}

/**
 * Modal "Configurações do CRM" da tela Pipeline (`/crm`): pipelines, estágios e motivos de perda.
 * As origens do negócio são as Origens de Cliente (OrigensClienteService).
 */
@Injectable()
export class CrmConfigService {
  constructor(private readonly txHost: TransactionHost<PrismaAdapter>) {}

  // ---------- Pipelines ----------

  /** Pipelines com os estágios e a quantidade de negócios (abertos, ganhos e perdidos) de cada um. */
  async listPipelines(): Promise<Pipeline[]> {
    const pipelines = await this.txHost.tx.pipeline.findMany({
      where: NAO_EXCLUIDOS,
      orderBy: [...POR_ORDEM],
      include: { estagios: { where: NAO_EXCLUIDOS, orderBy: [...POR_ORDEM] } },
    });
    const contagem = await this.contarPorEstagio();
    return pipelines.map((p) => this.toPipeline(p, p.estagios, contagem));
  }

  async findPipeline(id: string): Promise<Pipeline> {
    const pipeline = await this.buscarPipeline(id);
    const estagios = await this.txHost.tx.estagioPipeline.findMany({
      where: { pipelineId: id, ...NAO_EXCLUIDOS },
      orderBy: [...POR_ORDEM],
    });
    return this.toPipeline(pipeline, estagios, await this.contarPorEstagio(id));
  }

  /** "Nome do novo pipeline" + Criar: entra no fim da lista, ainda sem estágios. */
  async createPipeline(input: PipelineInput): Promise<Pipeline> {
    await this.garantirNomePipelineLivre(input.nome);
    const ultima = await this.txHost.tx.pipeline.aggregate({ _max: { ordem: true } });
    const criado = await this.txHost.tx.pipeline.create({
      data: { nome: input.nome, ordem: (ultima._max.ordem ?? 0) + 1 },
    });
    return this.toPipeline(criado, [], new Map());
  }

  async updatePipeline(id: string, input: PipelineInput): Promise<Pipeline> {
    await this.buscarPipeline(id);
    await this.garantirNomePipelineLivre(input.nome, id);
    await this.txHost.tx.pipeline.update({ where: { id }, data: { nome: input.nome } });
    return this.findPipeline(id);
  }

  /** Exclusão lógica do pipeline e dos estágios. Só sem negócios. */
  async removePipeline(id: string): Promise<Pipeline> {
    const pipeline = await this.findPipeline(id);
    const negocios = await this.txHost.tx.negocio.count({
      where: { pipelineId: id, ...NAO_EXCLUIDOS },
    });
    if (negocios > 0) {
      throw new BusinessException(
        'PIPELINE_EM_USO',
        'Não é possível excluir: há negócios neste pipeline.',
        { status: 409 },
      );
    }
    const agora = new Date();
    await this.txHost.tx.estagioPipeline.updateMany({
      where: { pipelineId: id, ...NAO_EXCLUIDOS },
      data: { deletedAt: agora },
    });
    await this.txHost.tx.pipeline.update({ where: { id }, data: { deletedAt: agora } });
    return pipeline;
  }

  // ---------- Estágios ----------

  /** "Adicionar estágio": entra no fim do pipeline. */
  async createEstagio(pipelineId: string, input: EstagioInput): Promise<Estagio> {
    await this.buscarPipeline(pipelineId);
    const ultima = await this.txHost.tx.estagioPipeline.aggregate({
      where: { pipelineId },
      _max: { ordem: true },
    });
    const criado = await this.txHost.tx.estagioPipeline.create({
      data: { pipelineId, ...input, ordem: (ultima._max.ordem ?? 0) + 1 },
    });
    return toEstagio(criado);
  }

  async updateEstagio(id: string, input: EstagioInput): Promise<Estagio> {
    await this.buscarEstagio(id);
    const alterado = await this.txHost.tx.estagioPipeline.update({ where: { id }, data: input });
    return toEstagio(alterado, await this.contarNoEstagio(id));
  }

  /** Exclusão lógica. Só sem negócios no estágio. */
  async removeEstagio(id: string): Promise<Estagio> {
    await this.buscarEstagio(id);
    if ((await this.contarNoEstagio(id)) > 0) {
      throw new BusinessException(
        'ESTAGIO_EM_USO',
        'Não é possível excluir: há negócios neste estágio. Mova-os antes.',
        { status: 409 },
      );
    }
    const excluido = await this.txHost.tx.estagioPipeline.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return toEstagio(excluido);
  }

  /** Estágio não excluído (para o negócio). */
  /** Primeiro estágio do pipeline informado ou, sem ele, do primeiro pipeline da lista. */
  async primeiroEstagio(pipelineId?: string): Promise<EstagioPipeline> {
    const pipeline = pipelineId
      ? await this.buscarPipeline(pipelineId)
      : await this.txHost.tx.pipeline.findFirst({
          where: NAO_EXCLUIDOS,
          orderBy: [...POR_ORDEM],
        });
    const estagio = pipeline
      ? await this.txHost.tx.estagioPipeline.findFirst({
          where: { pipelineId: pipeline.id, ...NAO_EXCLUIDOS },
          orderBy: [...POR_ORDEM],
        })
      : null;
    if (!estagio) {
      throw new BusinessException(
        'PIPELINE_SEM_ESTAGIO',
        'Cadastre um pipeline com ao menos um estágio antes de criar negócios.',
      );
    }
    return estagio;
  }

  async buscarEstagio(id: string): Promise<EstagioPipeline> {
    const estagio = isUuid(id)
      ? await this.txHost.tx.estagioPipeline.findFirst({ where: { id, ...NAO_EXCLUIDOS } })
      : null;
    if (!estagio) throw naoEncontrado('Estágio não encontrado');
    return estagio;
  }

  // ---------- Motivos de perda ----------

  async listMotivosPerda(): Promise<MotivoPerda[]> {
    const motivos = await this.txHost.tx.motivoPerda.findMany({
      where: NAO_EXCLUIDOS,
      orderBy: [...POR_ORDEM],
    });
    return motivos.map(toMotivoPerda);
  }

  /** "Nome do motivo" + Adicionar: o código vem do nome e o motivo entra no fim da lista. */
  async createMotivoPerda(input: MotivoPerdaInput): Promise<MotivoPerda> {
    const codigo = this.codigoDe(input.nome);
    await this.garantirMotivoLivre(input.nome, codigo);
    const ultima = await this.txHost.tx.motivoPerda.aggregate({ _max: { ordem: true } });
    const criado = await this.txHost.tx.motivoPerda.create({
      data: { nome: input.nome, codigo, ordem: (ultima._max.ordem ?? 0) + 1 },
    });
    return toMotivoPerda(criado);
  }

  /** Renomear: o código gerado na criação não muda. */
  async updateMotivoPerda(id: string, input: MotivoPerdaInput): Promise<MotivoPerda> {
    await this.buscarMotivoPerda(id);
    this.codigoDe(input.nome);
    await this.garantirMotivoLivre(input.nome, undefined, id);
    const alterado = await this.txHost.tx.motivoPerda.update({
      where: { id },
      data: { nome: input.nome },
    });
    return toMotivoPerda(alterado);
  }

  /** Exclusão lógica. Só se nenhum negócio perdido usar o motivo. */
  async removeMotivoPerda(id: string): Promise<MotivoPerda> {
    await this.buscarMotivoPerda(id);
    const emUso = await this.txHost.tx.negocio.count({
      where: { motivoPerdaId: id, ...NAO_EXCLUIDOS },
    });
    if (emUso > 0) {
      throw new BusinessException(
        'MOTIVO_PERDA_EM_USO',
        'Não é possível excluir: há negócios perdidos com este motivo.',
        { status: 409 },
      );
    }
    const excluido = await this.txHost.tx.motivoPerda.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return toMotivoPerda(excluido);
  }

  async buscarMotivoPerda(id: string): Promise<MotivoPerdaRow> {
    const motivo = isUuid(id)
      ? await this.txHost.tx.motivoPerda.findFirst({ where: { id, ...NAO_EXCLUIDOS } })
      : null;
    if (!motivo) throw naoEncontrado('Motivo de perda não encontrado');
    return motivo;
  }

  // ---------- Apoio ----------

  async buscarPipeline(id: string): Promise<PipelineRow> {
    const pipeline = isUuid(id)
      ? await this.txHost.tx.pipeline.findFirst({ where: { id, ...NAO_EXCLUIDOS } })
      : null;
    if (!pipeline) throw naoEncontrado('Pipeline não encontrado');
    return pipeline;
  }

  private toPipeline(
    pipeline: PipelineRow,
    estagios: readonly EstagioPipeline[],
    contagem: ReadonlyMap<string, number>,
  ): Pipeline {
    return {
      id: pipeline.id,
      nome: pipeline.nome,
      ordem: pipeline.ordem,
      estagios: estagios.map((e) => toEstagio(e, contagem.get(e.id) ?? 0)),
    };
  }

  private async contarPorEstagio(pipelineId?: string): Promise<Map<string, number>> {
    const grupos = await this.txHost.tx.negocio.groupBy({
      by: ['estagioId'],
      where: { ...NAO_EXCLUIDOS, ...(pipelineId ? { pipelineId } : {}) },
      _count: { _all: true },
    });
    return new Map(grupos.map((g) => [g.estagioId, g._count._all]));
  }

  private contarNoEstagio(estagioId: string): Promise<number> {
    return this.txHost.tx.negocio.count({ where: { estagioId, ...NAO_EXCLUIDOS } });
  }

  private async garantirNomePipelineLivre(nome: string, ignorarId?: string): Promise<void> {
    const existente = await this.txHost.tx.pipeline.findFirst({
      where: {
        ...NAO_EXCLUIDOS,
        id: ignorarId ? { not: ignorarId } : undefined,
        nome: { equals: nome, mode: 'insensitive' },
      },
      select: { id: true },
    });
    if (existente) {
      throw new BusinessException(
        'PIPELINE_DUPLICADO',
        `Já existe um pipeline chamado '${nome}'.`,
        {
          status: 409,
        },
      );
    }
  }

  private codigoDe(nome: string): string {
    const codigo = gerarCodigoOrigemCliente(nome);
    if (!codigo) {
      throw new BusinessException('MOTIVO_PERDA_NOME_INVALIDO', 'Nome inválido', {
        status: 400,
        details: [{ field: 'nome', message: 'Use letras ou números no nome' }],
      });
    }
    return codigo;
  }

  private async garantirMotivoLivre(
    nome: string,
    codigo: string | undefined,
    ignorarId?: string,
  ): Promise<void> {
    const existente = await this.txHost.tx.motivoPerda.findFirst({
      where: {
        ...NAO_EXCLUIDOS,
        id: ignorarId ? { not: ignorarId } : undefined,
        OR: [{ nome: { equals: nome, mode: 'insensitive' } }, ...(codigo ? [{ codigo }] : [])],
      },
      select: { id: true },
    });
    if (existente) {
      throw new BusinessException(
        'MOTIVO_PERDA_DUPLICADO',
        `Já existe um motivo chamado '${nome}'.`,
        { status: 409 },
      );
    }
  }
}
