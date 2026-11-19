import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import type {
  ContaBancaria,
  CreateContaBancariaInput,
  ListContasBancariasQuery,
} from '@torres/shared';
import { Prisma } from '../../../generated/prisma/client';
import { BusinessException } from '../../../common/errors/api.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import { searchWhere } from '../../../common/pagination/paginate';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';

import { DO_TORRES } from '../conta-financeira';

const NAO_EXCLUIDAS = { deletedAt: null } as const;
const SELECIONAVEIS = { ...NAO_EXCLUIDAS, ativo: true } as const;

type ContaBancariaRow = Prisma.ContaBancariaGetPayload<object>;

const dia = (data: Date) => data.toISOString().slice(0, 10);

export function toContaBancaria(conta: ContaBancariaRow, saldo: Prisma.Decimal): ContaBancaria {
  return {
    id: conta.id,
    nome: conta.nome,
    tipo: conta.tipo,
    banco: conta.banco,
    agencia: conta.agencia,
    conta: conta.conta,
    saldoInicial: conta.saldoInicial.toString(),
    dataSaldoInicial: conta.dataSaldoInicial ? dia(conta.dataSaldoInicial) : null,
    saldo: saldo.toString(),
    ativo: conta.ativo,
  };
}

/**
 * Conta bancária do Financeiro: aba "Contas Bancárias" da Conciliação (#46) e comboboxes
 * "Conta Bancária" de Contas a Pagar (baixa) e Contas a Receber (recebimento).
 *
 * Saldo (regra confirmada pelo dev na #46) = saldo inicial + contas recebidas na conta − baixas
 * pagas pela conta, contando só o que tem data igual ou posterior à data do saldo inicial.
 */
@Injectable()
export class ContasBancariasService {
  constructor(private readonly txHost: TransactionHost<PrismaAdapter>) {}

  async list(query: ListContasBancariasQuery): Promise<{ data: ContaBancaria[]; total: number }> {
    const where = { ...SELECIONAVEIS, ...searchWhere(query.search, ['nome', 'banco']) };
    const contas = await this.txHost.tx.contaBancaria.findMany({
      where,
      orderBy: [{ nome: 'asc' }, { id: 'asc' }],
    });
    const data = await Promise.all(
      contas.map(async (c) => toContaBancaria(c, await this.saldo(c))),
    );
    return { data, total: data.length };
  }

  async findById(id: string): Promise<ContaBancaria> {
    const conta = await this.txHost.tx.contaBancaria.findFirst({ where: { id, ...NAO_EXCLUIDAS } });
    if (!conta) {
      throw new BusinessException(ErrorCode.NOT_FOUND, 'Conta bancária não encontrada', {
        status: 404,
      });
    }
    return toContaBancaria(conta, await this.saldo(conta));
  }

  /** Modal "Nova Conta". */
  async create(input: CreateContaBancariaInput): Promise<ContaBancaria> {
    const conta = await this.txHost.tx.contaBancaria.create({
      data: {
        ...input,
        dataSaldoInicial: input.dataSaldoInicial ? new Date(input.dataSaldoInicial) : null,
      },
    });
    return toContaBancaria(conta, await this.saldo(conta));
  }

  /**
   * Lixeira do card. Exclusão lógica: as baixas e os recebimentos já lançados continuam
   * apontando para a conta (histórico financeiro), mas ela some da aba e dos comboboxes.
   */
  async remove(id: string): Promise<ContaBancaria> {
    const atual = await this.findById(id);
    await this.txHost.tx.contaBancaria.update({ where: { id }, data: { deletedAt: new Date() } });
    return atual;
  }

  /** Garante que a conta existe e não foi excluída (usado ao gravar um recebimento). */
  async garantirExiste(id: string): Promise<void> {
    const existe = await this.txHost.tx.contaBancaria.count({ where: { id, ...NAO_EXCLUIDAS } });
    if (!existe) {
      throw new BusinessException(ErrorCode.NOT_FOUND, 'Conta bancária não encontrada', {
        status: 404,
        details: [{ field: 'contaBancariaId', message: 'Conta bancária não encontrada' }],
      });
    }
  }

  private async saldo(conta: ContaBancariaRow): Promise<Prisma.Decimal> {
    const desde = conta.dataSaldoInicial ? { gte: conta.dataSaldoInicial } : undefined;
    const [recebido, pago] = await Promise.all([
      this.txHost.tx.contaReceber.aggregate({
        _sum: { valor: true },
        where: {
          ...DO_TORRES,
          contaBancariaId: conta.id,
          status: 'RECEBIDO',
          dataRecebimento: desde,
        },
      }),
      this.txHost.tx.contaPagarBaixa.aggregate({
        _sum: { valorPago: true },
        where: {
          ...NAO_EXCLUIDAS,
          contaBancariaId: conta.id,
          dataPagamento: desde,
          contaPagar: NAO_EXCLUIDAS,
        },
      }),
    ]);
    return conta.saldoInicial
      .add(recebido._sum.valor ?? new Prisma.Decimal(0))
      .sub(pago._sum.valorPago ?? new Prisma.Decimal(0));
  }
}
