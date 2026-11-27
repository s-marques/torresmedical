import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import type { FiltroRelatorio } from '@torres/shared';
import { EscopoDadosService } from '../../../common/auth/escopo-dados.service';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import {
  definirRelatorio,
  type ColunaRelatorioDef,
  type ConsultaRelatorio,
  type ProvedorRelatorios,
  type ReportDefinition,
} from '../../../common/relatorios/relatorio.types';
import { ordenarEPaginar } from '../../comercial-atendimento/relatorios/relatorios-comercial';
import { hojeNaClinica } from '../../comercial-atendimento/pacotes/pacotes.service';

export const PENDENTE_DE_REGISTRO = 'Pendente de Registro';
export const SEM_FORMA = 'Sem forma de pagamento';
export const SEM_PACIENTE = 'Sem paciente';

const STATUS_ATENDIDO = ['ATENDIDO', 'EM_ATENDIMENTO'] as const;
const STATUS_ATENDIMENTO: Readonly<Record<string, string>> = {
  ATENDIDO: 'Atendido',
  EM_ATENDIMENTO: 'Em atendimento',
};

const DIA_MS = 86_400_000;

/** Faixas de atraso do RP-09 (inferência a confirmar com o dev): limite superior em dias. */
export const FAIXAS_VENCIMENTO = [
  { rotulo: 'A vencer', ate: 0 },
  { rotulo: '1 a 30 dias', ate: 30 },
  { rotulo: '31 a 60 dias', ate: 60 },
  { rotulo: '61 a 90 dias', ate: 90 },
  { rotulo: 'Mais de 90 dias', ate: Number.POSITIVE_INFINITY },
] as const;

const FILTRO_PROFISSIONAL: FiltroRelatorio = {
  tipo: 'entidade',
  parametro: 'profissionalId',
  rotulo: 'Profissional',
  entidade: 'profissionais',
};

const FILTRO_FORMA: FiltroRelatorio = {
  tipo: 'entidade',
  parametro: 'formaPagamentoId',
  rotulo: 'Forma de Pagamento',
  entidade: 'formas-pagamento',
};

/** Receita lançada para o profissional (conta a receber com `profissionalId`). */
export interface Lancamento {
  profissionalId: string;
  profissional: string;
  paciente: string;
  forma: string | null;
  descricao: string;
  valor: number;
  /** Recebimento (recebidos) ou vencimento (pendentes). */
  data: Date;
}

/** Atendimento realizado (agendamento ATENDIDO ou EM_ATENDIMENTO). */
export interface Atendimento {
  numero: number;
  data: Date;
  profissionalId: string;
  profissional: string;
  pacienteId: string;
  paciente: string;
  tipo: string | null;
  valor: number;
  status: string;
  /** Sem `pagoEm` e sem nenhum recebimento da consulta. */
  semRegistro: boolean;
}

export interface LinhaReceitaProfissional {
  profissional: string;
  atendimentos: number;
  recebido: number;
  pendente: number;
  total: number;
}

export interface LinhaDetalhado {
  data: Date;
  profissional: string;
  paciente: string;
  forma: string | null;
  valor: number;
  status: string;
}

export interface LinhaPorForma {
  forma: string;
  quantidade: number;
  total: number;
}

export interface LinhaPendente {
  vencimento: Date;
  profissional: string;
  paciente: string;
  descricao: string;
  valor: number;
  diasAtraso: number;
  origem: string;
}

export interface LinhaAtendimentosProfissional {
  profissional: string;
  atendimentos: number;
  pacientesUnicos: number;
  valorTotal: number;
}

export interface LinhaFaturamento {
  periodo: string;
  quantidade: number;
  valor: number;
}

export interface LinhaReceitaPaciente {
  paciente: string;
  quantidade: number;
  valor: number;
  ultimoLancamento: Date;
}

export interface LinhaSemRecebimento {
  data: Date;
  profissional: string;
  paciente: string;
  tipo: string | null;
  valor: number;
  status: string;
}

export interface LinhaResumoPendentes {
  profissional: string;
  totalAtendimentos: number;
  valorTotal: number;
  semRecebimento: number;
  valorPendente: number | null;
}

export interface LinhaInadimplencia {
  vencimento: Date;
  profissional: string;
  paciente: string;
  descricao: string;
  valor: number;
  diasAtraso: number;
}

export interface LinhaFaixaVencimento {
  faixa: string;
  quantidade: number;
  valor: number;
}

export interface LinhaPagamentoEmAndamento {
  paciente: string;
  profissional: string;
  total: number;
  recebido: number;
  saldo: number;
  parcelas: string;
}

export interface LinhaConsultasPorForma {
  profissional: string;
  forma: string;
  consultas: number;
  total: number;
}

const num = (valor: { toNumber(): number } | null | undefined): number => valor?.toNumber() ?? 0;
const arredondar = (valor: number): number => Math.round(valor * 100) / 100;
const somar = (valores: Iterable<number>): number =>
  arredondar([...valores].reduce((a, b) => a + b, 0));

/** `AAAA-MM-DD` como data de calendário (UTC), para as colunas `@db.Date`. */
const diaUtc = (data: string): Date => new Date(`${data}T00:00:00Z`);

const coluna = <T>(
  key: keyof T & string,
  header: string,
  extra: Partial<ColunaRelatorioDef<T>> = {},
): ColunaRelatorioDef<T> => ({
  key,
  header,
  value: (linha) => linha[key] as never,
  ordenavel: true,
  ...extra,
});

function agrupar<T>(itens: readonly T[], chave: (item: T) => string): Map<string, T[]> {
  const grupos = new Map<string, T[]>();
  for (const item of itens) {
    const grupo = grupos.get(chave(item));
    if (grupo) grupo.push(item);
    else grupos.set(chave(item), [item]);
  }
  return grupos;
}

const porNome = (a: string, b: string): number => a.localeCompare(b, 'pt-BR');

/**
 * Relatórios da tela Relatórios de Receita Profissionais (`/receita-profissionais/relatorios`):
 * RP-01 a RP-13. Recebido e pendente vêm das contas a receber do profissional
 * (tela Receita Profissionais); "sem registro" são os atendimentos realizados sem nenhum
 * recebimento da consulta. Todos aplicam o escopo por profissional (issue #153).
 * RP-08, RP-09 e RP-10 não têm dados de referência no legado: as regras foram propostas por nós
 * e aprovadas pelo dev (ver a descrição do PR #264).
 */
@Injectable()
export class RelatoriosReceitaProfissionais implements ProvedorRelatorios {
  readonly relatorios: readonly ReportDefinition[];

  constructor(
    private readonly txHost: TransactionHost<PrismaAdapter>,
    private readonly escopo: EscopoDadosService,
  ) {
    this.relatorios = [
      this.receitaPorProfissional(),
      this.detalhado(),
      this.porFormaDePagamento(),
      this.pendentes(),
      this.atendimentosPorProfissional(),
      this.faturamentoPorPeriodo(),
      this.receitaPorPaciente(),
      this.inadimplencia(),
      this.contasPorFaixaDeVencimento(),
      this.pagamentosEmAndamento(),
      this.agendamentosSemRecebimento(),
      this.resumoPendentesPorProfissional(),
      this.consultasPorProfissionalEForma(),
    ];
  }

  // ---------------------------------------------------------------- consultas

  private filtroProfissional(consulta: ConsultaRelatorio) {
    return this.escopo.filtroProfissional(consulta.filtros.profissionalId);
  }

  /** Receitas do profissional. Recebidas: pela data do recebimento; pendentes: pelo vencimento. */
  async lancamentos(
    consulta: ConsultaRelatorio,
    status: 'RECEBIDO' | 'PENDENTE',
    { periodo = true, forma = true } = {},
  ): Promise<Lancamento[]> {
    const campo = status === 'RECEBIDO' ? 'dataRecebimento' : 'dataVencimento';
    const formaId = forma ? consulta.filtros.formaPagamentoId : undefined;
    const contas = await this.txHost.tx.contaReceber.findMany({
      where: {
        deletedAt: null,
        status,
        profissionalId: this.filtroProfissional(consulta) ?? { not: null },
        ...(formaId && { formaPagamentoId: formaId }),
        ...(periodo && {
          [campo]: { gte: diaUtc(consulta.periodo.de), lte: diaUtc(consulta.periodo.ate) },
        }),
      },
      include: {
        profissional: { select: { nome: true } },
        paciente: { select: { nome: true } },
        formaPagamento: { select: { nome: true } },
      },
    });
    return contas.map((c) => ({
      profissionalId: c.profissionalId ?? '',
      profissional: c.profissional?.nome ?? '',
      paciente: c.paciente?.nome ?? SEM_PACIENTE,
      forma: c.formaPagamento?.nome ?? null,
      descricao: c.descricao,
      valor: num(c.valor),
      data: (status === 'RECEBIDO' ? c.dataRecebimento : c.dataVencimento) ?? c.dataVencimento,
    }));
  }

  /** Atendimentos realizados no período (ou em qualquer data, em `periodo: false`). */
  async atendimentos(
    consulta: ConsultaRelatorio,
    { periodo = true, somenteSemRegistro = false } = {},
  ): Promise<Atendimento[]> {
    const agendamentos = await this.txHost.tx.agendamento.findMany({
      where: {
        deletedAt: null,
        status: { in: [...STATUS_ATENDIDO] },
        profissionalId: this.filtroProfissional(consulta),
        ...(periodo && { inicio: consulta.intervalo }),
        ...(somenteSemRegistro && { pagoEm: null, recebimentos: { none: {} } }),
      },
      include: {
        profissional: { select: { nome: true } },
        paciente: { select: { nome: true } },
        tipoAgendamento: { select: { nome: true } },
        _count: { select: { recebimentos: true } },
      },
      orderBy: [{ inicio: 'desc' }, { numero: 'desc' }],
    });
    return agendamentos.map((a) => ({
      numero: a.numero,
      data: a.inicio,
      profissionalId: a.profissionalId,
      profissional: a.profissional.nome,
      pacienteId: a.pacienteId,
      paciente: a.paciente.nome,
      tipo: a.tipoAgendamento?.nome ?? null,
      valor: num(a.valor),
      status: a.status,
      semRegistro: a.pagoEm === null && a._count.recebimentos === 0,
    }));
  }

  // ------------------------------------------------------------- RP-01 a RP-03

  /** RP-01: recebido e pendente (com os atendimentos sem registro) por profissional. */
  async linhasReceitaPorProfissional(
    consulta: ConsultaRelatorio,
  ): Promise<LinhaReceitaProfissional[]> {
    const [recebidos, pendentes, atendimentos] = await Promise.all([
      this.lancamentos(consulta, 'RECEBIDO', { forma: false }),
      this.lancamentos(consulta, 'PENDENTE', { forma: false }),
      this.atendimentos(consulta),
    ]);
    const linhas = new Map<string, LinhaReceitaProfissional>();
    const linha = (id: string, nome: string) => {
      let atual = linhas.get(id);
      if (!atual) {
        atual = { profissional: nome, atendimentos: 0, recebido: 0, pendente: 0, total: 0 };
        linhas.set(id, atual);
      }
      return atual;
    };
    for (const r of recebidos) linha(r.profissionalId, r.profissional).recebido += r.valor;
    for (const p of pendentes) linha(p.profissionalId, p.profissional).pendente += p.valor;
    for (const a of atendimentos) {
      const atual = linha(a.profissionalId, a.profissional);
      atual.atendimentos += 1;
      if (a.semRegistro) atual.pendente += a.valor;
    }
    return [...linhas.values()]
      .map((l) => ({
        ...l,
        recebido: arredondar(l.recebido),
        pendente: arredondar(l.pendente),
        total: arredondar(l.recebido + l.pendente),
      }))
      .sort((a, b) => porNome(a.profissional, b.profissional));
  }

  private receitaPorProfissional(): ReportDefinition {
    return definirRelatorio<LinhaReceitaProfissional>({
      id: 'RP-01',
      nome: 'Receita por Profissional',
      permissao: 'gestao-profissionais.receita-profissionais.ver',
      colunas: [
        coluna('profissional', 'Profissional', { width: 4 }),
        coluna('atendimentos', 'Atend.', { type: 'number' }),
        coluna('recebido', 'Recebido', { type: 'currency' }),
        coluna('pendente', 'Pendente', { type: 'currency' }),
        coluna('total', 'Total', { type: 'currency' }),
      ],
      ordenacaoPadrao: 'profissional:asc',
      buscar: async (consulta, pagina) =>
        ordenarEPaginar(await this.linhasReceitaPorProfissional(consulta), consulta.sort, pagina),
      contar: async (consulta) => (await this.linhasReceitaPorProfissional(consulta)).length,
      totais: async (consulta) => ({
        total: somar((await this.linhasReceitaPorProfissional(consulta)).map((l) => l.total)),
      }),
    });
  }

  /** RP-02: recebimentos, pendentes e atendimentos sem registro no período. */
  async linhasDetalhado(consulta: ConsultaRelatorio): Promise<LinhaDetalhado[]> {
    // Com forma escolhida, os atendimentos sem registro (que não têm forma) saem.
    const [recebidos, pendentes, semRegistro] = await Promise.all([
      this.lancamentos(consulta, 'RECEBIDO'),
      this.lancamentos(consulta, 'PENDENTE'),
      consulta.filtros.formaPagamentoId
        ? Promise.resolve([])
        : this.atendimentos(consulta, { somenteSemRegistro: true }),
    ]);
    const deLancamento =
      (status: string) =>
      (l: Lancamento): LinhaDetalhado => ({
        data: l.data,
        profissional: l.profissional,
        paciente: l.paciente,
        forma: l.forma,
        valor: l.valor,
        status,
      });
    return [
      ...recebidos.map(deLancamento('Recebido')),
      ...pendentes.map(deLancamento('Pendente')),
      ...semRegistro.map((a): LinhaDetalhado => ({
        data: a.data,
        profissional: a.profissional,
        paciente: a.paciente,
        forma: null,
        valor: a.valor,
        status: 'Sem registro',
      })),
    ];
  }

  private detalhado(): ReportDefinition {
    return definirRelatorio<LinhaDetalhado>({
      id: 'RP-02',
      nome: 'Detalhado (Recebidos + Pendentes)',
      permissao: 'gestao-profissionais.receita-profissionais.ver',
      colunas: [
        coluna('data', 'Data da Consulta', { type: 'date' }),
        coluna('profissional', 'Profissional', { width: 3 }),
        coluna('paciente', 'Paciente', { width: 3 }),
        coluna('forma', 'Forma Pgto', { width: 2 }),
        coluna('valor', 'Valor', { type: 'currency' }),
        coluna('status', 'Status', { ordenavel: false }),
      ],
      ordenacaoPadrao: 'data:desc',
      filtros: [FILTRO_PROFISSIONAL, FILTRO_FORMA],
      buscar: async (consulta, pagina) =>
        ordenarEPaginar(await this.linhasDetalhado(consulta), consulta.sort, pagina),
      contar: async (consulta) => (await this.linhasDetalhado(consulta)).length,
    });
  }

  /** RP-03: recebido por forma de pagamento, mais a categoria "Pendente de Registro". */
  async linhasPorForma(consulta: ConsultaRelatorio): Promise<LinhaPorForma[]> {
    const [recebidos, semRegistro] = await Promise.all([
      this.lancamentos(consulta, 'RECEBIDO', { forma: false }),
      this.atendimentos(consulta, { somenteSemRegistro: true }),
    ]);
    const linhas: LinhaPorForma[] = [...agrupar(recebidos, (r) => r.forma ?? SEM_FORMA)].map(
      ([forma, itens]) => ({
        forma,
        quantidade: itens.length,
        total: somar(itens.map((i) => i.valor)),
      }),
    );
    if (semRegistro.length > 0) {
      linhas.push({
        forma: PENDENTE_DE_REGISTRO,
        quantidade: semRegistro.length,
        total: somar(semRegistro.map((a) => a.valor)),
      });
    }
    return linhas.sort((a, b) => b.total - a.total || porNome(a.forma, b.forma));
  }

  private porFormaDePagamento(): ReportDefinition {
    return definirRelatorio<LinhaPorForma>({
      id: 'RP-03',
      nome: 'Por Forma de Pagamento',
      permissao: 'gestao-profissionais.receita-profissionais.ver',
      colunas: [
        coluna('forma', 'Forma de Pagamento', { width: 4 }),
        coluna('quantidade', 'Qtd', { type: 'number' }),
        coluna('total', 'Total', { type: 'currency' }),
      ],
      ordenacaoPadrao: 'total:desc',
      buscar: async (consulta, pagina) =>
        ordenarEPaginar(await this.linhasPorForma(consulta), consulta.sort, pagina),
      contar: async (consulta) => (await this.linhasPorForma(consulta)).length,
      totais: async (consulta) => ({
        total: somar((await this.linhasPorForma(consulta)).map((l) => l.total)),
      }),
    });
  }

  // ---------------------------------------------------------------------- RP-04

  /** RP-04: parcelas pendentes e atendimentos sem registro, de qualquer data (não usa o período). */
  async linhasPendentes(
    consulta: ConsultaRelatorio,
    hoje = hojeNaClinica(),
  ): Promise<LinhaPendente[]> {
    const [parcelas, semRegistro] = await Promise.all([
      this.lancamentos(consulta, 'PENDENTE', { periodo: false }),
      this.atendimentos(consulta, { periodo: false, somenteSemRegistro: true }),
    ]);
    const atraso = (vencimento: string) =>
      Math.max(0, Math.round((diaUtc(hoje).getTime() - diaUtc(vencimento).getTime()) / DIA_MS));
    return [
      ...parcelas.map((p): LinhaPendente => ({
        vencimento: p.data,
        profissional: p.profissional,
        paciente: p.paciente,
        descricao: p.descricao,
        valor: p.valor,
        diasAtraso: atraso(p.data.toISOString().slice(0, 10)),
        origem: 'Parcela',
      })),
      ...semRegistro.map((a): LinhaPendente => ({
        vencimento: a.data,
        profissional: a.profissional,
        paciente: a.paciente,
        descricao: `${a.tipo ?? 'Atendimento'} #${a.numero}`,
        valor: a.valor,
        diasAtraso: atraso(a.data.toISOString().slice(0, 10)),
        origem: 'Sem Registro',
      })),
    ];
  }

  private pendentes(): ReportDefinition {
    return definirRelatorio<LinhaPendente>({
      id: 'RP-04',
      nome: 'Pendentes (Parcelas + Sem Registro)',
      permissao: 'gestao-profissionais.receita-profissionais.ver',
      colunas: [
        coluna('vencimento', 'Vencimento', { type: 'date' }),
        coluna('profissional', 'Profissional', { width: 3 }),
        coluna('paciente', 'Paciente', { width: 3 }),
        coluna('descricao', 'Descrição', { width: 3, ordenavel: false }),
        coluna('valor', 'Valor', { type: 'currency' }),
        coluna('diasAtraso', 'Dias Atraso', { type: 'number' }),
        coluna('origem', 'Origem', { ordenavel: false }),
      ],
      ordenacaoPadrao: 'vencimento:asc',
      buscar: async (consulta, pagina) =>
        ordenarEPaginar(await this.linhasPendentes(consulta), consulta.sort, pagina),
      contar: async (consulta) => (await this.linhasPendentes(consulta)).length,
    });
  }

  // ---------------------------------------------------------------- RP-05 e RP-06

  /** RP-05: atendimentos realizados no período, por profissional. */
  async linhasAtendimentosPorProfissional(
    consulta: ConsultaRelatorio,
  ): Promise<LinhaAtendimentosProfissional[]> {
    const atendimentos = await this.atendimentos(consulta);
    return [...agrupar(atendimentos, (a) => a.profissionalId).values()]
      .map((itens) => ({
        profissional: itens[0]?.profissional ?? '',
        atendimentos: itens.length,
        pacientesUnicos: new Set(itens.map((i) => i.pacienteId)).size,
        valorTotal: somar(itens.map((i) => i.valor)),
      }))
      .sort((a, b) => b.atendimentos - a.atendimentos || porNome(a.profissional, b.profissional));
  }

  private atendimentosPorProfissional(): ReportDefinition {
    return definirRelatorio<LinhaAtendimentosProfissional>({
      id: 'RP-05',
      nome: 'Atendimentos por Profissional',
      permissao: 'gestao-profissionais.receita-profissionais.ver',
      colunas: [
        coluna('profissional', 'Profissional', { width: 4 }),
        coluna('atendimentos', 'Atendimentos', { type: 'number' }),
        coluna('pacientesUnicos', 'Pacientes Únicos', { type: 'number' }),
        coluna('valorTotal', 'Valor Total', { type: 'currency' }),
      ],
      ordenacaoPadrao: 'atendimentos:desc',
      buscar: async (consulta, pagina) =>
        ordenarEPaginar(
          await this.linhasAtendimentosPorProfissional(consulta),
          consulta.sort,
          pagina,
        ),
      contar: async (consulta) => (await this.linhasAtendimentosPorProfissional(consulta)).length,
      totais: async (consulta) => ({
        valorTotal: somar(
          (await this.linhasAtendimentosPorProfissional(consulta)).map((l) => l.valorTotal),
        ),
      }),
    });
  }

  /** RP-06: recebimentos do período agrupados por mês (`AAAA-MM`). */
  async linhasFaturamento(consulta: ConsultaRelatorio): Promise<LinhaFaturamento[]> {
    const recebidos = await this.lancamentos(consulta, 'RECEBIDO', { forma: false });
    return [...agrupar(recebidos, (r) => r.data.toISOString().slice(0, 7))]
      .map(([periodo, itens]) => ({
        periodo,
        quantidade: itens.length,
        valor: somar(itens.map((i) => i.valor)),
      }))
      .sort((a, b) => a.periodo.localeCompare(b.periodo));
  }

  private faturamentoPorPeriodo(): ReportDefinition {
    return definirRelatorio<LinhaFaturamento>({
      id: 'RP-06',
      nome: 'Faturamento por Período',
      permissao: 'gestao-profissionais.receita-profissionais.ver',
      colunas: [
        coluna('periodo', 'Período'),
        coluna('quantidade', 'Qtd Recebimentos', { type: 'number' }),
        coluna('valor', 'Valor Total', { type: 'currency' }),
      ],
      ordenacaoPadrao: 'periodo:asc',
      buscar: async (consulta, pagina) =>
        ordenarEPaginar(await this.linhasFaturamento(consulta), consulta.sort, pagina),
      contar: async (consulta) => (await this.linhasFaturamento(consulta)).length,
      totais: async (consulta) => ({
        valor: somar((await this.linhasFaturamento(consulta)).map((l) => l.valor)),
      }),
    });
  }

  // ---------------------------------------------------------------- RP-07 e RP-11

  /** RP-07: recebimentos do período agrupados por paciente. */
  async linhasReceitaPorPaciente(consulta: ConsultaRelatorio): Promise<LinhaReceitaPaciente[]> {
    const recebidos = await this.lancamentos(consulta, 'RECEBIDO', { forma: false });
    return [...agrupar(recebidos, (r) => r.paciente)]
      .map(([paciente, itens]) => ({
        paciente,
        quantidade: itens.length,
        valor: somar(itens.map((i) => i.valor)),
        ultimoLancamento: new Date(Math.max(...itens.map((i) => i.data.getTime()))),
      }))
      .sort((a, b) => b.valor - a.valor || porNome(a.paciente, b.paciente));
  }

  private receitaPorPaciente(): ReportDefinition {
    return definirRelatorio<LinhaReceitaPaciente>({
      id: 'RP-07',
      nome: 'Receita por Paciente',
      permissao: 'gestao-profissionais.receita-profissionais.ver',
      colunas: [
        coluna('paciente', 'Paciente', { width: 4 }),
        coluna('quantidade', 'Qtd Lançamentos', { type: 'number' }),
        coluna('valor', 'Valor Total', { type: 'currency' }),
        coluna('ultimoLancamento', 'Último Lançamento', { type: 'date' }),
      ],
      ordenacaoPadrao: 'valor:desc',
      buscar: async (consulta, pagina) =>
        ordenarEPaginar(await this.linhasReceitaPorPaciente(consulta), consulta.sort, pagina),
      contar: async (consulta) => (await this.linhasReceitaPorPaciente(consulta)).length,
      totais: async (consulta) => ({
        valor: somar((await this.linhasReceitaPorPaciente(consulta)).map((l) => l.valor)),
      }),
    });
  }

  // ---------------------------------------------------------------- RP-08 a RP-10

  private diasDeAtraso(vencimento: Date, hoje: string): number {
    const dia = vencimento.toISOString().slice(0, 10);
    return Math.round((diaUtc(hoje).getTime() - diaUtc(dia).getTime()) / DIA_MS);
  }

  /** RP-08: parcelas pendentes já vencidas, de qualquer data (não usa o período). */
  async linhasInadimplencia(
    consulta: ConsultaRelatorio,
    hoje = hojeNaClinica(),
  ): Promise<LinhaInadimplencia[]> {
    const parcelas = await this.lancamentos(consulta, 'PENDENTE', { periodo: false, forma: false });
    return parcelas
      .map((p) => ({ p, atraso: this.diasDeAtraso(p.data, hoje) }))
      .filter(({ atraso }) => atraso > 0)
      .map(({ p, atraso }) => ({
        vencimento: p.data,
        profissional: p.profissional,
        paciente: p.paciente,
        descricao: p.descricao,
        valor: p.valor,
        diasAtraso: atraso,
      }));
  }

  private inadimplencia(): ReportDefinition {
    return definirRelatorio<LinhaInadimplencia>({
      id: 'RP-08',
      nome: 'Inadimplência',
      permissao: 'gestao-profissionais.receita-profissionais.ver',
      colunas: [
        coluna('vencimento', 'Vencimento', { type: 'date' }),
        coluna('profissional', 'Profissional', { width: 3 }),
        coluna('paciente', 'Paciente', { width: 3 }),
        coluna('descricao', 'Descrição', { width: 3, ordenavel: false }),
        coluna('valor', 'Valor', { type: 'currency' }),
        coluna('diasAtraso', 'Dias Atraso', { type: 'number' }),
      ],
      ordenacaoPadrao: 'vencimento:asc',
      filtros: [FILTRO_PROFISSIONAL],
      buscar: async (consulta, pagina) =>
        ordenarEPaginar(await this.linhasInadimplencia(consulta), consulta.sort, pagina),
      contar: async (consulta) => (await this.linhasInadimplencia(consulta)).length,
      totais: async (consulta) => ({
        valor: somar((await this.linhasInadimplencia(consulta)).map((l) => l.valor)),
      }),
    });
  }

  /** RP-09: parcelas pendentes por faixa de vencimento (a vencer até mais de 90 dias de atraso). */
  async linhasFaixasVencimento(
    consulta: ConsultaRelatorio,
    hoje = hojeNaClinica(),
  ): Promise<LinhaFaixaVencimento[]> {
    const parcelas = await this.lancamentos(consulta, 'PENDENTE', { periodo: false, forma: false });
    return FAIXAS_VENCIMENTO.map((faixa, indice) => {
      const anterior = FAIXAS_VENCIMENTO[indice - 1]?.ate ?? Number.NEGATIVE_INFINITY;
      const itens = parcelas.filter((p) => {
        const atraso = this.diasDeAtraso(p.data, hoje);
        return atraso <= faixa.ate && atraso > anterior;
      });
      return {
        faixa: faixa.rotulo,
        quantidade: itens.length,
        valor: somar(itens.map((i) => i.valor)),
      };
    });
  }

  private contasPorFaixaDeVencimento(): ReportDefinition {
    return definirRelatorio<LinhaFaixaVencimento>({
      id: 'RP-09',
      nome: 'Contas por Faixa de Vencimento',
      permissao: 'gestao-profissionais.receita-profissionais.ver',
      colunas: [
        coluna('faixa', 'Faixa', { width: 4, ordenavel: false }),
        coluna('quantidade', 'Quantidade', { type: 'number', ordenavel: false }),
        coluna('valor', 'Valor', { type: 'currency', ordenavel: false }),
      ],
      buscar: async (consulta, pagina) =>
        ordenarEPaginar(await this.linhasFaixasVencimento(consulta), undefined, pagina),
      contar: async (consulta) => (await this.linhasFaixasVencimento(consulta)).length,
      totais: async (consulta) => ({
        quantidade: (await this.linhasFaixasVencimento(consulta)).reduce(
          (soma, l) => soma + l.quantidade,
          0,
        ),
        valor: somar((await this.linhasFaixasVencimento(consulta)).map((l) => l.valor)),
      }),
    });
  }

  /**
   * RP-10: receitas parceladas (mais de uma parcela) que ainda têm parcela pendente. As parcelas
   * de uma receita são agrupadas por profissional, paciente e documento (ou descrição, sem
   * documento), já que não há outro vínculo entre elas. Não usa o período.
   */
  async linhasPagamentosEmAndamento(
    consulta: ConsultaRelatorio,
  ): Promise<LinhaPagamentoEmAndamento[]> {
    const contas = await this.txHost.tx.contaReceber.findMany({
      where: {
        deletedAt: null,
        status: { in: ['PENDENTE', 'RECEBIDO'] },
        totalParcelas: { gt: 1 },
        profissionalId: this.filtroProfissional(consulta) ?? { not: null },
      },
      include: {
        profissional: { select: { nome: true } },
        paciente: { select: { nome: true } },
      },
    });
    const grupos = agrupar(
      contas,
      (c) => `${c.profissionalId}|${c.pacienteId}|${c.documento ?? c.descricao}`,
    );
    return [...grupos.values()]
      .filter((itens) => itens.some((c) => c.status === 'PENDENTE'))
      .map((itens) => {
        const recebidas = itens.filter((c) => c.status === 'RECEBIDO');
        const pendentes = itens.filter((c) => c.status === 'PENDENTE');
        return {
          paciente: itens[0]?.paciente?.nome ?? SEM_PACIENTE,
          profissional: itens[0]?.profissional?.nome ?? '',
          total: somar(itens.map((c) => num(c.valor))),
          recebido: somar(recebidas.map((c) => num(c.valor))),
          saldo: somar(pendentes.map((c) => num(c.valor))),
          parcelas: `${recebidas.length}/${Math.max(...itens.map((c) => c.totalParcelas))}`,
        };
      })
      .sort((a, b) => b.saldo - a.saldo || porNome(a.paciente, b.paciente));
  }

  private pagamentosEmAndamento(): ReportDefinition {
    return definirRelatorio<LinhaPagamentoEmAndamento>({
      id: 'RP-10',
      nome: 'Pagamentos em Andamento',
      permissao: 'gestao-profissionais.receita-profissionais.ver',
      colunas: [
        coluna('paciente', 'Paciente', { width: 3 }),
        coluna('profissional', 'Profissional', { width: 3 }),
        coluna('total', 'Total', { type: 'currency' }),
        coluna('recebido', 'Recebido', { type: 'currency' }),
        coluna('saldo', 'Saldo', { type: 'currency' }),
        coluna('parcelas', 'Parcelas Pagas', { ordenavel: false }),
      ],
      ordenacaoPadrao: 'saldo:desc',
      buscar: async (consulta, pagina) =>
        ordenarEPaginar(await this.linhasPagamentosEmAndamento(consulta), consulta.sort, pagina),
      contar: async (consulta) => (await this.linhasPagamentosEmAndamento(consulta)).length,
      totais: async (consulta) => {
        const linhas = await this.linhasPagamentosEmAndamento(consulta);
        return {
          total: somar(linhas.map((l) => l.total)),
          recebido: somar(linhas.map((l) => l.recebido)),
          saldo: somar(linhas.map((l) => l.saldo)),
        };
      },
    });
  }

  /** RP-11: atendimentos realizados no período sem nenhum registro de recebimento. */
  async linhasSemRecebimento(consulta: ConsultaRelatorio): Promise<LinhaSemRecebimento[]> {
    const atendimentos = await this.atendimentos(consulta, { somenteSemRegistro: true });
    return atendimentos.map((a) => ({
      data: a.data,
      profissional: a.profissional,
      paciente: a.paciente,
      tipo: a.tipo,
      valor: a.valor,
      status: STATUS_ATENDIMENTO[a.status] ?? a.status,
    }));
  }

  private agendamentosSemRecebimento(): ReportDefinition {
    return definirRelatorio<LinhaSemRecebimento>({
      id: 'RP-11',
      nome: 'Agendamentos sem Recebimento',
      permissao: 'gestao-profissionais.receita-profissionais.ver',
      colunas: [
        coluna('data', 'Data', { type: 'date' }),
        coluna('profissional', 'Profissional', { width: 3 }),
        coluna('paciente', 'Paciente', { width: 3 }),
        coluna('tipo', 'Tipo', { ordenavel: false }),
        coluna('valor', 'Valor', { type: 'currency' }),
        coluna('status', 'Status', { ordenavel: false }),
      ],
      ordenacaoPadrao: 'data:desc',
      filtros: [FILTRO_PROFISSIONAL],
      buscar: async (consulta, pagina) =>
        ordenarEPaginar(await this.linhasSemRecebimento(consulta), consulta.sort, pagina),
      contar: async (consulta) => (await this.linhasSemRecebimento(consulta)).length,
    });
  }

  // ---------------------------------------------------------------- RP-12 e RP-13

  /** RP-12: atendimentos do período e o que ainda está sem recebimento, por profissional. */
  async linhasResumoPendentes(consulta: ConsultaRelatorio): Promise<LinhaResumoPendentes[]> {
    const atendimentos = await this.atendimentos(consulta);
    return [...agrupar(atendimentos, (a) => a.profissionalId).values()]
      .map((itens) => {
        const sem = itens.filter((i) => i.semRegistro);
        return {
          profissional: itens[0]?.profissional ?? '',
          totalAtendimentos: itens.length,
          valorTotal: somar(itens.map((i) => i.valor)),
          semRecebimento: sem.length,
          valorPendente: sem.length > 0 ? somar(sem.map((i) => i.valor)) : null,
        };
      })
      .sort(
        (a, b) => b.semRecebimento - a.semRecebimento || porNome(a.profissional, b.profissional),
      );
  }

  private resumoPendentesPorProfissional(): ReportDefinition {
    return definirRelatorio<LinhaResumoPendentes>({
      id: 'RP-12',
      nome: 'Resumo Pendentes por Profissional',
      permissao: 'gestao-profissionais.receita-profissionais.ver',
      colunas: [
        coluna('profissional', 'Profissional', { width: 4 }),
        coluna('totalAtendimentos', 'Total Atend.', { type: 'number' }),
        coluna('valorTotal', 'Valor Total', { type: 'currency' }),
        coluna('semRecebimento', 'Sem Recebimento', { type: 'number' }),
        coluna('valorPendente', 'Valor Pendente', { type: 'currency' }),
      ],
      ordenacaoPadrao: 'semRecebimento:desc',
      buscar: async (consulta, pagina) =>
        ordenarEPaginar(await this.linhasResumoPendentes(consulta), consulta.sort, pagina),
      contar: async (consulta) => (await this.linhasResumoPendentes(consulta)).length,
      totais: async (consulta) => ({
        valorPendente: somar(
          (await this.linhasResumoPendentes(consulta)).map((l) => l.valorPendente ?? 0),
        ),
      }),
    });
  }

  /** RP-13: consultas recebidas no período por profissional e forma de pagamento. */
  async linhasConsultasPorForma(consulta: ConsultaRelatorio): Promise<LinhaConsultasPorForma[]> {
    const recebidos = await this.lancamentos(consulta, 'RECEBIDO');
    return [...agrupar(recebidos, (r) => `${r.profissionalId}|${r.forma ?? SEM_FORMA}`).values()]
      .map((itens) => ({
        profissional: itens[0]?.profissional ?? '',
        forma: itens[0]?.forma ?? SEM_FORMA,
        consultas: itens.length,
        total: somar(itens.map((i) => i.valor)),
      }))
      .sort((a, b) => porNome(a.profissional, b.profissional) || b.total - a.total);
  }

  private consultasPorProfissionalEForma(): ReportDefinition {
    return definirRelatorio<LinhaConsultasPorForma>({
      id: 'RP-13',
      nome: 'Consultas por Profissional e Forma de Pagamento',
      permissao: 'gestao-profissionais.receita-profissionais.ver',
      colunas: [
        coluna('profissional', 'Profissional', { width: 4 }),
        coluna('forma', 'Forma de Pagamento', { width: 3 }),
        coluna('consultas', 'Consultas', { type: 'number' }),
        coluna('total', 'Total', { type: 'currency' }),
      ],
      ordenacaoPadrao: 'profissional:asc',
      filtros: [FILTRO_PROFISSIONAL, FILTRO_FORMA],
      buscar: async (consulta, pagina) =>
        ordenarEPaginar(await this.linhasConsultasPorForma(consulta), consulta.sort, pagina),
      contar: async (consulta) => (await this.linhasConsultasPorForma(consulta)).length,
      totais: async (consulta) => ({
        total: somar((await this.linhasConsultasPorForma(consulta)).map((l) => l.total)),
      }),
    });
  }
}
