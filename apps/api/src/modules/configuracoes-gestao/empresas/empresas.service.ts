import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import type { LookupItem, LookupQuery } from '@torres/shared';
import type { Empresa, Prisma } from '../../../generated/prisma/client';
import { EntidadeLookupService, type FonteLookup } from '../../../common/lookups/lookup-query';
import { searchWhere } from '../../../common/pagination/paginate';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';

/** Empresa (tela Minha Empresa). Não tem status: só sai do lookup ao ser excluída. */
@Injectable()
export class EmpresasService extends EntidadeLookupService<
  LookupQuery<'empresas'>,
  Prisma.EmpresaWhereInput,
  Empresa
> {
  protected readonly naoEncontrado = 'Empresa não encontrada';
  protected readonly fonte: FonteLookup<Prisma.EmpresaWhereInput, Empresa> = {
    findMany: (args) => this.txHost.tx.empresa.findMany(args),
    count: (args) => this.txHost.tx.empresa.count(args),
    findFirst: (args) => this.txHost.tx.empresa.findFirst(args),
  };

  constructor(private readonly txHost: TransactionHost<PrismaAdapter>) {
    super();
  }

  protected filtro(query: LookupQuery<'empresas'>): Prisma.EmpresaWhereInput {
    return { deletedAt: null, ...searchWhere(query.search, ['nome']) };
  }

  protected toItem(empresa: Empresa): LookupItem {
    return { id: empresa.id, label: empresa.nome, descricao: null };
  }
}
