import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import type { ContaBancaria, ListContasBancariasQuery } from '@torres/shared';
import { searchWhere } from '../../../common/pagination/paginate';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';

const SELECIONAVEIS = { deletedAt: null, ativo: true } as const;

/**
 * Conta bancária do Financeiro, usada na Baixa de Contas a Pagar. Sem tela de cadastro própria
 * ainda (issue #47): só a listagem para o combobox.
 */
@Injectable()
export class ContasBancariasService {
  constructor(private readonly txHost: TransactionHost<PrismaAdapter>) {}

  async list(query: ListContasBancariasQuery): Promise<{ data: ContaBancaria[]; total: number }> {
    const where = { ...SELECIONAVEIS, ...searchWhere(query.search, ['nome', 'banco']) };
    const data = await this.txHost.tx.contaBancaria.findMany({ where, orderBy: { nome: 'asc' } });
    return { data, total: data.length };
  }
}
