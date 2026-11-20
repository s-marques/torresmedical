import { type LicencaStatus } from '@torres/shared';
import { useTranslation } from 'react-i18next';
import { StatusBadge, type TomStatus } from '@/components/shared/StatusBadge';

const TOM: Record<LicencaStatus, TomStatus> = {
  ok: 'sucesso',
  'alerta-60': 'info',
  'alerta-30': 'alerta',
  vencido: 'perigo',
  na: 'neutro',
};

/** Pílula de status da licença: OK, Alerta 60 dias, Alerta 30 dias, Vencido ou N/A. */
export function StatusLicenca({ status }: Readonly<{ status: LicencaStatus }>) {
  const { t } = useTranslation();
  return <StatusBadge tom={TOM[status]}>{t(`alvarasLicencas.status.${status}`)}</StatusBadge>;
}
