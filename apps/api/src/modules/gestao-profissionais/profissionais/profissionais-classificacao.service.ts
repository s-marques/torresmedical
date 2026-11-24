import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import {
  adicionarDias,
  CLASSIFICACAO_JANELA_DIAS,
  CLASSIFICACOES_PARCEIRO,
  MATRIZ_TURNOS,
  textoMotivoClassificacao,
  type ClassificacaoHistorico,
  type ClassificacaoMotivo,
  type ClassificacaoParametros,
  type ClassificacaoParceiro,
  type ListClassificacoesQuery,
  type Profissional as ProfissionalDto,
  type RecalculoClassificacao,
  type ResumoParceiros,
} from '@torres/shared';
import { AuditService } from '../../../common/audit/audit.service';
import { EscopoDadosService, semPermissao } from '../../../common/auth/escopo-dados.service';
import { RequestContextService } from '../../../common/context/request-context.service';
import {
  calcularOcupacao,
  type BloqueioDaOcupacao,
  type ResultadoOcupacao,
} from '../../../common/ocupacao/calculo-ocupacao';
import { diasDoPeriodo } from '../../../common/ocupacao/periodo-anterior';
import { paginate, type Page } from '../../../common/pagination/paginate';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import type { Prisma } from '../../../generated/prisma/client';
import { AgendaOcupacaoService } from '../../comercial-atendimento/agenda/agenda-ocupacao.service';
import { hojeEmSaoPaulo } from '../salas/data-local';
import { ContratosSalaService } from '../salas/contratos-sala.service';
import { SalasBloqueiosService } from '../salas/salas-bloqueios.service';
import { SalasService } from '../salas/salas.service';
import { classificarParceiro, type ResultadoClassificacao } from './classificacao-parceiro';
import { ProfissionaisService } from './profissionais.service';

const NAO_EXCLUIDO = { deletedAt: null } as const;
const DATA = (d: Date): string => d.toISOString().slice(0, 10);

/** Contratos que contam como relação com a clínica: os assinados (ativos e já encerrados). */
const STATUS_RELACAO = ['ATIVO', 'ENCERRADO'] as const;

type Origem = 'AUTOMATICO' | 'MANUAL';

interface ProfissionalParaClassificar {
  id: string;
  ativo: boolean;
  estrategico: boolean;
  classificacao: ClassificacaoParceiro | null;
  classificacaoMotivo: string | null;
  classificacaoParametros: Prisma.JsonValue;
}

/** Uso dos períodos de um profissional nas janelas da classificação. */
interface UsoPeriodos {
  janela: ResultadoOcupacao['porProfissional'][number] | undefined;
  semanaAtual: number;
  semanaAnterior: number;
}

function parametros(valor: Prisma.JsonValue): ClassificacaoParametros {
  return valor !== null && typeof valor === 'object' && !Array.isArray(valor)
    ? (valor as ClassificacaoParametros)
    : {};
}

function motivoTexto(motivo: string | null, p: Prisma.JsonValue): string | null {
  return motivo === null
    ? null
    : textoMotivoClassificacao(motivo as ClassificacaoMotivo, parametros(p));
}

/**
 * Classificação automática do parceiro (issue #143): lê o contrato e o uso dos períodos (#139) de
 * cada profissional e grava a classificação vigente no cadastro, com o histórico das mudanças.
 * Roda todo dia (`ClassificacaoParceiroAgendador`), sob demanda (recálculo) e quando a gerência
 * marca ou desmarca "Estratégico". Usa só services exportados dos outros módulos.
 *
 * Os dias de funcionamento da clínica não entram: a classificação vale para a clínica toda (sem
 * empresa), então todos os dias da semana contam.
 */
@Injectable()
export class ProfissionaisClassificacaoService {
  constructor(
    private readonly txHost: TransactionHost<PrismaAdapter>,
    private readonly audit: AuditService,
    private readonly escopo: EscopoDadosService,
    private readonly contexto: RequestContextService,
    private readonly salas: SalasService,
    private readonly contratos: ContratosSalaService,
    private readonly bloqueios: SalasBloqueiosService,
    private readonly agenda: AgendaOcupacaoService,
    private readonly profissionais: ProfissionaisService,
  ) {}

  /**
   * Recalcula a classificação de todos os profissionais não excluídos. Só grava (e registra no
   * histórico) o que mudou. Visão da clínica toda: usuário restrito não dispara.
   */
  async recalcular(
    agora = new Date(),
    origem: Origem = 'AUTOMATICO',
  ): Promise<RecalculoClassificacao> {
    if (this.escopo.restrito()) throw semPermissao();
    return this.txHost.withTransaction(() =>
      this.recalcularProfissionais(undefined, agora, origem),
    );
  }

  /** Marca ou desmarca "Estratégico" e reclassifica na hora (a mudança entra no histórico). */
  async definirEstrategico(
    profissionalId: string,
    estrategico: boolean,
    agora = new Date(),
  ): Promise<ProfissionalDto> {
    await this.profissionais.garantirExiste(profissionalId);
    this.escopo.garantirProfissional(profissionalId);
    await this.txHost.tx.profissional.update({
      where: { id: profissionalId },
      data: { estrategico },
    });
    await this.recalcularProfissionais([profissionalId], agora, 'MANUAL');
    return this.profissionais.detalhe(profissionalId);
  }

  /** Histórico de mudanças do profissional, da mais recente para a mais antiga. */
  async historico(
    profissionalId: string,
    query: ListClassificacoesQuery,
  ): Promise<Page<ClassificacaoHistorico>> {
    await this.profissionais.garantirExiste(profissionalId);
    this.escopo.garantirProfissional(profissionalId);
    const where = { profissionalId };
    return paginate(query, {
      findMany: async (page) =>
        (
          await this.txHost.tx.profissionalClassificacao.findMany({
            where,
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            ...page,
          })
        ).map((h) => ({
          id: h.id,
          profissionalId: h.profissionalId,
          classificacaoAnterior: h.classificacaoAnterior,
          classificacao: h.classificacao,
          motivo: h.motivo as ClassificacaoMotivo,
          parametros: parametros(h.parametros),
          motivoTexto: motivoTexto(h.motivo, h.parametros) ?? '',
          origem: h.origem,
          usuarioId: h.usuarioId,
          referencia: DATA(h.referencia),
          createdAt: h.createdAt.toISOString(),
        })),
      count: () => this.txHost.tx.profissionalClassificacao.count({ where }),
    });
  }

  /** Contagens por classificação e os profissionais em risco, para o Painel (no escopo do usuário). */
  async resumo(): Promise<ResumoParceiros> {
    const todos = await this.txHost.tx.profissional.findMany({
      where: { ...NAO_EXCLUIDO, classificacao: { not: null } },
      select: {
        id: true,
        nome: true,
        classificacao: true,
        classificacaoMotivo: true,
        classificacaoParametros: true,
      },
      orderBy: [{ nome: 'asc' }, { id: 'asc' }],
    });
    const visiveis = todos.filter((p) => this.escopo.permite(p.id));
    const porClassificacao = Object.fromEntries(
      CLASSIFICACOES_PARCEIRO.map((c) => [c, 0]),
    ) as Record<ClassificacaoParceiro, number>;
    for (const p of visiveis) {
      if (p.classificacao) porClassificacao[p.classificacao] += 1;
    }
    return {
      total: visiveis.length,
      porClassificacao,
      emRisco: visiveis
        .filter((p) => p.classificacao === 'EM_RISCO')
        .map((p) => ({
          profissionalId: p.id,
          nome: p.nome,
          motivoTexto: motivoTexto(p.classificacaoMotivo, p.classificacaoParametros) ?? '',
        })),
    };
  }

  // -------------------------------------------------------------------------------------------

  private async recalcularProfissionais(
    ids: readonly string[] | undefined,
    agora: Date,
    origem: Origem,
  ): Promise<RecalculoClassificacao> {
    const profissionais = await this.txHost.tx.profissional.findMany({
      where: { ...NAO_EXCLUIDO, id: ids ? { in: [...ids] } : undefined },
      select: {
        id: true,
        ativo: true,
        estrategico: true,
        classificacao: true,
        classificacaoMotivo: true,
        classificacaoParametros: true,
      },
      orderBy: { id: 'asc' },
    });
    if (profissionais.length === 0) return { avaliados: 0, alterados: 0 };

    const hoje = hojeEmSaoPaulo(agora);
    const [uso, contratos] = await Promise.all([
      this.usoDosPeriodos(
        profissionais.map((p) => p.id),
        hoje,
      ),
      this.contratosDosProfissionais(
        profissionais.map((p) => p.id),
        hoje,
      ),
    ]);

    let alterados = 0;
    for (const profissional of profissionais) {
      const periodos = uso.get(profissional.id);
      const contrato = contratos.get(profissional.id);
      const resultado = classificarParceiro({
        hoje,
        profissionalAtivo: profissional.ativo,
        estrategico: profissional.estrategico,
        contratoAtivo: contrato?.ativo ?? false,
        inicioRelacionamento: contrato?.inicio ?? null,
        contratados: periodos?.janela?.contratados ?? 0,
        contratadosUsados: periodos?.janela?.contratadosUsados ?? 0,
        utilizados: periodos?.janela?.utilizados ?? 0,
        semanaAtual: periodos?.semanaAtual ?? 0,
        semanaAnterior: periodos?.semanaAnterior ?? 0,
      });
      if (await this.aplicar(profissional, resultado, hoje, origem, agora)) alterados += 1;
    }
    return { avaliados: profissionais.length, alterados };
  }

  /** Grava a classificação vigente e, se a classe mudou, o histórico. `true` quando a classe mudou. */
  private async aplicar(
    atual: ProfissionalParaClassificar,
    novo: ResultadoClassificacao,
    referencia: string,
    origem: Origem,
    agora: Date,
  ): Promise<boolean> {
    const mudouClasse = atual.classificacao !== novo.classificacao;
    const mudouMotivo =
      atual.classificacaoMotivo !== novo.motivo ||
      JSON.stringify(parametros(atual.classificacaoParametros)) !== JSON.stringify(novo.parametros);
    if (!mudouClasse && !mudouMotivo) return false;

    await this.txHost.tx.profissional.update({
      where: { id: atual.id },
      data: {
        classificacao: novo.classificacao,
        classificacaoMotivo: novo.motivo,
        classificacaoParametros: novo.parametros as Prisma.InputJsonValue,
        ...(mudouClasse ? { classificacaoEm: agora } : {}),
      },
    });
    if (!mudouClasse) return false;

    const usuarioId = origem === 'MANUAL' ? (this.contexto.getUserId() ?? null) : null;
    const historico = await this.txHost.tx.profissionalClassificacao.create({
      data: {
        profissionalId: atual.id,
        classificacaoAnterior: atual.classificacao,
        classificacao: novo.classificacao,
        motivo: novo.motivo,
        parametros: novo.parametros as Prisma.InputJsonValue,
        origem,
        usuarioId,
        referencia: new Date(`${referencia}T00:00:00.000Z`),
      },
    });
    await this.audit.record({
      action: 'CREATE',
      entity: 'ProfissionalClassificacao',
      entityId: historico.id,
      before: null,
      after: historico,
    });
    return true;
  }

  /**
   * Períodos contratados e usados por profissional: os últimos 30 dias (terminando ontem) e os
   * períodos contratados de uma semana, hoje e 30 dias antes. A semana tem cada dia da semana uma
   * vez, então comparar semanas não varia com o calendário (quatro ou cinco segundas no mês).
   */
  private async usoDosPeriodos(
    ids: readonly string[],
    hoje: string,
  ): Promise<ReadonlyMap<string, UsoPeriodos>> {
    const fim = adicionarDias(hoje, -1);
    const janelaDe = adicionarDias(fim, -(CLASSIFICACAO_JANELA_DIAS - 1));
    const semanaAtualDe = adicionarDias(fim, -6);
    const semanaRefAte = adicionarDias(fim, -CLASSIFICACAO_JANELA_DIAS);
    const semanaRefDe = adicionarDias(semanaRefAte, -6);

    const salas = await this.salas.listarParaMatriz();
    const salaIds = salas.map((s) => s.id);
    const [contratos, bloqueios, agendamentos] = await Promise.all([
      this.contratos.ativosNoPeriodo(semanaRefDe, fim, salaIds),
      this.bloqueios.ocorrenciasNoPeriodo(semanaRefDe, fim, salaIds),
      this.agenda.doPeriodo(semanaRefDe, fim, salaIds),
    ]);
    const bloqueiosDoCalculo: BloqueioDaOcupacao[] = bloqueios.map((o) => ({
      salaId: o.bloqueio.salaId,
      tipo: o.bloqueio.tipo,
      profissionalId: o.bloqueio.profissionalId,
      data: o.data,
      inicio: o.inicio,
      fim: o.fim,
    }));
    const base = {
      salas,
      turnos: [...MATRIZ_TURNOS],
      contratos,
      bloqueios: bloqueiosDoCalculo,
      agendamentos,
      profissionalIds: ids,
    };
    const janela = calcularOcupacao({ ...base, dias: diasDoPeriodo(janelaDe, fim) });
    const semanaAtual = calcularOcupacao({ ...base, dias: diasDoPeriodo(semanaAtualDe, fim) });
    const semanaRef = calcularOcupacao({ ...base, dias: diasDoPeriodo(semanaRefDe, semanaRefAte) });

    const contratadosDa = (r: ResultadoOcupacao, id: string): number =>
      r.porProfissional.find((p) => p.profissionalId === id)?.contratados ?? 0;
    return new Map(
      ids.map((id) => [
        id,
        {
          janela: janela.porProfissional.find((p) => p.profissionalId === id),
          semanaAtual: contratadosDa(semanaAtual, id),
          semanaAnterior: contratadosDa(semanaRef, id),
        },
      ]),
    );
  }

  /** Contrato ativo hoje e início da relação (assinatura ou início do contrato mais antigo). */
  private async contratosDosProfissionais(
    ids: readonly string[],
    hoje: string,
  ): Promise<ReadonlyMap<string, { ativo: boolean; inicio: string | null }>> {
    const contratos = await this.txHost.tx.contratoSala.findMany({
      where: {
        ...NAO_EXCLUIDO,
        locatarioTipo: 'PROFISSIONAL',
        profissionalId: { in: [...ids] },
        status: { in: [...STATUS_RELACAO] },
      },
      select: {
        profissionalId: true,
        status: true,
        dataInicio: true,
        dataFim: true,
        assinadoEm: true,
      },
    });
    const resultado = new Map<string, { ativo: boolean; inicio: string | null }>();
    for (const c of contratos) {
      if (!c.profissionalId) continue;
      const atual = resultado.get(c.profissionalId) ?? { ativo: false, inicio: null };
      const inicio = DATA(c.assinadoEm ?? c.dataInicio);
      const vigente =
        c.status === 'ATIVO' &&
        DATA(c.dataInicio) <= hoje &&
        (c.dataFim === null || DATA(c.dataFim) >= hoje);
      resultado.set(c.profissionalId, {
        ativo: atual.ativo || vigente,
        inicio: atual.inicio === null || inicio < atual.inicio ? inicio : atual.inicio,
      });
    }
    return resultado;
  }
}
