import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import { NEGOCIO_STATUS_ROTULO, type LookupItem, type LookupQuery } from '@torres/shared';
import type { Prisma } from '../../../generated/prisma/client';
import {
  buscarPorId,
  juntarDescricao,
  listarLookup,
  type FonteLookup,
} from '../../../common/lookups/lookup-query';
import type { ProvedorLookup } from '../../../common/lookups/lookup.controller';
import type { Page } from '../../../common/pagination/paginate';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';

const INCLUDE = { estagio: { select: { nome: true } } } satisfies Prisma.NegocioInclude;
type NegocioLookup = Prisma.NegocioGetPayload<{ include: typeof INCLUDE }>;

/**
 * Lookup `GET /api/lookups/negocios`: negócios abertos do CRM para o campo "Negócio" da Nova
 * Atividade. O item pelo id vale para qualquer negócio não excluído (inclusive ganho/perdido).
 */
@Injectable()
export class NegociosLookupService implements ProvedorLookup<'negocios'> {
  private readonly fonte: FonteLookup<Prisma.NegocioWhereInput, NegocioLookup> = {
    // O lookup ordena por "nome"; no negócio, o equivalente é o título.
    findMany: ({ orderBy, ...args }) =>
      this.txHost.tx.negocio.findMany({
        ...args,
        orderBy: orderBy.map((o) => ('nome' in o ? { titulo: o.nome } : o)),
        include: INCLUDE,
      }),
    count: (args) => this.txHost.tx.negocio.count(args),
    findFirst: (args) => this.txHost.tx.negocio.findFirst({ ...args, include: INCLUDE }),
  };

  constructor(private readonly txHost: TransactionHost<PrismaAdapter>) {}

  lookup(query: LookupQuery<'negocios'>): Promise<Page<LookupItem>> {
    const where: Prisma.NegocioWhereInput = {
      deletedAt: null,
      status: 'ABERTO',
      ...(query.search ? { titulo: { contains: query.search, mode: 'insensitive' } } : {}),
    };
    return listarLookup(query, this.fonte, where, (n) => this.toItem(n));
  }

  async findLookupById(id: string): Promise<LookupItem> {
    return this.toItem(await buscarPorId(this.fonte, id, 'Negócio não encontrado'));
  }

  private toItem(n: NegocioLookup): LookupItem {
    return {
      id: n.id,
      label: n.titulo,
      descricao: juntarDescricao(
        n.estagio.nome,
        n.status === 'ABERTO' ? null : NEGOCIO_STATUS_ROTULO[n.status],
      ),
    };
  }
}
