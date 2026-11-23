import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import type { Sort } from '@torres/shared';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import {
  definirRelatorio,
  type ProvedorRelatorios,
  type ReportDefinition,
} from '../../../common/relatorios/relatorio.types';
import {
  IndicadoresGestaoService,
  type LtvPaciente,
  type TicketMedioOrigem,
} from '../../comercial-atendimento/indicadores-gestao/indicadores-gestao.service';
import { ordenarEPaginar } from '../../comercial-atendimento/relatorios/relatorios-comercial';
import {
  SalasPainelService,
  type OcupacaoSalaPeriodo,
} from '../../gestao-profissionais/salas/salas-painel.service';

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
  ) {
    this.relatorios = [
      this.logDeAcesso(),
      this.ticketMedioPorCanal(),
      this.ocupacaoPorSala(),
      this.ltvPaciente(),
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
}
