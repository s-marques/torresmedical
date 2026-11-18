import type { PedidoCompraStatus } from '@torres/shared';

export const TOM_STATUS_PEDIDO: Record<PedidoCompraStatus, 'sucesso' | 'alerta' | 'perigo'> = {
  EM_TRANSITO: 'alerta',
  RECEBIDO: 'sucesso',
  CANCELADO: 'perigo',
};
