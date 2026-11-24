import { CONTRATO_STATUS_ROTULOS, type ContratoStatus } from '@torres/shared';
import { StatusBadge, type TomStatus } from '@/components/shared/StatusBadge';

const TONS: Record<ContratoStatus, TomStatus> = {
  ATIVO: 'sucesso',
  CANCELADO: 'neutro',
  ENCERRADO: 'alerta',
  AGUARDANDO_ASSINATURA: 'info',
};

/** Selo de status do contrato: ativo, cancelado, encerrado ou aguardando assinatura. */
export function StatusContrato({ status }: Readonly<{ status: ContratoStatus }>) {
  return <StatusBadge tom={TONS[status]}>{CONTRATO_STATUS_ROTULOS[status]}</StatusBadge>;
}
