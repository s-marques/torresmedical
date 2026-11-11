import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import type { LookupItem, LookupQuery } from '@torres/shared';
import type { CanalWhatsapp, Prisma } from '../../../generated/prisma/client';
import { EntidadeLookupService, type FonteLookup } from '../../../common/lookups/lookup-query';
import { searchWhere } from '../../../common/pagination/paginate';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';

/**
 * Canais WhatsApp (números conectados ao provedor). O cadastro é a tela Agentes IA (#26);
 * por enquanto só o lookup, usado nos chips "Canal" da tela WhatsApp (`/atendimento`).
 */
@Injectable()
export class CanaisWhatsappService extends EntidadeLookupService<
  LookupQuery<'canais-whatsapp'>,
  Prisma.CanalWhatsappWhereInput,
  CanalWhatsapp
> {
  protected readonly naoEncontrado = 'Canal não encontrado';
  protected readonly fonte: FonteLookup<Prisma.CanalWhatsappWhereInput, CanalWhatsapp> = {
    findMany: (args) => this.txHost.tx.canalWhatsapp.findMany(args),
    count: (args) => this.txHost.tx.canalWhatsapp.count(args),
    findFirst: (args) => this.txHost.tx.canalWhatsapp.findFirst(args),
  };

  constructor(private readonly txHost: TransactionHost<PrismaAdapter>) {
    super();
  }

  protected filtro(query: LookupQuery<'canais-whatsapp'>): Prisma.CanalWhatsappWhereInput {
    return { deletedAt: null, ...searchWhere(query.search, ['nome', 'numero']) };
  }

  /** Chip "Nome (número)": o número vai no texto secundário. */
  protected toItem(canal: CanalWhatsapp): LookupItem {
    return { id: canal.id, label: canal.nome, descricao: canal.numero };
  }
}
