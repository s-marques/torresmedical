import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import {
  intervaloDaMeta,
  intervaloDoPeriodo,
  META_METRICAS,
  percentualAtingido,
  type AcompanhamentoMetas,
  type AcompanhamentoMetasQuery,
  type ListMetasComerciaisQuery,
  type MetaComercial,
  type MetaComercialInput,
  type MetaEvolucao,
  type MetaMetrica,
  type MetaResumo,
} from '@torres/shared';
import type { MetaComercial as MetaRow, Prisma } from '../../../generated/prisma/client';
import { EscopoDadosService, semPermissao } from '../../../common/auth/escopo-dados.service';
import { BusinessException } from '../../../common/errors/api.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import { paginate, toOrderBy, type Page } from '../../../common/pagination/paginate';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import { UsuariosService } from '../../configuracoes-gestao/usuarios/usuarios.service';

const NAO_EXCLUIDAS = { deletedAt: null } as const;
/** Teto de metas lidas de uma vez no acompanhamento (evita varrer o histórico inteiro). */
const LIMITE_ACOMPANHAMENTO = 500;

const dia = (data: Date): string => data.toISOString().slice(0, 10);
const dataDoDia = (texto: string): Date => new Date(`${texto}T00:00:00.000Z`);
const arredondar = (valor: number): number => Math.round(valor * 100) / 100;

/** Intervalo `[gte, lt)` do período da meta, no dia do calendário da clínica. */
function intervaloRealizado(meta: Pick<MetaRow, 'dataInicio' | 'dataFim'>) {
  const { inicio, fim } = intervaloDoPeriodo(dia(meta.dataInicio), dia(meta.dataFim));
  return { gte: inicio as Date, lt: fim as Date };
}

/**
 * Metas comerciais (issue #172, R §24). A meta é o projetado; o realizado sai dos negócios do
 * CRM no período, pelos mesmos marcos do dashboard (primeiro contato, visita, proposta e
 * contrato). Visão geral da administração: o usuário com escopo restrito (issue #153) recebe 403.
 */
@Injectable()
export class MetasService {
  constructor(
    private readonly txHost: TransactionHost<PrismaAdapter>,
    private readonly escopo: EscopoDadosService,
    private readonly usuarios: UsuariosService,
  ) {}

  async list(query: ListMetasComerciaisQuery): Promise<Page<MetaComercial>> {
    this.garantirVisaoGeral();
    const where = this.where(query);
    const pagina = await paginate(query, {
      findMany: (p) =>
        this.txHost.tx.metaComercial.findMany({
          where,
          orderBy: [...toOrderBy(query.sort)],
          ...p,
        }),
      count: () => this.txHost.tx.metaComercial.count({ where }),
    });
    return { ...pagina, data: await this.paraDtos(pagina.data) };
  }

  async findById(id: string): Promise<MetaComercial> {
    this.garantirVisaoGeral();
    const [dto] = await this.paraDtos([await this.carregar(id)]);
    return dto as MetaComercial;
  }

  async create(input: MetaComercialInput): Promise<MetaComercial> {
    this.garantirVisaoGeral();
    const dados = await this.dadosValidos(input);
    const criada = await this.txHost.tx.metaComercial.create({ data: dados });
    return this.dtoDe(criada);
  }

  async update(id: string, input: MetaComercialInput): Promise<MetaComercial> {
    this.garantirVisaoGeral();
    await this.carregar(id);
    const dados = await this.dadosValidos(input, id);
    const alterada = await this.txHost.tx.metaComercial.update({ where: { id }, data: dados });
    return this.dtoDe(alterada);
  }

  /** Exclusão lógica: a meta sai das telas, mas o histórico fica no `audit_log`. */
  async remove(id: string): Promise<MetaComercial> {
    this.garantirVisaoGeral();
    await this.carregar(id);
    const excluida = await this.txHost.tx.metaComercial.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return this.dtoDe(excluida);
  }

  /**
   * Projetado × realizado do filtro: o total por métrica e, período a período (do mais antigo ao
   * mais recente), a evolução e o histórico.
   */
  async acompanhamento(query: AcompanhamentoMetasQuery): Promise<AcompanhamentoMetas> {
    this.garantirVisaoGeral();
    const metas = await this.txHost.tx.metaComercial.findMany({
      where: this.where(query),
      orderBy: [{ dataInicio: 'asc' }, { id: 'asc' }],
      take: LIMITE_ACOMPANHAMENTO,
    });
    const realizados = await this.realizadosDe(metas);

    const evolucao = new Map<string, MetaEvolucao>();
    const total = new Map<MetaMetrica, { projetado: number; realizado: number }>();
    metas.forEach((meta, i) => {
      const projetado = Number(meta.valor);
      const realizado = realizados[i] as number;
      const acumulado = total.get(meta.metrica) ?? { projetado: 0, realizado: 0 };
      total.set(meta.metrica, {
        projetado: acumulado.projetado + projetado,
        realizado: acumulado.realizado + realizado,
      });
      // Metas do mesmo período e métrica (de responsáveis diferentes) viram um ponto só.
      const chave = `${meta.metrica}|${meta.periodo}`;
      const ponto = evolucao.get(chave);
      const somaProjetado = (ponto?.projetado ?? 0) + projetado;
      const somaRealizado = (ponto?.realizado ?? 0) + realizado;
      evolucao.set(chave, {
        metrica: meta.metrica,
        periodoTipo: meta.periodoTipo,
        periodo: meta.periodo,
        dataInicio: dia(meta.dataInicio),
        projetado: arredondar(somaProjetado),
        realizado: arredondar(somaRealizado),
        percentual: percentualAtingido(somaRealizado, somaProjetado),
      });
    });

    const resumo: MetaResumo[] = META_METRICAS.flatMap((metrica) => {
      const soma = total.get(metrica);
      if (!soma) return [];
      return [
        {
          metrica,
          projetado: arredondar(soma.projetado),
          realizado: arredondar(soma.realizado),
          percentual: percentualAtingido(soma.realizado, soma.projetado),
        },
      ];
    });
    return { resumo, evolucao: [...evolucao.values()] };
  }

  private garantirVisaoGeral(): void {
    if (this.escopo.restrito()) throw semPermissao();
  }

  private async carregar(id: string): Promise<MetaRow> {
    const meta = await this.txHost.tx.metaComercial.findFirst({
      where: { id, ...NAO_EXCLUIDAS },
    });
    if (!meta) {
      throw new BusinessException(ErrorCode.NOT_FOUND, 'Meta comercial não encontrada', {
        status: 404,
      });
    }
    return meta;
  }

  /** Metas cujo período toca o intervalo De/Até. */
  private where(
    filtro: Pick<ListMetasComerciaisQuery, 'metrica' | 'responsavelId' | 'de' | 'ate'>,
  ): Prisma.MetaComercialWhereInput {
    return {
      ...NAO_EXCLUIDAS,
      metrica: filtro.metrica,
      responsavelId: filtro.responsavelId,
      dataFim: filtro.de ? { gte: dataDoDia(filtro.de) } : undefined,
      dataInicio: filtro.ate ? { lte: dataDoDia(filtro.ate) } : undefined,
    };
  }

  private async dadosValidos(
    input: MetaComercialInput,
    ignorarId?: string,
  ): Promise<Prisma.MetaComercialUncheckedCreateInput> {
    const intervalo = intervaloDaMeta(input.periodoTipo, input.periodo);
    if (!intervalo) {
      throw new BusinessException('META_COMERCIAL_PERIODO_INVALIDO', 'Período inválido', {
        status: 400,
        details: [{ field: 'periodo', message: 'Período inválido para o tipo escolhido' }],
      });
    }
    if (input.responsavelId) await this.usuarios.garantirAtivo(input.responsavelId, 'Responsável');

    const existente = await this.txHost.tx.metaComercial.findFirst({
      where: {
        ...NAO_EXCLUIDAS,
        id: ignorarId ? { not: ignorarId } : undefined,
        metrica: input.metrica,
        periodo: input.periodo,
        responsavelId: input.responsavelId,
      },
      select: { id: true },
    });
    if (existente) {
      throw new BusinessException(
        'META_COMERCIAL_DUPLICADA',
        'Já existe uma meta desta métrica neste período para o mesmo responsável.',
        { status: 409 },
      );
    }
    return {
      metrica: input.metrica,
      periodoTipo: input.periodoTipo,
      periodo: input.periodo,
      dataInicio: dataDoDia(intervalo.inicio),
      dataFim: dataDoDia(intervalo.fim),
      responsavelId: input.responsavelId,
      valor: input.valor,
      observacoes: input.observacoes,
    };
  }

  /** Realizado de cada meta, na mesma ordem. */
  private async realizadosDe(metas: readonly MetaRow[]): Promise<number[]> {
    return Promise.all(metas.map((meta) => this.realizadoDe(meta)));
  }

  /** O realizado vem dos negócios do CRM no período (e do responsável, se a meta tem um). */
  private async realizadoDe(meta: MetaRow): Promise<number> {
    const periodo = intervaloRealizado(meta);
    const base: Prisma.NegocioWhereInput = {
      ...NAO_EXCLUIDAS,
      ...(meta.responsavelId ? { responsavelId: meta.responsavelId } : {}),
    };
    const negocios = this.txHost.tx.negocio;
    switch (meta.metrica) {
      case 'LEADS':
        return negocios.count({ where: { ...base, createdAt: periodo } });
      case 'VISITAS':
        return negocios.count({ where: { ...base, marcoVisitaEm: periodo } });
      case 'PROPOSTAS':
        return negocios.count({ where: { ...base, marcoPropostaEm: periodo } });
      case 'CONTRATOS_FECHADOS':
        return negocios.count({ where: { ...base, marcoContratoEm: periodo } });
      case 'RECEITA_NOVA': {
        const soma = await negocios.aggregate({
          where: { ...base, status: 'GANHO', fechadoEm: periodo },
          _sum: { valor: true },
        });
        return arredondar(Number(soma._sum.valor ?? 0));
      }
    }
  }

  private async dtoDe(meta: MetaRow): Promise<MetaComercial> {
    const [dto] = await this.paraDtos([meta]);
    return dto as MetaComercial;
  }

  private async paraDtos(metas: readonly MetaRow[]): Promise<MetaComercial[]> {
    const [realizados, nomes] = await Promise.all([
      this.realizadosDe(metas),
      this.usuarios.nomesPorIds(metas.flatMap((m) => (m.responsavelId ? [m.responsavelId] : []))),
    ]);
    return metas.map((meta, i) => {
      const realizado = realizados[i] as number;
      const projetado = Number(meta.valor);
      return {
        id: meta.id,
        metrica: meta.metrica,
        periodoTipo: meta.periodoTipo,
        periodo: meta.periodo,
        dataInicio: dia(meta.dataInicio),
        dataFim: dia(meta.dataFim),
        responsavelId: meta.responsavelId,
        responsavel: meta.responsavelId ? (nomes.get(meta.responsavelId) ?? null) : null,
        observacoes: meta.observacoes,
        valor: projetado,
        realizado,
        percentual: percentualAtingido(realizado, projetado),
        createdAt: meta.createdAt.toISOString(),
        updatedAt: meta.updatedAt.toISOString(),
      };
    });
  }
}
