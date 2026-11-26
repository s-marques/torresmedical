import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import {
  FAIXAS_AGING,
  faixaDoAtraso,
  type CobrancaEnviada,
  type ListCobrancasEnviadasQuery,
  type ListTitulosInadimplentesQuery,
  type PainelInadimplencia,
  type TituloInadimplente,
} from '@torres/shared';
import { EscopoDadosService, semPermissao } from '../../../common/auth/escopo-dados.service';
import { toLocalWallClock } from '../../../common/export/export-values';
import { paginate, toOrderBy, type Page } from '../../../common/pagination/paginate';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import { Prisma } from '../../../generated/prisma/client';
import { DO_TORRES } from '../conta-financeira';
import {
  agruparPorFaixa,
  diasEmAtraso,
  estaVencido,
  saldoEmAberto,
  somar,
  type TituloEmAberto,
} from './inadimplencia.regras';

/** Dia de hoje (`AAAA-MM-DD`) no fuso da clínica. */
export function hojeNaClinica(instante = new Date()): string {
  return toLocalWallClock(instante).toISOString().slice(0, 10);
}

const dia = (valor: string) => new Date(`${valor}T00:00:00.000Z`);

/** Títulos com saldo em aberto: Pendente ou Parcial (Pago, Cancelado e Renegociado ficam fora). */
export const EM_ABERTO = {
  ...DO_TORRES,
  status: { in: ['PENDENTE', 'PARCIAL'] },
} satisfies Prisma.ContaReceberWhereInput;

const INCLUDE_TITULO = {
  paciente: { select: { nome: true } },
  profissionalSacado: { select: { id: true, nome: true } },
  contratoSala: { select: { numero: true } },
  baixas: { where: { deletedAt: null }, select: { valorRecebido: true } },
  _count: { select: { cobrancas: true } },
} satisfies Prisma.ContaReceberInclude;

type TituloCarregado = Prisma.ContaReceberGetPayload<{ include: typeof INCLUDE_TITULO }>;

function emAberto(conta: TituloCarregado): TituloEmAberto {
  return {
    id: conta.id,
    vencimento: conta.dataVencimento.toISOString().slice(0, 10),
    saldo: saldoEmAberto(conta.valor, conta.baixas),
  };
}

const reais = (valor: Prisma.Decimal) => valor.toFixed(2);

/**
 * Painel de inadimplência e lista dos títulos vencidos (issue #166, R §18). Soma o saldo em aberto
 * (valor menos as baixas parciais) dos títulos de Contas a Receber, com a mesma base da tela: a
 * soma do painel fecha com a lista de Vencidos. Visão da administração: perfil restrito a
 * profissionais (#153) recebe 403.
 */
@Injectable()
export class InadimplenciaService {
  constructor(
    private readonly txHost: TransactionHost<PrismaAdapter>,
    private readonly escopo: EscopoDadosService,
  ) {}

  async painel(hoje = hojeNaClinica()): Promise<PainelInadimplencia> {
    this.somenteAdministracao();
    const contas = await this.carregar(hoje);
    const hojeContas = contas.filter((c) => emAberto(c).vencimento === hoje);
    const vencidas = contas.filter((c) => estaVencido(emAberto(c), hoje));

    const vencidosSoma = somar(vencidas.map(emAberto));
    const aging = agruparPorFaixa(vencidas.map(emAberto), hoje);
    const porProfissional = this.porProfissional(vencidas, hoje);

    return {
      data: hoje,
      aReceberHoje: this.formatar(somar(hojeContas.map(emAberto))),
      vencidos: this.formatar(vencidosSoma),
      aging: FAIXAS_AGING.map((faixa) => ({ faixa, ...this.formatar(aging[faixa]) })),
      contratosInadimplentes: new Set(vencidas.map((c) => c.contratoSalaId).filter(Boolean)).size,
      profissionaisInadimplentes: porProfissional.length,
      porProfissional,
    };
  }

  /** Os títulos vencidos que o painel soma, com filtro de faixa e profissional. */
  async titulos(
    query: ListTitulosInadimplentesQuery,
    hoje = hojeNaClinica(),
  ): Promise<Page<TituloInadimplente>> {
    this.somenteAdministracao();
    const filtrados = (await this.carregar(hoje))
      .filter((c) => estaVencido(emAberto(c), hoje))
      .filter((c) => !query.profissionalId || c.profissionalSacadoId === query.profissionalId)
      .map((c) => this.paraTitulo(c, hoje))
      .filter((t) => !query.faixa || t.faixa === query.faixa);

    const { field, direction } = query.sort;
    const sentido = direction === 'asc' ? 1 : -1;
    const chave = (t: TituloInadimplente) =>
      field === 'saldo' ? Number(t.saldo) : field === 'atraso' ? t.diasEmAtraso : t.dataVencimento;
    filtrados.sort((a, b) => {
      const [x, y] = [chave(a), chave(b)];
      if (x === y) return a.id.localeCompare(b.id) * sentido;
      return (x < y ? -1 : 1) * sentido;
    });

    const inicio = (query.page - 1) * query.pageSize;
    return {
      data: filtrados.slice(inicio, inicio + query.pageSize),
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total: filtrados.length,
        totalPages: Math.ceil(filtrados.length / query.pageSize),
      },
    };
  }

  /** Histórico das cobranças enviadas pela régua, com filtro por título, marco e situação. */
  async cobrancas(query: ListCobrancasEnviadasQuery): Promise<Page<CobrancaEnviada>> {
    this.somenteAdministracao();
    const where: Prisma.CobrancaEnvioWhereInput = {
      contaReceberId: query.contaReceberId,
      marco: query.marco,
      status: query.status,
    };
    const orderBy = toOrderBy(query.sort);
    const pagina = await paginate(query, {
      findMany: (p) =>
        this.txHost.tx.cobrancaEnvio.findMany({
          where,
          orderBy,
          include: {
            contaReceber: {
              select: { numero: true, profissionalSacado: { select: { nome: true } } },
            },
          },
          ...p,
        }),
      count: () => this.txHost.tx.cobrancaEnvio.count({ where }),
    });
    return {
      ...pagina,
      data: pagina.data.map((e) => ({
        id: e.id,
        contaReceberId: e.contaReceberId,
        contaReceberNumero: e.contaReceber.numero,
        profissionalNome: e.contaReceber.profissionalSacado?.nome ?? null,
        marco: e.marco,
        canal: 'WHATSAPP' as const,
        status: e.status,
        erro: e.erro,
        vencimento: e.vencimento.toISOString().slice(0, 10),
        createdAt: e.createdAt.toISOString(),
      })),
    };
  }

  // ---------- internos ----------

  private somenteAdministracao(): void {
    if (this.escopo.restrito()) throw semPermissao();
  }

  /** Títulos em aberto que vencem hoje ou antes (o que o painel usa). */
  private carregar(hoje: string): Promise<TituloCarregado[]> {
    return this.txHost.tx.contaReceber.findMany({
      where: { ...EM_ABERTO, dataVencimento: { lte: dia(hoje) } },
      include: INCLUDE_TITULO,
      orderBy: [{ dataVencimento: 'asc' }, { numero: 'asc' }],
    });
  }

  private formatar(soma: { valor: Prisma.Decimal; quantidade: number }) {
    return { valor: reais(soma.valor), quantidade: soma.quantidade };
  }

  private paraTitulo(conta: TituloCarregado, hoje: string): TituloInadimplente {
    const base = emAberto(conta);
    const atraso = diasEmAtraso(base.vencimento, hoje);
    const sacado = conta.profissionalSacado
      ? { sacadoTipo: 'PROFISSIONAL' as const, sacadoNome: conta.profissionalSacado.nome }
      : conta.paciente
        ? { sacadoTipo: 'PACIENTE' as const, sacadoNome: conta.paciente.nome }
        : { sacadoTipo: null, sacadoNome: null };
    return {
      id: conta.id,
      numero: conta.numero,
      descricao: conta.descricao,
      ...sacado,
      profissionalId: conta.profissionalSacadoId,
      contratoSalaId: conta.contratoSalaId,
      contratoSalaNumero: conta.contratoSala?.numero ?? null,
      dataVencimento: base.vencimento,
      saldo: reais(base.saldo),
      diasEmAtraso: atraso,
      faixa: faixaDoAtraso(atraso),
      cobrancas: conta._count.cobrancas,
    };
  }

  /** Profissionais com título vencido, do maior saldo para o menor. */
  private porProfissional(vencidas: readonly TituloCarregado[], hoje: string) {
    const grupos = new Map<
      string,
      { nome: string; valor: Prisma.Decimal; quantidade: number; maiorAtraso: number }
    >();
    for (const conta of vencidas) {
      if (!conta.profissionalSacado) continue;
      const base = emAberto(conta);
      const atual = grupos.get(conta.profissionalSacado.id) ?? {
        nome: conta.profissionalSacado.nome,
        valor: new Prisma.Decimal(0),
        quantidade: 0,
        maiorAtraso: 0,
      };
      grupos.set(conta.profissionalSacado.id, {
        ...atual,
        valor: atual.valor.add(base.saldo),
        quantidade: atual.quantidade + 1,
        maiorAtraso: Math.max(atual.maiorAtraso, diasEmAtraso(base.vencimento, hoje)),
      });
    }
    return [...grupos.entries()]
      .map(([profissionalId, g]) => ({
        profissionalId,
        nome: g.nome,
        valor: reais(g.valor),
        quantidade: g.quantidade,
        maiorAtrasoDias: g.maiorAtraso,
        ordem: g.valor,
      }))
      .sort((a, b) => b.ordem.comparedTo(a.ordem) || a.nome.localeCompare(b.nome))
      .map(({ ordem: _ordem, ...resto }) => resto);
  }
}
