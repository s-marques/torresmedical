import {
  MOTIVOS_ENTRADA,
  MOTIVOS_SAIDA,
  ROTULO_MOTIVO_ENTRADA,
  ROTULO_MOTIVO_SAIDA,
  type EstoqueStatus,
  type PrioridadeSugestao,
  type TipoMovimentacao,
} from '@torres/shared';
import type { TomStatus } from '@/components/shared/StatusBadge';

export const OPCOES_MOTIVO_ENTRADA = MOTIVOS_ENTRADA.map((valor) => ({
  valor,
  rotulo: ROTULO_MOTIVO_ENTRADA[valor],
}));

export const OPCOES_MOTIVO_SAIDA = MOTIVOS_SAIDA.map((valor) => ({
  valor,
  rotulo: ROTULO_MOTIVO_SAIDA[valor],
}));

export const TOM_STATUS_ESTOQUE: Record<EstoqueStatus, TomStatus> = {
  OK: 'sucesso',
  BAIXO: 'alerta',
  ZERADO: 'perigo',
  SEM_CONTROLE: 'neutro',
};

/** Print "Movimentações": Entrada verde, Saída vermelha, Ajuste azul. */
export const TOM_TIPO_MOVIMENTACAO: Record<TipoMovimentacao, TomStatus> = {
  ENTRADA: 'sucesso',
  SAIDA: 'perigo',
  AJUSTE: 'info',
};

export const TOM_PRIORIDADE: Record<PrioridadeSugestao, TomStatus> = {
  CRITICO: 'perigo',
  URGENTE: 'alerta',
  NORMAL: 'neutro',
};
