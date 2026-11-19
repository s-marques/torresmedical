import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import {
  AGENTE_ATIVO_SEM_PUBLICAR,
  AGENTE_INSTRUCAO_TRANSICOES,
  AGENTE_TRANSICAO_INVALIDA,
  type AgenteInstrucao,
  type AgenteInstrucaoStatus,
  type AgenteInstrucaoVersao,
  type CreateAgenteInstrucaoInput,
  type ListAgenteInstrucaoQuery,
  type UpdateAgenteInstrucaoInput,
} from '@torres/shared';
import type {
  AgenteInstrucao as InstrucaoRegistro,
  AgenteInstrucaoVersao as VersaoRegistro,
  Prisma,
} from '../../../generated/prisma/client';
import { RequestContextService } from '../../../common/context/request-context.service';
import { BusinessException } from '../../../common/errors/api.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import { paginate, searchWhere, toOrderBy, type Page } from '../../../common/pagination/paginate';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';

type Conteudo = Pick<
  CreateAgenteInstrucaoInput,
  'nome' | 'modelo' | 'temperatura' | 'maxTokens' | 'systemPrompt'
>;

function paraDto(registro: InstrucaoRegistro): AgenteInstrucao {
  return {
    id: registro.id,
    nome: registro.nome,
    modelo: registro.modelo,
    temperatura: Number(registro.temperatura),
    maxTokens: registro.maxTokens,
    ativo: registro.ativo,
    systemPrompt: registro.systemPrompt,
    status: registro.status,
    versaoAtual: registro.versaoAtual,
    aprovadoPor: registro.aprovadoPor,
    aprovadoPorNome: registro.aprovadoPorNome,
    aprovadoEm: registro.aprovadoEm?.toISOString() ?? null,
    createdAt: registro.createdAt.toISOString(),
    updatedAt: registro.updatedAt.toISOString(),
  };
}

function versaoParaDto(versao: VersaoRegistro): AgenteInstrucaoVersao {
  return {
    id: versao.id,
    numero: versao.numero,
    nome: versao.nome,
    modelo: versao.modelo,
    temperatura: Number(versao.temperatura),
    maxTokens: versao.maxTokens,
    systemPrompt: versao.systemPrompt,
    criadoPor: versao.criadoPor,
    criadoPorNome: versao.criadoPorNome,
    createdAt: versao.createdAt.toISOString(),
  };
}

function regraDeNegocio(message: string, field?: string): BusinessException {
  return new BusinessException(ErrorCode.BUSINESS_RULE, message, {
    status: 422,
    details: field ? [{ field, message }] : undefined,
  });
}

/**
 * Instruções (system prompt) do agente de IA, com ciclo de aprovação e histórico de versões
 * (IA p. 2 e p. 4). Um script só pode ficar ativo depois de publicado, e qualquer mudança de
 * conteúdo volta o script para rascunho. O uso do prompt pelo agente é de outro card.
 */
@Injectable()
export class AgenteInstrucoesService {
  constructor(
    private readonly txHost: TransactionHost<PrismaAdapter>,
    private readonly contexto: RequestContextService,
  ) {}

  async list(query: ListAgenteInstrucaoQuery): Promise<Page<AgenteInstrucao>> {
    const where: Prisma.AgenteInstrucaoWhereInput = {
      deletedAt: null,
      ativo: query.status ? query.status === 'ativo' : undefined,
      ...searchWhere(query.search, ['nome']),
    };
    const orderBy = toOrderBy(query.sort);
    const pagina = await paginate(query, {
      findMany: (page) => this.txHost.tx.agenteInstrucao.findMany({ where, orderBy, ...page }),
      count: () => this.txHost.tx.agenteInstrucao.count({ where }),
    });
    return { ...pagina, data: pagina.data.map(paraDto) };
  }

  async findById(id: string): Promise<AgenteInstrucao> {
    return paraDto(await this.buscar(id));
  }

  async create(input: CreateAgenteInstrucaoInput): Promise<AgenteInstrucao> {
    if (input.ativo) throw regraDeNegocio(AGENTE_ATIVO_SEM_PUBLICAR, 'ativo');
    const registro = await this.txHost.tx.agenteInstrucao.create({
      data: { ...input, ativo: false },
    });
    await this.gravarVersao(registro, 1);
    return paraDto(registro);
  }

  async update(id: string, input: UpdateAgenteInstrucaoInput): Promise<AgenteInstrucao> {
    const atual = await this.buscar(id);
    if (!this.mudouConteudo(atual, input)) {
      if (input.ativo && atual.status !== 'PUBLICADO') {
        throw regraDeNegocio(AGENTE_ATIVO_SEM_PUBLICAR, 'ativo');
      }
      const registro = await this.txHost.tx.agenteInstrucao.update({
        where: { id },
        data: { ativo: input.ativo },
      });
      return paraDto(registro);
    }
    if (input.ativo) throw regraDeNegocio(AGENTE_ATIVO_SEM_PUBLICAR, 'ativo');
    return paraDto(await this.salvarNovoConteudo(atual, input));
  }

  /** Avança ou volta o ciclo de aprovação. Quem aprova fica registrado. */
  async alterarStatus(id: string, status: AgenteInstrucaoStatus): Promise<AgenteInstrucao> {
    const atual = await this.buscar(id);
    if (!AGENTE_INSTRUCAO_TRANSICOES[atual.status].includes(status)) {
      throw regraDeNegocio(AGENTE_TRANSICAO_INVALIDA, 'status');
    }
    const data: Prisma.AgenteInstrucaoUpdateInput = { status };
    if (status === 'APROVADO') {
      data.aprovadoPor = this.contexto.getUserId() ?? null;
      data.aprovadoPorNome = await this.nomeDoUsuarioAtual();
      data.aprovadoEm = new Date();
    }
    if (status === 'RASCUNHO') {
      data.ativo = false;
      data.aprovadoPor = null;
      data.aprovadoPorNome = null;
      data.aprovadoEm = null;
    }
    return paraDto(await this.txHost.tx.agenteInstrucao.update({ where: { id }, data }));
  }

  async versoes(id: string): Promise<AgenteInstrucaoVersao[]> {
    await this.buscar(id);
    const versoes = await this.txHost.tx.agenteInstrucaoVersao.findMany({
      where: { instrucaoId: id },
      orderBy: { numero: 'desc' },
    });
    return versoes.map(versaoParaDto);
  }

  /** Volta o conteúdo de uma versão anterior. Gera uma versão nova e o script volta a rascunho. */
  async restaurarVersao(id: string, numero: number): Promise<AgenteInstrucao> {
    const atual = await this.buscar(id);
    const versao = await this.txHost.tx.agenteInstrucaoVersao.findUnique({
      where: { instrucaoId_numero: { instrucaoId: id, numero } },
    });
    if (!versao) {
      throw new BusinessException(ErrorCode.NOT_FOUND, 'Versão não encontrada', { status: 404 });
    }
    return paraDto(
      await this.salvarNovoConteudo(atual, {
        nome: versao.nome,
        modelo: versao.modelo,
        temperatura: Number(versao.temperatura),
        maxTokens: versao.maxTokens,
        systemPrompt: versao.systemPrompt,
      }),
    );
  }

  /** Exclusão lógica. */
  async remove(id: string): Promise<AgenteInstrucao> {
    await this.buscar(id);
    return paraDto(
      await this.txHost.tx.agenteInstrucao.update({
        where: { id },
        data: { deletedAt: new Date(), ativo: false },
      }),
    );
  }

  private async buscar(id: string): Promise<InstrucaoRegistro> {
    const registro = await this.txHost.tx.agenteInstrucao.findFirst({
      where: { id, deletedAt: null },
    });
    if (!registro) {
      throw new BusinessException(ErrorCode.NOT_FOUND, 'Instrução não encontrada', {
        status: 404,
      });
    }
    return registro;
  }

  private mudouConteudo(atual: InstrucaoRegistro, novo: Conteudo): boolean {
    return (
      atual.nome !== novo.nome ||
      atual.modelo !== novo.modelo ||
      Number(atual.temperatura) !== novo.temperatura ||
      atual.maxTokens !== novo.maxTokens ||
      atual.systemPrompt !== novo.systemPrompt
    );
  }

  private async salvarNovoConteudo(
    atual: InstrucaoRegistro,
    conteudo: Conteudo,
  ): Promise<InstrucaoRegistro> {
    const numero = atual.versaoAtual + 1;
    const registro = await this.txHost.tx.agenteInstrucao.update({
      where: { id: atual.id },
      data: {
        ...conteudo,
        ativo: false,
        status: 'RASCUNHO',
        versaoAtual: numero,
        aprovadoPor: null,
        aprovadoPorNome: null,
        aprovadoEm: null,
      },
    });
    await this.gravarVersao(registro, numero);
    return registro;
  }

  private async gravarVersao(registro: InstrucaoRegistro, numero: number): Promise<void> {
    await this.txHost.tx.agenteInstrucaoVersao.create({
      data: {
        instrucaoId: registro.id,
        numero,
        nome: registro.nome,
        modelo: registro.modelo,
        temperatura: registro.temperatura,
        maxTokens: registro.maxTokens,
        systemPrompt: registro.systemPrompt,
        criadoPor: this.contexto.getUserId() ?? null,
        criadoPorNome: await this.nomeDoUsuarioAtual(),
      },
    });
  }

  private async nomeDoUsuarioAtual(): Promise<string | null> {
    const userId = this.contexto.getUserId();
    if (!userId) return null;
    const usuario = await this.txHost.tx.usuario.findUnique({
      where: { id: userId },
      select: { nome: true },
    });
    return usuario?.nome ?? null;
  }
}
