import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import {
  TIPOS_CANCELAMENTO,
  RELATORIO_CANCELAMENTOS_ID,
  TIPO_CANCELAMENTO_ROTULO,
  type Sort,
} from '@torres/shared';
import { EscopoDadosService } from '../../../common/auth/escopo-dados.service';
import type { Prisma } from '../../../generated/prisma/client';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import {
  definirRelatorio,
  type ProvedorRelatorios,
  type ConsultaRelatorio,
  type ReportDefinition,
} from '../../../common/relatorios/relatorio.types';
import {
  IndicadoresGestaoService,
  type LtvPaciente,
  type TicketMedioOrigem,
} from '../../comercial-atendimento/indicadores-gestao/indicadores-gestao.service';
import { ordenarEPaginar } from '../../comercial-atendimento/relatorios/relatorios-comercial';
import { UsuariosService } from '../usuarios/usuarios.service';
import { ProfissionaisService } from '../../gestao-profissionais/profissionais/profissionais.service';
import {
  SalasPainelService,
  type OcupacaoSalaPeriodo,
} from '../../gestao-profissionais/salas/salas-painel.service';

export interface LinhaCancelamento {
  canceladoEm: Date;
  tipo: string;
  motivo: string;
  profissional: string | null;
  canceladoPor: string | null;
  reagendou: string | null;
  observacao: string | null;
}

export interface LinhaCancelamentoPorMotivo {
  tipo: string;
  motivo: string;
  profissional: string | null;
  quantidade: number;
}

/** Ids distintos e preenchidos, para buscar os nomes de uma vez. */
function ids(valores: readonly (string | null)[]): string[] {
  return [...new Set(valores.filter((v): v is string => v !== null))];
}

export interface LinhaLogAcesso {
  acessoEm: Date;
  usuario: string;
  ip: string | null;
  navegador: string | null;
}

/**
 * Relatórios da tela Relatórios de Gestão (`/gestao/relatorios`): GES-01 a GES-04. Cada um usa a
 * consulta do módulo dono dos dados e respeita o período De/Até.
 */
@Injectable()
export class RelatoriosGestao implements ProvedorRelatorios {
  readonly relatorios: readonly ReportDefinition[];

  constructor(
    private readonly txHost: TransactionHost<PrismaAdapter>,
    private readonly indicadores: IndicadoresGestaoService,
    private readonly salas: SalasPainelService,
    private readonly profissionais: ProfissionaisService,
    private readonly usuarios: UsuariosService,
    private readonly escopo: EscopoDadosService,
  ) {
    this.relatorios = [
      this.logDeAcesso(),
      this.ticketMedioPorCanal(),
      this.ocupacaoPorSala(),
      this.ltvPaciente(),
      this.cancelamentos(),
      this.cancelamentosPorMotivo(),
    ];
  }

  private logDeAcesso(): ReportDefinition {
    const ordem = (sort: Sort | undefined) => {
      const direcao = sort?.direction ?? 'desc';
      return sort?.field === 'usuario'
        ? [{ usuario: { nome: direcao } }, { createdAt: 'desc' as const }]
        : [{ createdAt: direcao }];
    };
    const filtro = ({ intervalo }: { intervalo: { gte: Date; lt: Date } }) => ({
      createdAt: intervalo,
    });
    return definirRelatorio<LinhaLogAcesso>({
      id: 'GES-01',
      nome: 'Log de Acesso',
      permissao: 'configuracoes-gestao.usuarios.ver',
      colunas: [
        {
          key: 'acessoEm',
          header: 'Data/hora do acesso',
          type: 'datetime',
          value: (l) => l.acessoEm,
          width: 2,
          ordenavel: true,
        },
        {
          key: 'usuario',
          header: 'Usuário',
          value: (l) => l.usuario,
          width: 3,
          ordenavel: true,
        },
        { key: 'ip', header: 'IP', value: (l) => l.ip, width: 2 },
        { key: 'navegador', header: 'Navegador', value: (l) => l.navegador, width: 4 },
      ],
      ordenacaoPadrao: 'acessoEm:desc',
      buscar: async (consulta, pagina) => {
        const sessoes = await this.txHost.tx.sessao.findMany({
          where: filtro(consulta),
          orderBy: ordem(consulta.sort),
          include: { usuario: { select: { nome: true } } },
          ...(pagina ? { skip: pagina.skip, take: pagina.take } : {}),
        });
        return sessoes.map((s) => ({
          acessoEm: s.createdAt,
          usuario: s.usuario.nome,
          ip: s.ip,
          navegador: s.userAgent,
        }));
      },
      contar: (consulta) => this.txHost.tx.sessao.count({ where: filtro(consulta) }),
    });
  }

  private ticketMedioPorCanal(): ReportDefinition {
    return definirRelatorio<TicketMedioOrigem>({
      id: 'GES-02',
      nome: 'Ticket Médio por Canal',
      permissao: 'comercial-atendimento.vendas-pdv.ver',
      colunas: [
        {
          key: 'origem',
          header: 'Canal (origem)',
          value: (l) => l.origem,
          width: 3,
          ordenavel: true,
        },
        {
          key: 'vendas',
          header: 'Vendas',
          type: 'number',
          value: (l) => l.vendas,
          ordenavel: true,
        },
        {
          key: 'total',
          header: 'Total vendido (R$)',
          type: 'currency',
          value: (l) => l.total,
          ordenavel: true,
        },
        {
          key: 'ticketMedio',
          header: 'Ticket médio (R$)',
          type: 'currency',
          value: (l) => l.ticketMedio,
          ordenavel: true,
        },
      ],
      ordenacaoPadrao: 'ticketMedio:desc',
      buscar: async (consulta, pagina) =>
        ordenarEPaginar(
          await this.indicadores.ticketMedioPorOrigem(consulta.intervalo),
          consulta.sort,
          pagina,
        ),
      contar: async (consulta) =>
        (await this.indicadores.ticketMedioPorOrigem(consulta.intervalo)).length,
    });
  }

  private ocupacaoPorSala(): ReportDefinition {
    return definirRelatorio<OcupacaoSalaPeriodo>({
      id: 'GES-03',
      nome: 'Ocupação por Sala',
      permissao: 'gestao-profissionais.salas.ver',
      colunas: [
        { key: 'sala', header: 'Sala', value: (l) => l.sala, width: 3, ordenavel: true },
        {
          key: 'diasNoPeriodo',
          header: 'Dias no período',
          type: 'number',
          value: (l) => l.diasNoPeriodo,
        },
        {
          key: 'diasOcupados',
          header: 'Dias ocupados',
          type: 'number',
          value: (l) => l.diasOcupados,
          ordenavel: true,
        },
        {
          key: 'taxaOcupacao',
          header: 'Ocupação (%)',
          type: 'number',
          value: (l) => l.taxaOcupacao,
          ordenavel: true,
        },
      ],
      ordenacaoPadrao: 'taxaOcupacao:desc',
      buscar: async ({ periodo, sort }, pagina) =>
        ordenarEPaginar(await this.salas.ocupacaoNoPeriodo(periodo.de, periodo.ate), sort, pagina),
      contar: async ({ periodo }) =>
        (await this.salas.ocupacaoNoPeriodo(periodo.de, periodo.ate)).length,
    });
  }

  private ltvPaciente(): ReportDefinition {
    return definirRelatorio<LtvPaciente>({
      id: 'GES-04',
      nome: 'LTV Paciente',
      permissao: 'comercial-atendimento.pacientes.ver',
      colunas: [
        {
          key: 'paciente',
          header: 'Paciente',
          value: (l) => l.paciente,
          width: 3,
          ordenavel: true,
        },
        {
          key: 'vendas',
          header: 'Vendas',
          type: 'number',
          value: (l) => l.vendas,
          ordenavel: true,
        },
        {
          key: 'valorVendas',
          header: 'Vendas (R$)',
          type: 'currency',
          value: (l) => l.valorVendas,
          ordenavel: true,
        },
        {
          key: 'valorConsultas',
          header: 'Consultas recebidas (R$)',
          type: 'currency',
          value: (l) => l.valorConsultas,
          ordenavel: true,
        },
        { key: 'ltv', header: 'LTV (R$)', type: 'currency', value: (l) => l.ltv, ordenavel: true },
      ],
      ordenacaoPadrao: 'ltv:desc',
      buscar: async (consulta, pagina) =>
        ordenarEPaginar(
          await this.indicadores.ltvPorPaciente(consulta.intervalo),
          consulta.sort,
          pagina,
        ),
      contar: async (consulta) =>
        (await this.indicadores.ltvPorPaciente(consulta.intervalo)).length,
    });
  }

  // --- Cancelamentos (issue #162) --------------------------------------------------------------

  private filtroTipoCancelamento() {
    return {
      tipo: 'select' as const,
      parametro: 'tipo',
      rotulo: 'Tipo',
      opcoes: TIPOS_CANCELAMENTO.map((valor) => ({
        valor,
        rotulo: TIPO_CANCELAMENTO_ROTULO[valor],
      })),
    };
  }

  /** Cancelamentos do período, no escopo do usuário (perfil restrito só vê os dos seus profissionais). */
  private whereCancelamentos({
    intervalo,
    filtros,
  }: {
    intervalo: { gte: Date; lt: Date };
    filtros: Readonly<Record<string, string | undefined>>;
  }): Prisma.CancelamentoWhereInput {
    const tipo = TIPOS_CANCELAMENTO.find((t) => t === filtros.tipo);
    return {
      canceladoEm: intervalo,
      tipo,
      profissionalId: this.escopo.filtroProfissional(),
    };
  }

  private cancelamentos(): ReportDefinition {
    const ordem = (sort: Sort | undefined): Prisma.CancelamentoOrderByWithRelationInput[] => {
      const direcao = sort?.direction ?? 'desc';
      if (sort?.field === 'tipo') return [{ tipo: direcao }, { canceladoEm: 'desc' }];
      if (sort?.field === 'motivo') return [{ motivoNome: direcao }, { canceladoEm: 'desc' }];
      return [{ canceladoEm: direcao }, { id: 'asc' }];
    };
    return definirRelatorio<LinhaCancelamento>({
      id: RELATORIO_CANCELAMENTOS_ID,
      nome: 'Cancelamentos',
      colunas: [
        {
          key: 'canceladoEm',
          header: 'Data/hora',
          type: 'datetime',
          value: (l) => l.canceladoEm,
          width: 2,
          ordenavel: true,
        },
        { key: 'tipo', header: 'Tipo', value: (l) => l.tipo, ordenavel: true },
        { key: 'motivo', header: 'Motivo', value: (l) => l.motivo, width: 3, ordenavel: true },
        { key: 'profissional', header: 'Profissional', value: (l) => l.profissional, width: 3 },
        { key: 'canceladoPor', header: 'Cancelado por', value: (l) => l.canceladoPor, width: 3 },
        { key: 'reagendou', header: 'Reagendou', value: (l) => l.reagendou },
        { key: 'observacao', header: 'Observação', value: (l) => l.observacao, width: 4 },
      ],
      ordenacaoPadrao: 'canceladoEm:desc',
      filtros: [this.filtroTipoCancelamento()],
      buscar: async (consulta, pagina) => {
        const linhas = await this.txHost.tx.cancelamento.findMany({
          where: this.whereCancelamentos(consulta),
          orderBy: ordem(consulta.sort),
          ...(pagina ? { skip: pagina.skip, take: pagina.take } : {}),
        });
        const [profissionais, usuarios] = await Promise.all([
          this.profissionais.nomesPorIds(ids(linhas.map((l) => l.profissionalId))),
          this.usuarios.nomesPorIds(ids(linhas.map((l) => l.canceladoPorId))),
        ]);
        return linhas.map((l) => ({
          canceladoEm: l.canceladoEm,
          tipo: TIPO_CANCELAMENTO_ROTULO[l.tipo],
          motivo: l.motivoNome,
          profissional: l.profissionalId ? (profissionais.get(l.profissionalId) ?? null) : null,
          canceladoPor: l.canceladoPorId ? (usuarios.get(l.canceladoPorId) ?? null) : 'Sistema',
          reagendou: l.tipo === 'CONSULTA' ? (l.reagendouParaId ? 'Sim' : 'Não') : null,
          observacao: l.observacao,
        }));
      },
      contar: (consulta) =>
        this.txHost.tx.cancelamento.count({ where: this.whereCancelamentos(consulta) }),
    });
  }

  /** Total por tipo, motivo e profissional (inteligência gerencial: por que e quem mais cancela). */
  private cancelamentosPorMotivo(): ReportDefinition {
    const linhas = async (consulta: ConsultaRelatorio): Promise<LinhaCancelamentoPorMotivo[]> => {
      const grupos = await this.txHost.tx.cancelamento.groupBy({
        by: ['tipo', 'motivoNome', 'profissionalId'],
        where: this.whereCancelamentos(consulta),
        _count: { _all: true },
      });
      const nomes = await this.profissionais.nomesPorIds(ids(grupos.map((g) => g.profissionalId)));
      const linhas = grupos.map((g) => ({
        tipo: TIPO_CANCELAMENTO_ROTULO[g.tipo],
        motivo: g.motivoNome,
        profissional: g.profissionalId ? (nomes.get(g.profissionalId) ?? null) : null,
        quantidade: g._count._all,
      }));
      // O banco não garante a ordem dos grupos: fixa uma ordem base para os empates saírem sempre iguais.
      return linhas.sort(
        (a, b) =>
          a.tipo.localeCompare(b.tipo, 'pt-BR') ||
          a.motivo.localeCompare(b.motivo, 'pt-BR') ||
          (a.profissional ?? '').localeCompare(b.profissional ?? '', 'pt-BR'),
      );
    };
    return definirRelatorio<LinhaCancelamentoPorMotivo>({
      id: 'GES-06',
      nome: 'Cancelamentos por Motivo',
      colunas: [
        { key: 'tipo', header: 'Tipo', value: (l) => l.tipo, ordenavel: true },
        { key: 'motivo', header: 'Motivo', value: (l) => l.motivo, width: 3, ordenavel: true },
        {
          key: 'profissional',
          header: 'Profissional',
          value: (l) => l.profissional,
          width: 3,
          ordenavel: true,
        },
        {
          key: 'quantidade',
          header: 'Cancelamentos',
          type: 'number',
          value: (l) => l.quantidade,
          ordenavel: true,
        },
      ],
      ordenacaoPadrao: 'quantidade:desc',
      filtros: [this.filtroTipoCancelamento()],
      buscar: async (consulta, pagina) =>
        ordenarEPaginar(await linhas(consulta), consulta.sort, pagina),
      contar: async (consulta) => (await linhas(consulta)).length,
    });
  }
}
