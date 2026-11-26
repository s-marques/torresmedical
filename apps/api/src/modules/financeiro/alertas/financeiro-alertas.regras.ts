import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { AlertaRegra, FonteAlertas } from '../../../common/alertas/alerta-regra';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import { DO_TORRES, NAO_EXCLUIDAS } from '../conta-financeira';

function dia(valor: string): Date {
  return new Date(`${valor}T00:00:00.000Z`);
}

/**
 * Alertas do Financeiro (issue #160, requisitos R §33 e §45): contas a pagar que vencem hoje,
 * contas a pagar vencidas e recebíveis vencidos. As mesmas condições dos filtros das listas
 * (`/pagar` e `/receber`), para o número do alerta bater com a lista que ele abre.
 */
@Injectable()
export class FinanceiroAlertasRegras implements FonteAlertas {
  constructor(private readonly txHost: TransactionHost<PrismaAdapter>) {}

  regras(): readonly AlertaRegra[] {
    return [
      {
        tipo: 'CONTAS_PAGAR_VENCENDO',
        contar: (hoje) =>
          this.txHost.tx.contaPagar.count({
            where: { ...NAO_EXCLUIDAS, status: 'PENDENTE', dataVencimento: dia(hoje) },
          }),
      },
      {
        tipo: 'CONTAS_PAGAR_VENCIDAS',
        contar: (hoje) =>
          this.txHost.tx.contaPagar.count({
            where: { ...NAO_EXCLUIDAS, status: 'PENDENTE', dataVencimento: { lt: dia(hoje) } },
          }),
      },
      {
        // Mesma condição do filtro `?status=PENDENTE&aprovacao=LANCADA` da lista (issue #164).
        tipo: 'CONTAS_PAGAR_AGUARDANDO_APROVACAO',
        contar: () =>
          this.txHost.tx.contaPagar.count({
            where: { ...NAO_EXCLUIDAS, status: 'PENDENTE', aprovacao: 'LANCADA' },
          }),
      },
      {
        tipo: 'RECEBIVEIS_VENCIDOS',
        contar: (hoje) =>
          this.txHost.tx.contaReceber.count({
            where: {
              ...DO_TORRES,
              status: { in: ['PENDENTE', 'PARCIAL'] },
              dataVencimento: { lt: dia(hoje) },
            },
          }),
      },
    ];
  }
}
