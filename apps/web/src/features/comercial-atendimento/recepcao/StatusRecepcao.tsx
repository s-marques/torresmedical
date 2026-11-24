import type { AgendamentoStatus } from '@torres/shared';
import { useTranslation } from 'react-i18next';
import { StatusBadge, type TomStatus } from '@/components/shared/StatusBadge';

const TOM: Record<AgendamentoStatus, TomStatus> = {
  AGENDADO: 'neutro',
  CONFIRMADO: 'alerta',
  CHECK_IN: 'destaque',
  AGUARDANDO: 'destaque',
  EM_ATENDIMENTO: 'info',
  ATENDIDO: 'sucesso',
  CANCELADO: 'perigo',
  REAGENDAR: 'alerta',
  FALTOU: 'perigo',
};

/** Pílula de status com o vocabulário da recepção (Chegou, Finalizado, Cancelou, Reagendou). */
export function StatusRecepcao({ status }: Readonly<{ status: AgendamentoStatus }>) {
  const { t } = useTranslation();
  return <StatusBadge tom={TOM[status]}>{t(`recepcao.status.${status}`)}</StatusBadge>;
}
