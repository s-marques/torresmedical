import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import {
  NPS_PERIODO_PADRAO_DIAS,
  calcularScoreNps,
  classificarNota,
  percentual,
  type ListPesquisasNpsQuery,
  type PesquisaNps,
  type PeriodoNps,
  type RespostaNpsInput,
  type ResumoNps,
} from '@torres/shared';
import { Prisma } from '../../../generated/prisma/client';
import { AuditService } from '../../../common/audit/audit.service';
import { BusinessException } from '../../../common/errors/api.exception';
import { paginate, type Page } from '../../../common/pagination/paginate';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import { agoraNaClinica } from '../campanhas/relogio-clinica';
import { intervaloDoDia, somarDias } from '../confirmacoes/envio-confirmacao.service';

const INCLUDE = {
  paciente: { select: { nome: true } },
  profissional: { select: { nome: true } },
} satisfies Prisma.PesquisaNpsInclude;
type PesquisaLinha = Prisma.PesquisaNpsGetPayload<{ include: typeof INCLUDE }>;

type Ordenacao = ListPesquisasNpsQuery['sort'];

/** Faixa de notas de cada classificação (9–10, 7–8 e 0–6). */
const NOTAS_DA_CLASSIFICACAO = {
  PROMOTOR: { gte: 9 },
  NEUTRO: { gte: 7, lte: 8 },
  DETRATOR: { lte: 6 },
} as const satisfies Record<string, Prisma.IntNullableFilter>;

export function toPesquisaNps(p: PesquisaLinha): PesquisaNps {
  return {
    id: p.id,
    paciente: p.paciente.nome,
    profissional: p.profissional.nome,
    status: p.status,
    nota: p.nota,
    classificacao: p.nota === null ? null : classificarNota(p.nota),
    comentario: p.comentario,
    enviadaEm: p.enviadaEm.toISOString(),
    respondidaEm: p.respondidaEm?.toISOString() ?? null,
  };
}

function orderByDe(sort: Ordenacao): Prisma.PesquisaNpsOrderByWithRelationInput[] {
  const d = sort.direction;
  const campos: Record<Ordenacao['field'], Prisma.PesquisaNpsOrderByWithRelationInput> = {
    enviadaEm: { enviadaEm: d },
    respondidaEm: { respondidaEm: { sort: d, nulls: 'last' } },
    paciente: { paciente: { nome: d } },
    profissional: { profissional: { nome: d } },
    nota: { nota: { sort: d, nulls: 'last' } },
  };
  return [campos[sort.field], { enviadaEm: 'desc' }, { id: 'asc' }];
}

/**
 * Tela Pesquisa NPS (`/pesquisa-satisfacao`). O período De/Até filtra sempre pela data de envio da
 * pesquisa, nos cartões e na lista: é o mesmo recorte nas duas abas (falha C3 do legado, em que o
 * NPS de um mês abria as respostas de outro).
 */
@Injectable()
export class PesquisaNpsService {
  constructor(
    private readonly txHost: TransactionHost<PrismaAdapter>,
    private readonly audit: AuditService,
  ) {}

  /** Período com os padrões: Até = hoje e De = Até menos 30 dias (dias da clínica). */
  periodo(periodo: PeriodoNps): { de: string; ate: string } {
    const ate = periodo.ate ?? agoraNaClinica().dia;
    const de = periodo.de ?? somarDias(ate, -NPS_PERIODO_PADRAO_DIAS);
    if (de > ate) {
      throw new BusinessException(
        'PERIODO_INVALIDO',
        'A data inicial deve ser anterior ou igual à data final',
        { status: 400, details: [{ field: 'de', message: 'Maior que a data final' }] },
      );
    }
    return { de, ate };
  }

  private whereDoPeriodo(periodo: PeriodoNps): Prisma.PesquisaNpsWhereInput {
    const { de, ate } = this.periodo(periodo);
    return { enviadaEm: { gte: intervaloDoDia(de).gte, lt: intervaloDoDia(ate).lt } };
  }

  // ---------- Aba Dashboard ----------

  async resumo(query: PeriodoNps): Promise<ResumoNps> {
    const { de, ate } = this.periodo(query);
    const where = this.whereDoPeriodo({ de, ate });
    const tx = this.txHost.tx;
    const [enviadas, porNota] = await Promise.all([
      // Falha de envio (sem canal ou telefone) não é pesquisa enviada.
      tx.pesquisaNps.count({ where: { ...where, status: { not: 'FALHA' } } }),
      tx.pesquisaNps.groupBy({
        by: ['nota'],
        where: { ...where, status: 'RESPONDIDA', nota: { not: null } },
        _count: { _all: true },
      }),
    ]);
    const contagem = { promotores: 0, neutros: 0, detratores: 0 };
    for (const { nota, _count } of porNota) {
      if (nota === null) continue;
      const chave = { PROMOTOR: 'promotores', NEUTRO: 'neutros', DETRATOR: 'detratores' } as const;
      contagem[chave[classificarNota(nota)]] += _count._all;
    }
    const avaliacoes = contagem.promotores + contagem.neutros + contagem.detratores;
    return {
      de,
      ate,
      score: calcularScoreNps(contagem),
      enviadas,
      respondidas: avaliacoes,
      taxaResposta: percentual(avaliacoes, enviadas),
      avaliacoes,
      ...contagem,
      percentualPromotores: percentual(contagem.promotores, avaliacoes),
      percentualNeutros: percentual(contagem.neutros, avaliacoes),
      percentualDetratores: percentual(contagem.detratores, avaliacoes),
    };
  }

  // ---------- Aba Respostas ----------

  async list(query: ListPesquisasNpsQuery): Promise<Page<PesquisaNps>> {
    const where: Prisma.PesquisaNpsWhereInput = {
      ...this.whereDoPeriodo(query),
      ...(query.classificacao
        ? { status: 'RESPONDIDA', nota: NOTAS_DA_CLASSIFICACAO[query.classificacao] }
        : {}),
      ...(query.search
        ? {
            OR: [
              { paciente: { nome: { contains: query.search, mode: 'insensitive' } } },
              { profissional: { nome: { contains: query.search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
    const pagina = await paginate(query, {
      findMany: (p) =>
        this.txHost.tx.pesquisaNps.findMany({
          where,
          orderBy: orderByDe(query.sort),
          include: INCLUDE,
          ...p,
        }),
      count: () => this.txHost.tx.pesquisaNps.count({ where }),
    });
    return { ...pagina, data: pagina.data.map(toPesquisaNps) };
  }

  // ---------- Resposta do paciente ----------

  /**
   * Registra a nota que o paciente mandou pelo WhatsApp na pesquisa dele ainda aberta (a mais
   * recente, quando houver mais de uma). Chamada pela integração do WhatsApp, sem request HTTP,
   * por isso grava o `audit_log` aqui. Devolve `null` quando o paciente não tem pesquisa aberta:
   * a mensagem era outra conversa e segue o fluxo normal do atendimento.
   */
  async registrarResposta(pacienteId: string, resposta: RespostaNpsInput): Promise<string | null> {
    const tx = this.txHost.tx;
    const aberta = await tx.pesquisaNps.findFirst({
      where: { pacienteId, status: 'ENVIADA' },
      orderBy: { enviadaEm: 'desc' },
    });
    if (!aberta) return null;
    // Só a primeira resposta vale: a condição de status protege contra duas mensagens juntas.
    const { count } = await tx.pesquisaNps.updateMany({
      where: { id: aberta.id, status: 'ENVIADA' },
      data: {
        status: 'RESPONDIDA',
        nota: resposta.nota,
        comentario: resposta.comentario ?? null,
        respondidaEm: new Date(),
      },
    });
    if (count === 0) return null;
    const depois = await tx.pesquisaNps.findUniqueOrThrow({ where: { id: aberta.id } });
    await this.audit.record({
      action: 'UPDATE',
      entity: 'PesquisaNps',
      entityId: aberta.id,
      before: { status: aberta.status, nota: null },
      after: { status: depois.status, nota: depois.nota },
    });
    return aberta.id;
  }
}
