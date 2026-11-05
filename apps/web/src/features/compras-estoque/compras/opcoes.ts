import type { CompraStatus } from '@torres/shared';

export const TOM_STATUS_COMPRA: Record<CompraStatus, 'sucesso' | 'alerta' | 'perigo'> = {
  PENDENTE: 'alerta',
  RECEBIDA: 'sucesso',
  CANCELADA: 'perigo',
};
