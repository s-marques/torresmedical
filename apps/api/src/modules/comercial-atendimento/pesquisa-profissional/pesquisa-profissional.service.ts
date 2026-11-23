import { Transactional, TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import {
  PESQUISA_PROFISSIONAL_CATEGORIAS,
  calcularScoreNps,
  classificarNota,
  percentual,
  type ListPesquisasProfissionalQuery,
  type MediaCategoria,
  type NpsProfissionaisMes,
  type PesquisaProfissional,
  type PesquisaProfissionalPublica,
  type RespostaPesquisaProfissionalInput,
  type ResumoPesquisaProfissional,
  type ResumoPesquisaProfissionalQuery,
} from '@torres/shared';
import { Prisma } from '../../../generated/prisma/client';
import { AuditService } from '../../../common/audit/audit.service';
import { EscopoDadosService } from '../../../common/auth/escopo-dados.service';
import { hashToken } from '../../../common/auth/tokens';
import { BusinessException } from '../../../common/errors/api.exception';
import { paginate, type Page } from '../../../common/pagination/paginate';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import { intervaloDoDia } from '../confirmacoes/envio-confirmacao.service';
import { PesquisaNpsService } from '../pesquisa-nps/pesquisa-nps.service';

const INCLUDE = {
  profissional: { select: { nome: true } },
} satisfies Prisma.PesquisaProfissionalInclude;
type PesquisaLinha = Prisma.PesquisaProfissionalGetPayload<{ include: typeof INCLUDE }>;

type Ordenacao = ListPesquisasProfissionalQuery['sort'];

const CAMPO_DA_CATEGORIA = {
  ESTRUTURA: 'notaEstrutura',
  RECEPCAO: 'notaRecepcao',
  AGENDA: 'notaAgenda',
  ATENDIMENTO: 'notaAtendimento',
} as const;

export function toPesquisaProfissional(p: PesquisaLinha): PesquisaProfissional {
  return {
    id: p.id,
    profissionalId: p.profissionalId,
    profissional: p.profissional.nome,
    tipo: p.tipo,
    status: p.status,
    notaEstrutura: p.notaEstrutura,
    notaRecepcao: p.notaRecepcao,
    notaAgenda: p.notaAgenda,
    notaAtendimento: p.notaAtendimento,
    nps: p.nps,
    comentario: p.comentario,
    enviadaEm: p.enviadaEm.toISOString(),
    respondidaEm: p.respondidaEm?.toISOString() ?? null,
  };
}

function orderByDe(sort: Ordenacao): Prisma.PesquisaProfissionalOrderByWithRelationInput[] {
  const d = sort.direction;
  const campos: Record<Ordenacao['field'], Prisma.PesquisaProfissionalOrderByWithRelationInput> = {
    enviadaEm: { enviadaEm: d },
    respondidaEm: { respondidaEm: { sort: d, nulls: 'last' } },
    profissional: { profissional: { nome: d } },
    nps: { nps: { sort: d, nulls: 'last' } },
  };
  return [campos[sort.field], { enviadaEm: 'desc' }, { id: 'asc' }];
}

const arredondar1 = (valor: number | null): number =>
  valor === null ? 0 : Math.round(valor * 10) / 10;

/**
 * Pesquisa de experiência do profissional: painel de resultados (cartões, médias por categoria e
 * lista), NPS do mês para o relatório mensal e a resposta pelo link com token. O período De/Até
 * filtra sempre pela data de envio, nos cartões e na lista (o mesmo recorte nas duas visões).
 */
@Injectable()
export class PesquisaProfissionalService {
  constructor(
    private readonly txHost: TransactionHost<PrismaAdapter>,
    private readonly audit: AuditService,
    private readonly escopo: EscopoDadosService,
    private readonly periodos: PesquisaNpsService,
  ) {}

  private whereDoPeriodo(
    profissionalId: string | undefined,
    de: string,
    ate: string,
  ): Prisma.PesquisaProfissionalWhereInput {
    return {
      enviadaEm: { gte: intervaloDoDia(de).gte, lt: intervaloDoDia(ate).lt },
      // Perfil restrito só vê as pesquisas dos profissionais vinculados.
      profissionalId: this.escopo.filtroProfissional(profissionalId),
    };
  }

  // ---------- Painel ----------

  async resumo(query: ResumoPesquisaProfissionalQuery): Promise<ResumoPesquisaProfissional> {
    const { de, ate } = this.periodos.periodo(query);
    const where = this.whereDoPeriodo(query.profissionalId, de, ate);
    const tx = this.txHost.tx;
    const respondidas: Prisma.PesquisaProfissionalWhereInput = {
      ...where,
      status: 'RESPONDIDA',
      nps: { not: null },
    };
    const [enviadas, porNota, medias] = await Promise.all([
      // Falha de envio (sem canal ou telefone) não é pesquisa enviada.
      tx.pesquisaProfissional.count({ where: { ...where, status: { not: 'FALHA' } } }),
      tx.pesquisaProfissional.groupBy({
        by: ['nps'],
        where: respondidas,
        _count: { _all: true },
      }),
      tx.pesquisaProfissional.aggregate({
        where: respondidas,
        _avg: {
          notaEstrutura: true,
          notaRecepcao: true,
          notaAgenda: true,
          notaAtendimento: true,
        },
        _count: {
          notaEstrutura: true,
          notaRecepcao: true,
          notaAgenda: true,
          notaAtendimento: true,
        },
      }),
    ]);
    const contagem = { promotores: 0, neutros: 0, detratores: 0 };
    const chave = { PROMOTOR: 'promotores', NEUTRO: 'neutros', DETRATOR: 'detratores' } as const;
    for (const { nps, _count } of porNota) {
      if (nps !== null) contagem[chave[classificarNota(nps)]] += _count._all;
    }
    const avaliacoes = contagem.promotores + contagem.neutros + contagem.detratores;
    const categorias: MediaCategoria[] = PESQUISA_PROFISSIONAL_CATEGORIAS.map((categoria) => ({
      categoria,
      media: arredondar1(medias._avg[CAMPO_DA_CATEGORIA[categoria]]),
      avaliacoes: medias._count[CAMPO_DA_CATEGORIA[categoria]],
    }));
    return {
      de,
      ate,
      score: calcularScoreNps(contagem),
      enviadas,
      respondidas: avaliacoes,
      taxaResposta: percentual(avaliacoes, enviadas),
      avaliacoes,
      ...contagem,
      categorias,
    };
  }

  async list(query: ListPesquisasProfissionalQuery): Promise<Page<PesquisaProfissional>> {
    const { de, ate } = this.periodos.periodo(query);
    const where: Prisma.PesquisaProfissionalWhereInput = {
      ...this.whereDoPeriodo(query.profissionalId, de, ate),
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? { profissional: { nome: { contains: query.search, mode: 'insensitive' } } }
        : {}),
    };
    const pagina = await paginate(query, {
      findMany: (p) =>
        this.txHost.tx.pesquisaProfissional.findMany({
          where,
          orderBy: orderByDe(query.sort),
          include: INCLUDE,
          ...p,
        }),
      count: () => this.txHost.tx.pesquisaProfissional.count({ where }),
    });
    return { ...pagina, data: pagina.data.map(toPesquisaProfissional) };
  }

  /**
   * NPS dos profissionais de um mês (`AAAA-MM`), para o relatório mensal (R §27 item 9: "Qual NPS
   * dos médicos clientes"). Conta as pesquisas enviadas no mês, como o painel.
   */
  async npsDoMes(mes: string): Promise<NpsProfissionaisMes> {
    const ultimoDia = new Date(
      Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0),
    ).getUTCDate();
    const { de, ate } = { de: `${mes}-01`, ate: `${mes}-${String(ultimoDia).padStart(2, '0')}` };
    const resumo = await this.resumo({ de, ate });
    return { mes, score: resumo.score, avaliacoes: resumo.avaliacoes };
  }

  // ---------- Resposta do profissional (link com token, sem login) ----------

  private async buscarPorToken(token: string) {
    const pesquisa = await this.txHost.tx.pesquisaProfissional.findUnique({
      where: { tokenHash: hashToken(token) },
      include: INCLUDE,
    });
    // Falha de envio: o link nunca chegou ao profissional.
    if (!pesquisa || pesquisa.status === 'FALHA') {
      throw new BusinessException('PESQUISA_NAO_ENCONTRADA', 'Pesquisa não encontrada', {
        status: 404,
      });
    }
    return pesquisa;
  }

  async obterPublica(token: string): Promise<PesquisaProfissionalPublica> {
    const pesquisa = await this.buscarPorToken(token);
    const respondida = pesquisa.status === 'RESPONDIDA';
    const expirada = !respondida && pesquisa.expiraEm.getTime() < Date.now();
    return {
      profissional: pesquisa.profissional.nome,
      aberta: !respondida && !expirada,
      motivo: respondida ? 'RESPONDIDA' : expirada ? 'EXPIRADA' : null,
    };
  }

  /**
   * Registra a resposta. Só a primeira vale: a condição de status protege contra dois envios
   * juntos. Sem request autenticado, por isso grava o `audit_log` aqui.
   */
  @Transactional()
  async responder(token: string, resposta: RespostaPesquisaProfissionalInput): Promise<void> {
    const pesquisa = await this.buscarPorToken(token);
    if (pesquisa.status === 'RESPONDIDA') throw jaRespondida();
    if (pesquisa.expiraEm.getTime() < Date.now()) {
      throw new BusinessException('PESQUISA_EXPIRADA', 'O link desta pesquisa expirou', {
        status: 410,
      });
    }
    const { count } = await this.txHost.tx.pesquisaProfissional.updateMany({
      where: { id: pesquisa.id, status: 'ENVIADA' },
      data: {
        status: 'RESPONDIDA',
        notaEstrutura: resposta.notaEstrutura,
        notaRecepcao: resposta.notaRecepcao,
        notaAgenda: resposta.notaAgenda,
        notaAtendimento: resposta.notaAtendimento,
        nps: resposta.nps,
        comentario: resposta.comentario ?? null,
        respondidaEm: new Date(),
      },
    });
    if (count === 0) throw jaRespondida();
    await this.audit.record({
      action: 'UPDATE',
      entity: 'PesquisaProfissional',
      entityId: pesquisa.id,
      before: { status: 'ENVIADA', nps: null },
      after: { status: 'RESPONDIDA', nps: resposta.nps },
    });
  }
}

function jaRespondida(): BusinessException {
  return new BusinessException('PESQUISA_JA_RESPONDIDA', 'Esta pesquisa já foi respondida', {
    status: 409,
  });
}
