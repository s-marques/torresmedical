import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import { EscopoDadosService, semPermissao } from '../../../common/auth/escopo-dados.service';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import { ProfissionaisService } from '../../gestao-profissionais/profissionais/profissionais.service';

export const SEM_ORIGEM_VENDA = 'Sem origem';

export interface Intervalo {
  gte: Date;
  lt: Date;
}

export interface TicketMedioOrigem {
  origem: string;
  vendas: number;
  total: number;
  ticketMedio: number;
}

export interface LeadsOrigem {
  origem: string;
  leads: number;
}

export interface VisitasPeriodo {
  /** Visitas marcadas no período, as canceladas não contam. */
  agendadas: number;
  realizadas: number;
  /** Médicos (contato do negócio) com visita realizada, do mais visitado ao menos. */
  medicosVisitados: Array<{ medico: string; visitas: number }>;
}

export interface LtvPaciente {
  pacienteId: string;
  paciente: string;
  vendas: number;
  valorVendas: number;
  valorConsultas: number;
  ltv: number;
}

const arredondar = (valor: number): number => Math.round(valor * 100) / 100;

/**
 * Consultas dos relatórios de Configurações / Gestão (GES-02 e GES-04) sobre vendas e consultas
 * pagas. Visão geral da administração: o usuário restrito (issue #153) recebe 403.
 */
@Injectable()
export class IndicadoresGestaoService {
  constructor(
    private readonly txHost: TransactionHost<PrismaAdapter>,
    private readonly escopo: EscopoDadosService,
    private readonly profissionais: ProfissionaisService,
  ) {}

  /** Relatório mensal da gestão (#171, R §27 item 7): negócios criados no período, por origem. */
  async leadsPorOrigem(intervalo: Intervalo): Promise<LeadsOrigem[]> {
    if (this.escopo.restrito()) throw semPermissao();
    const [grupos, origens] = await Promise.all([
      this.txHost.tx.negocio.groupBy({
        by: ['origemClienteId'],
        where: { deletedAt: null, createdAt: intervalo },
        _count: { _all: true },
      }),
      this.txHost.tx.origemCliente.findMany({ select: { id: true, nome: true } }),
    ]);
    const nomes = new Map(origens.map((o) => [o.id, o.nome]));
    return grupos.map((g) => ({
      origem: (g.origemClienteId && nomes.get(g.origemClienteId)) || SEM_ORIGEM_VENDA,
      leads: g._count._all,
    }));
  }

  /**
   * Relatório mensal da gestão (#171, R §27 item 8): atividades de visita do CRM no período, as
   * marcadas e as concluídas, e os médicos que receberam visita.
   */
  async visitasDoPeriodo(intervalo: Intervalo): Promise<VisitasPeriodo> {
    if (this.escopo.restrito()) throw semPermissao();
    const atividades = await this.txHost.tx.atividadeNegocio.findMany({
      where: {
        deletedAt: null,
        tipo: 'VISITA',
        status: { not: 'CANCELADA' },
        dataHora: intervalo,
      },
      select: {
        status: true,
        negocio: { select: { contatoTipo: true, contatoId: true } },
      },
    });
    const realizadas = atividades.filter((a) => a.status === 'CONCLUIDA');
    const porMedico = new Map<string, number>();
    for (const { negocio } of realizadas) {
      if (negocio?.contatoTipo !== 'PROFISSIONAL' || !negocio.contatoId) continue;
      porMedico.set(negocio.contatoId, (porMedico.get(negocio.contatoId) ?? 0) + 1);
    }
    const nomes = await this.profissionais.nomesPorIds([...porMedico.keys()]);
    const medicosVisitados = [...porMedico]
      .flatMap(([id, visitas]) => {
        const medico = nomes.get(id);
        return medico ? [{ medico, visitas }] : [];
      })
      .sort((a, b) => b.visitas - a.visitas || a.medico.localeCompare(b.medico, 'pt-BR'));
    return { agendadas: atividades.length, realizadas: realizadas.length, medicosVisitados };
  }

  /** GES-02: vendas finalizadas no período, agrupadas pela origem do cliente. */
  async ticketMedioPorOrigem(intervalo: Intervalo): Promise<TicketMedioOrigem[]> {
    if (this.escopo.restrito()) throw semPermissao();
    const grupos = await this.txHost.tx.venda.groupBy({
      by: ['pacienteId'],
      where: { deletedAt: null, status: 'FINALIZADA', createdAt: intervalo },
      _count: { _all: true },
      _sum: { total: true },
    });
    const ids = grupos.flatMap((g) => (g.pacienteId ? [g.pacienteId] : []));
    const pacientes = await this.txHost.tx.paciente.findMany({
      where: { id: { in: ids } },
      select: { id: true, origemClienteId: true },
    });
    const origemDoPaciente = new Map(pacientes.map((p) => [p.id, p.origemClienteId]));
    const origens = await this.txHost.tx.origemCliente.findMany({
      select: { id: true, nome: true },
    });
    const nomes = new Map(origens.map((o) => [o.id, o.nome]));
    const porOrigem = new Map<string, { vendas: number; total: number }>();
    for (const grupo of grupos) {
      const origemId = grupo.pacienteId ? origemDoPaciente.get(grupo.pacienteId) : null;
      const nome = (origemId && nomes.get(origemId)) || SEM_ORIGEM_VENDA;
      const acumulado = porOrigem.get(nome) ?? { vendas: 0, total: 0 };
      acumulado.vendas += grupo._count._all;
      acumulado.total += Number(grupo._sum.total ?? 0);
      porOrigem.set(nome, acumulado);
    }
    return [...porOrigem].map(([origem, { vendas, total }]) => ({
      origem,
      vendas,
      total: arredondar(total),
      ticketMedio: vendas === 0 ? 0 : arredondar(total / vendas),
    }));
  }

  /**
   * GES-04: por paciente, vendas finalizadas (PDV) e consultas recebidas no período. Vendas sem
   * cliente não entram: não há paciente a quem atribuir.
   */
  async ltvPorPaciente(intervalo: Intervalo): Promise<LtvPaciente[]> {
    if (this.escopo.restrito()) throw semPermissao();
    const [vendas, recebimentos] = await Promise.all([
      this.txHost.tx.venda.groupBy({
        by: ['pacienteId'],
        where: {
          deletedAt: null,
          status: 'FINALIZADA',
          createdAt: intervalo,
          pacienteId: { not: null },
        },
        _count: { _all: true },
        _sum: { total: true },
      }),
      this.txHost.tx.agendamentoRecebimento.findMany({
        where: { recebidoEm: intervalo, agendamento: { deletedAt: null } },
        select: { valor: true, agendamento: { select: { pacienteId: true } } },
      }),
    ]);
    const acumulado = new Map<string, { vendas: number; valorVendas: number; consultas: number }>();
    const linha = (id: string) => {
      const atual = acumulado.get(id) ?? { vendas: 0, valorVendas: 0, consultas: 0 };
      acumulado.set(id, atual);
      return atual;
    };
    for (const venda of vendas) {
      if (!venda.pacienteId) continue;
      const atual = linha(venda.pacienteId);
      atual.vendas += venda._count._all;
      atual.valorVendas += Number(venda._sum.total ?? 0);
    }
    for (const recebimento of recebimentos) {
      linha(recebimento.agendamento.pacienteId).consultas += Number(recebimento.valor);
    }
    const pacientes = await this.txHost.tx.paciente.findMany({
      where: { id: { in: [...acumulado.keys()] }, deletedAt: null },
      select: { id: true, nome: true },
    });
    return pacientes.map((p) => {
      const { vendas, valorVendas, consultas } = acumulado.get(p.id)!;
      return {
        pacienteId: p.id,
        paciente: p.nome,
        vendas,
        valorVendas: arredondar(valorVendas),
        valorConsultas: arredondar(consultas),
        ltv: arredondar(valorVendas + consultas),
      };
    });
  }
}
