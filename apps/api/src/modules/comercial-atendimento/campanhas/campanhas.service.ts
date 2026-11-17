import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import type { Campanha, CampanhaInput, ListCampanhasQuery, ResumoCampanhas } from '@torres/shared';
import type { Prisma } from '../../../generated/prisma/client';
import { isUuid } from '../../../common/auth/tokens';
import { BusinessException } from '../../../common/errors/api.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import { paginate, toOrderBy, type Page } from '../../../common/pagination/paginate';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import { CanaisWhatsappService } from '../../configuracoes-gestao/canais-whatsapp/canais-whatsapp.service';
import { OrigensClienteService } from '../origens-cliente/origens-cliente.service';
import { instanteDaAtividade } from '../pipeline/negocios.service';

export const INCLUDE = {
  canal: { select: { nome: true } },
  origemCliente: { select: { nome: true } },
} satisfies Prisma.CampanhaInclude;
type CampanhaCompleta = Prisma.CampanhaGetPayload<{ include: typeof INCLUDE }>;

const NAO_EXCLUIDAS = { deletedAt: null } as const;
/** Confirmação do provedor: a mensagem saiu. */
const CONFIRMADAS = ['ENVIADA', 'ENTREGUE', 'LIDA'] as const;

interface Contagem {
  total: number;
  enviados: number;
  falhas: number;
}

/** Filtro de clientes e canal: as referências precisam existir. */
export async function validarReferencias(
  input: { canalId: string; origemClienteId: string | null; filtro: string },
  canais: CanaisWhatsappService,
  origens: OrigensClienteService,
): Promise<void> {
  await canais.findById(input.canalId);
  if (input.filtro === 'ORIGEM' && input.origemClienteId) {
    await origens.findById(input.origemClienteId);
  }
}

/** Só guarda os campos do filtro que ele usa. */
export function camposDoFiltro(input: {
  filtro: CampanhaInput['filtro'];
  origemClienteId: string | null;
  diasCompra: number | null;
}) {
  return {
    filtro: input.filtro,
    origemClienteId: input.filtro === 'ORIGEM' ? input.origemClienteId : null,
    diasCompra: input.filtro === 'COMPRA_RECENTE' ? input.diasCompra : null,
  };
}

/** Campanhas (aba Envios Agendados), o Histórico e os cartões da aba Relatórios. */
@Injectable()
export class CampanhasService {
  constructor(
    private readonly txHost: TransactionHost<PrismaAdapter>,
    private readonly canais: CanaisWhatsappService,
    private readonly origens: OrigensClienteService,
  ) {}

  async list(query: ListCampanhasQuery): Promise<Page<Campanha>> {
    const where: Prisma.CampanhaWhereInput = {
      ...NAO_EXCLUIDAS,
      ...(query.status ? { status: query.status } : {}),
      ...(query.search ? { nome: { contains: query.search, mode: 'insensitive' } } : {}),
    };
    const orderBy = [...toOrderBy(query.sort), { id: 'asc' as const }];
    const pagina = await paginate(query, {
      findMany: (p) => this.txHost.tx.campanha.findMany({ where, orderBy, include: INCLUDE, ...p }),
      count: () => this.txHost.tx.campanha.count({ where }),
    });
    return { ...pagina, data: await this.paraDto(pagina.data) };
  }

  async findById(id: string): Promise<Campanha> {
    return this.toDto(await this.buscar(id));
  }

  /** "Nova Campanha": sem data e hora, sai na próxima rodada do agendador. */
  async create(input: CampanhaInput): Promise<Campanha> {
    await validarReferencias(input, this.canais, this.origens);
    const criada = await this.txHost.tx.campanha.create({
      data: this.dados(input),
      include: INCLUDE,
    });
    return this.toDto(criada);
  }

  /** Só campanha ainda agendada pode mudar. */
  async update(id: string, input: CampanhaInput): Promise<Campanha> {
    const atual = await this.buscar(id);
    if (atual.status !== 'AGENDADA') {
      throw new BusinessException(
        'CAMPANHA_NAO_EDITAVEL',
        'Só é possível editar uma campanha agendada.',
      );
    }
    await validarReferencias(input, this.canais, this.origens);
    const alterada = await this.txHost.tx.campanha.update({
      where: { id },
      data: this.dados(input),
      include: INCLUDE,
    });
    return this.toDto(alterada);
  }

  /** Agendada ou enviando → cancelada; os envios que ainda não saíram são cancelados. */
  async cancelar(id: string): Promise<Campanha> {
    const atual = await this.buscar(id);
    if (atual.status !== 'AGENDADA' && atual.status !== 'ENVIANDO') {
      throw new BusinessException(
        'CAMPANHA_NAO_CANCELAVEL',
        'Só é possível cancelar uma campanha agendada ou em envio.',
      );
    }
    await this.txHost.tx.envioCampanha.updateMany({
      where: { campanhaId: id, status: 'PROGRAMADO' },
      data: { status: 'CANCELADO' },
    });
    const cancelada = await this.txHost.tx.campanha.update({
      where: { id },
      data: { status: 'CANCELADA', canceladaEm: new Date() },
      include: INCLUDE,
    });
    return this.toDto(cancelada);
  }

  /** Exclusão lógica. Campanha em envio precisa ser cancelada antes. */
  async remove(id: string): Promise<Campanha> {
    const atual = await this.buscar(id);
    if (atual.status === 'ENVIANDO') {
      throw new BusinessException(
        'CAMPANHA_EM_ENVIO',
        'Cancele a campanha antes de excluí-la: ela está sendo enviada.',
      );
    }
    const excluida = await this.txHost.tx.campanha.update({
      where: { id },
      data: { deletedAt: new Date() },
      include: INCLUDE,
    });
    return this.toDto(excluida);
  }

  /** Cartões da aba Relatórios. */
  async resumo(): Promise<ResumoCampanhas> {
    const tx = this.txHost.tx;
    const daCampanha = { campanha: NAO_EXCLUIDAS };
    const daAutomacao = { mensagemAutomatica: NAO_EXCLUIDAS };
    const [
      totalCampanhas,
      concluidas,
      destinatarios,
      enfileirados,
      confirmadas,
      automacoes,
      automacoesAtivas,
      automacoesEnviados,
    ] = await Promise.all([
      tx.campanha.count({ where: NAO_EXCLUIDAS }),
      tx.campanha.count({ where: { ...NAO_EXCLUIDAS, status: 'CONCLUIDA' } }),
      tx.envioCampanha.count({ where: daCampanha }),
      tx.envioCampanha.count({ where: { ...daCampanha, status: 'ENFILEIRADO' } }),
      tx.envioCampanha.count({
        where: { ...daCampanha, mensagemWhatsapp: { status: { in: [...CONFIRMADAS] } } },
      }),
      tx.mensagemAutomatica.count({ where: NAO_EXCLUIDAS }),
      tx.mensagemAutomatica.count({ where: { ...NAO_EXCLUIDAS, ativa: true } }),
      tx.envioCampanha.count({ where: { ...daAutomacao, status: 'ENFILEIRADO' } }),
    ]);
    return {
      totalCampanhas,
      concluidas,
      mensagensEnviadas: confirmadas,
      destinatarios,
      taxaSucesso: enfileirados === 0 ? 0 : Math.round((confirmadas / enfileirados) * 1000) / 10,
      automacoes,
      automacoesAtivas,
      automacoesEnviados,
    };
  }

  // ---------- Apoio ----------

  private async buscar(id: string): Promise<CampanhaCompleta> {
    const campanha = isUuid(id)
      ? await this.txHost.tx.campanha.findFirst({
          where: { id, ...NAO_EXCLUIDAS },
          include: INCLUDE,
        })
      : null;
    if (!campanha) {
      throw new BusinessException(ErrorCode.NOT_FOUND, 'Campanha não encontrada', { status: 404 });
    }
    return campanha;
  }

  private dados(input: CampanhaInput) {
    return {
      nome: input.nome,
      tipoEnvio: input.tipoEnvio,
      canalId: input.canalId,
      ...camposDoFiltro(input),
      quantidade: input.quantidade,
      intervaloSegundos: input.intervaloSegundos,
      agendadaPara:
        input.data && input.hora ? instanteDaAtividade(input.data, input.hora) : new Date(),
      mensagem: input.mensagem,
    };
  }

  private async contagens(ids: readonly string[]): Promise<Map<string, Contagem>> {
    const contagens = new Map<string, Contagem>(
      ids.map((id) => [id, { total: 0, enviados: 0, falhas: 0 }]),
    );
    if (ids.length === 0) return contagens;
    const grupos = await this.txHost.tx.envioCampanha.groupBy({
      by: ['campanhaId', 'status'],
      where: { campanhaId: { in: [...ids] } },
      _count: { _all: true },
    });
    for (const g of grupos) {
      const c = g.campanhaId ? contagens.get(g.campanhaId) : undefined;
      if (!c) continue;
      c.total += g._count._all;
      if (g.status === 'ENFILEIRADO') c.enviados += g._count._all;
      if (g.status === 'FALHA') c.falhas += g._count._all;
    }
    return contagens;
  }

  private async paraDto(linhas: readonly CampanhaCompleta[]): Promise<Campanha[]> {
    const contagens = await this.contagens(linhas.map((c) => c.id));
    return linhas.map((c) => {
      const n = contagens.get(c.id) ?? { total: 0, enviados: 0, falhas: 0 };
      return {
        id: c.id,
        nome: c.nome,
        tipoEnvio: c.tipoEnvio,
        canalId: c.canalId,
        canal: c.canal.nome,
        filtro: c.filtro,
        origemClienteId: c.origemClienteId,
        origem: c.origemCliente?.nome ?? null,
        diasCompra: c.diasCompra,
        quantidade: c.quantidade,
        intervaloSegundos: c.intervaloSegundos,
        agendadaPara: c.agendadaPara.toISOString(),
        mensagem: c.mensagem,
        status: c.status,
        totalDestinatarios: n.total,
        totalEnviados: n.enviados,
        totalFalhas: n.falhas,
        iniciadaEm: c.iniciadaEm?.toISOString() ?? null,
        concluidaEm: c.concluidaEm?.toISOString() ?? null,
        canceladaEm: c.canceladaEm?.toISOString() ?? null,
        createdAt: c.createdAt.toISOString(),
      };
    });
  }

  private async toDto(campanha: CampanhaCompleta): Promise<Campanha> {
    const [dto] = await this.paraDto([campanha]);
    return dto as Campanha;
  }
}
