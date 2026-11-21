import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import type { FiltroRelatorio, Sort } from '@torres/shared';
import {
  definirRelatorio,
  type ConsultaRelatorio,
  type PaginaConsulta,
  type ProvedorRelatorios,
  type ReportDefinition,
} from '../../../common/relatorios/relatorio.types';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import { PacientesVinculadosService } from '../../consultorio-assistencial/pacientes-vinculados/pacientes-vinculados.service';
import { hojeNaClinica } from '../pacotes/pacotes.service';

export const SEM_ORIGEM = 'Sem origem';
export const SEM_MOTIVO = 'Sem motivo informado';

/** Padrões dos filtros opcionais (decisão do dev: 90 dias sem retorno, até 2 sessões de saldo). */
export const DIAS_SEM_RETORNO_PADRAO = 90;
export const SALDO_PACOTE_PADRAO = 2;

const DIA_MS = 86_400_000;

const FILTRO_DIAS: FiltroRelatorio = {
  tipo: 'select',
  parametro: 'dias',
  rotulo: 'Sem retorno há mais de',
  opcoes: [30, 60, 90, 180].map((d) => ({ valor: String(d), rotulo: `${d} dias` })),
};

const FILTRO_SALDO: FiltroRelatorio = {
  tipo: 'select',
  parametro: 'saldo',
  rotulo: 'Saldo de até',
  opcoes: [1, 2, 3, 5].map((s) => ({
    valor: String(s),
    rotulo: s === 1 ? '1 sessão' : `${s} sessões`,
  })),
};

export interface LinhaConversao {
  origem: string;
  total: number;
  ganhos: number;
  perdidos: number;
  emAberto: number;
  /** Ganhos ÷ total, em % com 1 casa. */
  taxa: number;
}

export interface LinhaSemRetorno {
  paciente: string;
  telefone: string | null;
  ultimoAtendimento: Date;
  diasSemRetorno: number;
}

export interface LinhaPacote {
  cliente: string;
  pacote: string;
  sessoes: number;
  usadas: number;
  saldo: number;
  vencimento: Date | null;
  profissional: string | null;
}

export interface LinhaMotivoPerda {
  motivo: string;
  quantidade: number;
  valorPerdido: number;
  /** Quantidade ÷ total de perdas do período, em % com 1 casa. */
  participacao: number;
}

const percentual = (parte: number, total: number): number =>
  total === 0 ? 0 : Math.round((parte / total) * 1000) / 10;

function comparar(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (a === null || a === undefined) return 1;
  if (b === null || b === undefined) return -1;
  if (typeof a === 'string' && typeof b === 'string') return a.localeCompare(b, 'pt-BR');
  return a < b ? -1 : 1;
}

/** Ordena e pagina em memória: relatórios agrupados são pequenos (uma linha por origem/motivo/paciente). */
export function ordenarEPaginar<T extends object>(
  linhas: readonly T[],
  sort: Sort | undefined,
  pagina?: PaginaConsulta,
): T[] {
  const ordenadas = sort
    ? [...linhas].sort((a, b) => {
        const campo = sort.field as keyof T;
        const resultado = comparar(a[campo], b[campo]);
        return sort.direction === 'desc' ? -resultado : resultado;
      })
    : [...linhas];
  return pagina ? ordenadas.slice(pagina.skip, pagina.skip + pagina.take) : ordenadas;
}

/**
 * Relatórios da tela Relatórios Comerciais (`/crm/relatorios`): COM-01 a COM-04. Cada um usa a
 * consulta do dono dos dados (negócios, pacotes, pacientes) e respeita o período De/Até.
 */
@Injectable()
export class RelatoriosComercial implements ProvedorRelatorios {
  readonly relatorios: readonly ReportDefinition[];

  constructor(
    private readonly txHost: TransactionHost<PrismaAdapter>,
    private readonly vinculados: PacientesVinculadosService,
  ) {
    this.relatorios = [
      this.conversaoPorOrigem(),
      this.pacientesSemRetorno(),
      this.pacotesAcabando(),
      this.motivosDePerda(),
    ];
  }

  /** COM-01: negócios criados no período, por origem do cliente. */
  async linhasConversao({ intervalo }: ConsultaRelatorio): Promise<LinhaConversao[]> {
    const grupos = await this.txHost.tx.negocio.groupBy({
      by: ['origemClienteId', 'status'],
      where: { deletedAt: null, createdAt: intervalo },
      _count: { _all: true },
    });
    const nomes = await this.nomesOrigens(grupos.map((g) => g.origemClienteId));
    const porOrigem = new Map<string | null, LinhaConversao>();
    for (const grupo of grupos) {
      const chave = grupo.origemClienteId;
      const linha = porOrigem.get(chave) ?? {
        origem: chave ? (nomes.get(chave) ?? SEM_ORIGEM) : SEM_ORIGEM,
        total: 0,
        ganhos: 0,
        perdidos: 0,
        emAberto: 0,
        taxa: 0,
      };
      const quantidade = grupo._count._all;
      linha.total += quantidade;
      if (grupo.status === 'GANHO') linha.ganhos += quantidade;
      else if (grupo.status === 'PERDIDO') linha.perdidos += quantidade;
      else linha.emAberto += quantidade;
      linha.taxa = percentual(linha.ganhos, linha.total);
      porOrigem.set(chave, linha);
    }
    return [...porOrigem.values()];
  }

  /** COM-02: último atendimento finalizado no período e há mais de N dias. */
  async linhasSemRetorno(
    { intervalo, filtros }: ConsultaRelatorio,
    agora = new Date(),
  ): Promise<LinhaSemRetorno[]> {
    const dias = Number(filtros.dias ?? DIAS_SEM_RETORNO_PADRAO);
    const limite = new Date(agora.getTime() - dias * DIA_MS);
    const fim = limite < intervalo.lt ? limite : intervalo.lt;
    if (fim <= intervalo.gte) return [];
    const ultimos = await this.vinculados.ultimosAtendimentos({ gte: intervalo.gte, lt: fim });
    if (ultimos.length === 0) return [];
    const pacientes = await this.txHost.tx.paciente.findMany({
      where: { id: { in: ultimos.map((u) => u.pacienteId) }, deletedAt: null, status: 'ATIVO' },
      select: { id: true, nome: true, celular: true, telefone: true },
    });
    const porId = new Map(pacientes.map((p) => [p.id, p]));
    return ultimos.flatMap((ultimo) => {
      const paciente = porId.get(ultimo.pacienteId);
      if (!paciente) return [];
      return [
        {
          paciente: paciente.nome,
          telefone: paciente.celular ?? paciente.telefone,
          ultimoAtendimento: ultimo.ultimoEm,
          diasSemRetorno: Math.floor((agora.getTime() - ultimo.ultimoEm.getTime()) / DIA_MS),
        },
      ];
    });
  }

  /** COM-03: pacotes ativos criados no período com saldo de sessões baixo (mas ainda positivo). */
  async linhasPacotes({ intervalo, filtros }: ConsultaRelatorio): Promise<LinhaPacote[]> {
    const limite = Number(filtros.saldo ?? SALDO_PACOTE_PADRAO);
    const pacotes = await this.txHost.tx.pacote.findMany({
      where: { deletedAt: null, status: 'ATIVO', createdAt: intervalo },
      include: { paciente: { select: { nome: true } }, profissional: { select: { nome: true } } },
    });
    const hoje = hojeNaClinica();
    return pacotes
      .filter((p) => {
        const saldo = p.sessoesTotal - p.sessoesUsadas;
        const vencido = p.dataVencimento
          ? p.dataVencimento.toISOString().slice(0, 10) < hoje
          : false;
        return saldo > 0 && saldo <= limite && !vencido;
      })
      .map((p) => ({
        cliente: p.paciente.nome,
        pacote: p.nome,
        sessoes: p.sessoesTotal,
        usadas: p.sessoesUsadas,
        saldo: p.sessoesTotal - p.sessoesUsadas,
        vencimento: p.dataVencimento,
        profissional: p.profissional?.nome ?? null,
      }));
  }

  /** COM-04: negócios perdidos no período (`fechadoEm`), por motivo de perda. */
  async linhasMotivosPerda({ intervalo }: ConsultaRelatorio): Promise<LinhaMotivoPerda[]> {
    const grupos = await this.txHost.tx.negocio.groupBy({
      by: ['motivoPerdaId'],
      where: { deletedAt: null, status: 'PERDIDO', fechadoEm: intervalo },
      _count: { _all: true },
      _sum: { valor: true },
    });
    const ids = grupos.flatMap((g) => (g.motivoPerdaId ? [g.motivoPerdaId] : []));
    const motivos = await this.txHost.tx.motivoPerda.findMany({
      where: { id: { in: ids } },
      select: { id: true, nome: true },
    });
    const nomes = new Map(motivos.map((m) => [m.id, m.nome]));
    const total = grupos.reduce((soma, g) => soma + g._count._all, 0);
    return grupos.map((g) => ({
      motivo: g.motivoPerdaId ? (nomes.get(g.motivoPerdaId) ?? SEM_MOTIVO) : SEM_MOTIVO,
      quantidade: g._count._all,
      valorPerdido: Number(g._sum.valor ?? 0),
      participacao: percentual(g._count._all, total),
    }));
  }

  private async nomesOrigens(ids: readonly (string | null)[]): Promise<Map<string, string>> {
    const validos = ids.flatMap((id) => (id ? [id] : []));
    const origens = await this.txHost.tx.origemCliente.findMany({
      where: { id: { in: validos } },
      select: { id: true, nome: true },
    });
    return new Map(origens.map((o) => [o.id, o.nome]));
  }

  private conversaoPorOrigem(): ReportDefinition {
    return definirRelatorio<LinhaConversao>({
      id: 'COM-01',
      nome: 'Taxa de Conversão por Origem',
      permissao: 'comercial-atendimento.negocios.ver',
      colunas: [
        { key: 'origem', header: 'Origem', value: (l) => l.origem, width: 3, ordenavel: true },
        {
          key: 'total',
          header: 'Negócios',
          type: 'number',
          value: (l) => l.total,
          ordenavel: true,
        },
        {
          key: 'ganhos',
          header: 'Ganhos',
          type: 'number',
          value: (l) => l.ganhos,
          ordenavel: true,
        },
        {
          key: 'perdidos',
          header: 'Perdidos',
          type: 'number',
          value: (l) => l.perdidos,
          ordenavel: true,
        },
        { key: 'emAberto', header: 'Em aberto', type: 'number', value: (l) => l.emAberto },
        {
          key: 'taxa',
          header: 'Conversão (%)',
          type: 'number',
          value: (l) => l.taxa,
          ordenavel: true,
        },
      ],
      ordenacaoPadrao: 'taxa:desc',
      buscar: async (consulta, pagina) =>
        ordenarEPaginar(await this.linhasConversao(consulta), consulta.sort, pagina),
      contar: async (consulta) => (await this.linhasConversao(consulta)).length,
    });
  }

  private pacientesSemRetorno(): ReportDefinition {
    return definirRelatorio<LinhaSemRetorno>({
      id: 'COM-02',
      nome: 'Pacientes Sem Retorno',
      permissao: 'comercial-atendimento.pacientes.ver',
      colunas: [
        {
          key: 'paciente',
          header: 'Paciente',
          value: (l) => l.paciente,
          width: 3,
          ordenavel: true,
        },
        { key: 'telefone', header: 'Telefone', value: (l) => l.telefone, width: 2 },
        {
          key: 'ultimoAtendimento',
          header: 'Último atendimento',
          type: 'date',
          value: (l) => l.ultimoAtendimento,
          ordenavel: true,
        },
        {
          key: 'diasSemRetorno',
          header: 'Dias sem retorno',
          type: 'number',
          value: (l) => l.diasSemRetorno,
          ordenavel: true,
        },
      ],
      ordenacaoPadrao: 'diasSemRetorno:desc',
      filtros: [FILTRO_DIAS],
      buscar: async (consulta, pagina) =>
        ordenarEPaginar(await this.linhasSemRetorno(consulta), consulta.sort, pagina),
      contar: async (consulta) => (await this.linhasSemRetorno(consulta)).length,
    });
  }

  private pacotesAcabando(): ReportDefinition {
    return definirRelatorio<LinhaPacote>({
      id: 'COM-03',
      nome: 'Pacotes Acabando',
      permissao: 'comercial-atendimento.pacotes.ver',
      colunas: [
        { key: 'cliente', header: 'Cliente', value: (l) => l.cliente, width: 3, ordenavel: true },
        { key: 'pacote', header: 'Pacote', value: (l) => l.pacote, width: 3, ordenavel: true },
        { key: 'sessoes', header: 'Sessões', type: 'number', value: (l) => l.sessoes },
        { key: 'usadas', header: 'Usadas', type: 'number', value: (l) => l.usadas },
        {
          key: 'saldo',
          header: 'Saldo',
          type: 'number',
          value: (l) => l.saldo,
          ordenavel: true,
        },
        {
          key: 'vencimento',
          header: 'Vencimento',
          type: 'date',
          value: (l) => l.vencimento,
          ordenavel: true,
        },
        { key: 'profissional', header: 'Profissional', value: (l) => l.profissional, width: 2 },
      ],
      ordenacaoPadrao: 'saldo:asc',
      filtros: [FILTRO_SALDO],
      buscar: async (consulta, pagina) =>
        ordenarEPaginar(await this.linhasPacotes(consulta), consulta.sort, pagina),
      contar: async (consulta) => (await this.linhasPacotes(consulta)).length,
    });
  }

  private motivosDePerda(): ReportDefinition {
    return definirRelatorio<LinhaMotivoPerda>({
      id: 'COM-04',
      nome: 'Motivo de Perda',
      permissao: 'comercial-atendimento.negocios.ver',
      colunas: [
        { key: 'motivo', header: 'Motivo', value: (l) => l.motivo, width: 3, ordenavel: true },
        {
          key: 'quantidade',
          header: 'Negócios perdidos',
          type: 'number',
          value: (l) => l.quantidade,
          ordenavel: true,
        },
        {
          key: 'valorPerdido',
          header: 'Valor perdido (R$)',
          type: 'currency',
          value: (l) => l.valorPerdido,
          ordenavel: true,
        },
        {
          key: 'participacao',
          header: 'Participação (%)',
          type: 'number',
          value: (l) => l.participacao,
          ordenavel: true,
        },
      ],
      ordenacaoPadrao: 'quantidade:desc',
      buscar: async (consulta, pagina) =>
        ordenarEPaginar(await this.linhasMotivosPerda(consulta), consulta.sort, pagina),
      contar: async (consulta) => (await this.linhasMotivosPerda(consulta)).length,
    });
  }
}
