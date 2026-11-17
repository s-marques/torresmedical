import { ROTULO_LOTE_STATUS, type LoteStatus } from '@torres/shared';
import { StatusBadge, type TomStatus } from '@/components/shared/StatusBadge';

const TOM_STATUS_LOTE: Readonly<Record<LoteStatus, TomStatus>> = {
  VENCIDO: 'perigo',
  VENCENDO: 'alerta',
  VALIDO: 'sucesso',
};

/** Pílula do status do lote: Vencido (vermelho), Vencendo (laranja) e Válido (verde). */
export function StatusLote({ status }: Readonly<{ status: LoteStatus }>) {
  return <StatusBadge tom={TOM_STATUS_LOTE[status]}>{ROTULO_LOTE_STATUS[status]}</StatusBadge>;
}
