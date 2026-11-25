import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import {
  normalizarRespostas,
  validarRespostas,
  type AtendimentoModelo,
  type CreateModeloPadraoInput,
  type CreateModeloProprioInput,
  type ListModelosQuery,
  type ModeloProntuario as ModeloDto,
  type ModeloRespostas,
  type ModeloSecoes,
  type UpdateModeloInput,
} from '@torres/shared';
import { EscopoDadosService } from '../../../common/auth/escopo-dados.service';
import { isUuid } from '../../../common/auth/tokens';
import { BusinessException, ValidationException } from '../../../common/errors/api.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import { paginate, searchWhere, toOrderBy, type Page } from '../../../common/pagination/paginate';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import type {
  ModeloProntuario,
  ModeloProntuarioVersao,
  Prisma,
} from '../../../generated/prisma/client';
import { ProfissionaisService } from '../../gestao-profissionais/profissionais/profissionais.service';

const NAO_EXCLUIDOS = { deletedAt: null } as const;
const VERSAO_ATUAL = { versoes: { orderBy: { numero: 'desc' as const }, take: 1 } };

type ModeloComVersao = ModeloProntuario & { versoes: ModeloProntuarioVersao[] };

function naoEncontrado(): BusinessException {
  return new BusinessException(ErrorCode.NOT_FOUND, 'Modelo não encontrado', { status: 404 });
}

/** JSON com as chaves em ordem fixa: o jsonb do Postgres não preserva a ordem de gravação. */
function canonico(valor: unknown): string {
  return JSON.stringify(valor, (_chave, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)))
      : v,
  );
}

const secoesDe = (versao: Pick<ModeloProntuarioVersao, 'secoes'>) =>
  versao.secoes as unknown as ModeloSecoes;

/** Cópia da versão que o atendimento usou (nome e seções daquele momento). */
export function toAtendimentoModelo(versao: ModeloProntuarioVersao): AtendimentoModelo {
  return {
    modeloId: versao.modeloId,
    versaoId: versao.id,
    nome: versao.nome,
    versao: versao.numero,
    secoes: secoesDe(versao),
  };
}

/**
 * Modelos de prontuário por profissão e especialidade (issue #152). O modelo guarda as seções e
 * campos em versões imutáveis: alterar nome ou seções cria uma versão nova, e o atendimento
 * continua apontando para a versão que usou. Modelo padrão (`profissionalId` nulo) é da clínica
 * e só a gerência altera (rotas `/padrao`); modelo próprio é de um profissional do escopo do usuário.
 */
@Injectable()
export class ModelosProntuarioService {
  constructor(
    private readonly txHost: TransactionHost<PrismaAdapter>,
    private readonly profissionais: ProfissionaisService,
    private readonly escopo: EscopoDadosService,
  ) {}

  async listar(query: ListModelosQuery): Promise<Page<ModeloDto>> {
    const where = this.where(query);
    const pagina = await paginate(query, {
      findMany: (p) =>
        this.txHost.tx.modeloProntuario.findMany({
          where,
          include: VERSAO_ATUAL,
          orderBy: toOrderBy(query.sort),
          ...p,
        }),
      count: () => this.txHost.tx.modeloProntuario.count({ where }),
    });
    const nomes = await this.nomes(pagina.data);
    return { ...pagina, data: pagina.data.map((m) => this.toDto(m, nomes)) };
  }

  async detalhe(id: string): Promise<ModeloDto> {
    const modelo = await this.buscar(id);
    this.garantirVisivel(modelo);
    return this.toDto(modelo, await this.nomes([modelo]));
  }

  async criarPadrao(input: CreateModeloPadraoInput): Promise<ModeloDto> {
    return this.criar(input, null);
  }

  async criarProprio(input: CreateModeloProprioInput): Promise<ModeloDto> {
    this.escopo.garantirProfissional(input.profissionalId);
    await this.profissionais.garantirExiste(input.profissionalId);
    return this.criar(input, input.profissionalId);
  }

  /** Altera o modelo. Mudou nome ou seções: nova versão; os atendimentos antigos não mudam. */
  async atualizar(id: string, input: UpdateModeloInput, padrao: boolean): Promise<ModeloDto> {
    const atual = await this.buscar(id, padrao);
    const versao = atual.versoes[0];
    if (!versao) throw naoEncontrado();

    const nome = input.nome ?? atual.nome;
    const secoes = input.secoes ?? secoesDe(versao);
    const mudouConteudo = nome !== versao.nome || canonico(secoes) !== canonico(secoesDe(versao));
    const numero = mudouConteudo ? atual.versaoAtual + 1 : atual.versaoAtual;

    await this.txHost.tx.modeloProntuario.update({
      where: { id },
      data: {
        nome,
        profissao: input.profissao,
        especialidade: input.especialidade,
        ativo: input.ativo,
        versaoAtual: numero,
        ...(mudouConteudo
          ? { versoes: { create: { numero, nome, secoes: secoes as unknown as object } } }
          : {}),
      },
    });
    return this.detalheInterno(id);
  }

  /** Exclusão lógica: os atendimentos já registrados continuam com a versão que usaram. */
  async excluir(id: string, padrao: boolean): Promise<ModeloDto> {
    await this.buscar(id, padrao);
    await this.txHost.tx.modeloProntuario.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    const excluido = await this.txHost.tx.modeloProntuario.findUniqueOrThrow({
      where: { id },
      include: VERSAO_ATUAL,
    });
    return this.toDto(excluido, await this.nomes([excluido]));
  }

  // --- Uso no atendimento -------------------------------------------------------------------

  /**
   * Versão atual do modelo para um atendimento novo do profissional. O modelo precisa estar
   * ativo e ser padrão ou do próprio profissional (422 com o campo `modeloId` caso contrário).
   */
  async versaoParaAtendimento(
    modeloId: string,
    profissionalId: string,
  ): Promise<ModeloProntuarioVersao> {
    const modelo = isUuid(modeloId)
      ? await this.txHost.tx.modeloProntuario.findFirst({
          where: { id: modeloId, ...NAO_EXCLUIDOS },
          include: VERSAO_ATUAL,
        })
      : null;
    const versao = modelo?.versoes[0];
    if (!modelo || !versao || !modelo.ativo) {
      throw new ValidationException([{ field: 'modeloId', message: 'Modelo não encontrado.' }]);
    }
    if (modelo.profissionalId !== null && modelo.profissionalId !== profissionalId) {
      throw new ValidationException([
        { field: 'modeloId', message: 'Este modelo pertence a outro profissional.' },
      ]);
    }
    return versao;
  }

  /** Confere as respostas com as seções da versão e devolve os valores já normalizados. */
  conferirRespostas(
    secoes: ModeloSecoes,
    respostas: ModeloRespostas,
    exigirObrigatorios: boolean,
  ): ModeloRespostas {
    const erros = validarRespostas(secoes, respostas, { exigirObrigatorios });
    if (erros.length > 0) {
      throw new ValidationException(
        erros.map((e) => ({ field: `respostas.${e.chave}`, message: e.mensagem })),
      );
    }
    return normalizarRespostas(secoes, respostas);
  }

  /** Versão usada por cada atendimento, indexada pelo id da versão (listagens e detalhe). */
  async versoesPorId(ids: readonly (string | null)[]): Promise<Map<string, AtendimentoModelo>> {
    const distintos = [...new Set(ids.filter((id): id is string => id !== null))];
    if (distintos.length === 0) return new Map();
    const versoes = await this.txHost.tx.modeloProntuarioVersao.findMany({
      where: { id: { in: distintos } },
    });
    return new Map(versoes.map((v) => [v.id, toAtendimentoModelo(v)]));
  }

  // --- Internos -----------------------------------------------------------------------------

  private async criar(
    input: CreateModeloPadraoInput,
    profissionalId: string | null,
  ): Promise<ModeloDto> {
    const criado = await this.txHost.tx.modeloProntuario.create({
      data: {
        nome: input.nome,
        profissao: input.profissao,
        especialidade: input.especialidade,
        profissionalId,
        ativo: input.ativo ?? true,
        versaoAtual: 1,
        versoes: {
          create: { numero: 1, nome: input.nome, secoes: input.secoes as unknown as object },
        },
      },
      include: VERSAO_ATUAL,
    });
    return this.toDto(criado, await this.nomes([criado]));
  }

  private async detalheInterno(id: string): Promise<ModeloDto> {
    const modelo = await this.buscar(id);
    return this.toDto(modelo, await this.nomes([modelo]));
  }

  /**
   * Modelo existente (404). Com `padrao`, a rota precisa bater com o tipo do modelo: o padrão é
   * alterado só pela rota da gerência e o próprio, pela do profissional, dentro do escopo (403).
   */
  private async buscar(id: string, padrao?: boolean): Promise<ModeloComVersao> {
    const modelo = isUuid(id)
      ? await this.txHost.tx.modeloProntuario.findFirst({
          where: { id, ...NAO_EXCLUIDOS },
          include: VERSAO_ATUAL,
        })
      : null;
    if (!modelo) throw naoEncontrado();
    if (padrao !== undefined) {
      if (padrao !== (modelo.profissionalId === null)) throw naoEncontrado();
      if (!padrao) this.escopo.garantirProfissional(modelo.profissionalId);
    }
    return modelo;
  }

  /** Leitura: o padrão vale para todos; o próprio, só no escopo do usuário (403). */
  private garantirVisivel(modelo: ModeloProntuario): void {
    if (modelo.profissionalId !== null) this.escopo.garantirProfissional(modelo.profissionalId);
  }

  private where(query: ListModelosQuery): Prisma.ModeloProntuarioWhereInput {
    const busca = searchWhere(query.search, ['nome', 'especialidade']);
    const condicoes: Prisma.ModeloProntuarioWhereInput[] = [];
    if (busca) condicoes.push(busca);
    if (query.tipo === 'PADRAO') condicoes.push({ profissionalId: null });
    if (query.tipo === 'PROPRIO') condicoes.push({ profissionalId: { not: null } });

    // Padrão sempre aparece; o próprio, só dos profissionais do escopo (ou do pedido).
    const filtro = this.escopo.filtroProfissional(query.profissionalId);
    if (filtro !== undefined) {
      condicoes.push({ OR: [{ profissionalId: null }, { profissionalId: filtro }] });
    }
    return {
      ...NAO_EXCLUIDOS,
      ...(query.profissao ? { profissao: query.profissao } : {}),
      ...(query.somenteAtivos ? { ativo: true } : {}),
      ...(condicoes.length > 0 ? { AND: condicoes } : {}),
    };
  }

  private async nomes(modelos: readonly ModeloProntuario[]): Promise<ReadonlyMap<string, string>> {
    const ids = modelos.flatMap((m) => (m.profissionalId ? [m.profissionalId] : []));
    return ids.length > 0 ? this.profissionais.nomesPorIds(ids) : new Map();
  }

  private toDto(modelo: ModeloComVersao, nomes: ReadonlyMap<string, string>): ModeloDto {
    const versao = modelo.versoes[0];
    if (!versao) throw naoEncontrado();
    return {
      id: modelo.id,
      nome: modelo.nome,
      profissao: modelo.profissao,
      especialidade: modelo.especialidade,
      profissionalId: modelo.profissionalId,
      profissionalNome: modelo.profissionalId ? (nomes.get(modelo.profissionalId) ?? null) : null,
      padrao: modelo.profissionalId === null,
      ativo: modelo.ativo,
      versao: versao.numero,
      secoes: secoesDe(versao),
      createdAt: modelo.createdAt.toISOString(),
      updatedAt: modelo.updatedAt.toISOString(),
    };
  }
}
