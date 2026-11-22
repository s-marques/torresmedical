import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import { EscopoDadosService, semPermissao } from '../../../common/auth/escopo-dados.service';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';

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
  ) {}

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
