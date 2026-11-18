import { MENSALIDADE_ROTULO_STATUS, type MensalidadeStatus } from '@torres/shared';
import { StatusBadge, type TomStatus } from '@/components/shared/StatusBadge';

const TOM_STATUS: Record<MensalidadeStatus, TomStatus> = {
  ATIVO: 'sucesso',
  PAUSADO: 'alerta',
  CANCELADO: 'perigo',
};

export function StatusMensalidade({ status }: Readonly<{ status: MensalidadeStatus }>) {
  return <StatusBadge tom={TOM_STATUS[status]}>{MENSALIDADE_ROTULO_STATUS[status]}</StatusBadge>;
}
