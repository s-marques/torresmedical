import { type NaoConformidadeStatus } from '@torres/shared';
import { useTranslation } from 'react-i18next';
import { StatusBadge, type TomStatus } from '@/components/shared/StatusBadge';

const TOM: Record<NaoConformidadeStatus, TomStatus> = {
  aberta: 'perigo',
  'em-tratamento': 'alerta',
  corrigida: 'info',
  fechada: 'sucesso',
};

/** Pílula de status da NC: Aberta, Em Tratamento, Corrigida ou Fechada. */
export function StatusNaoConformidade({ status }: Readonly<{ status: NaoConformidadeStatus }>) {
  const { t } = useTranslation();
  return <StatusBadge tom={TOM[status]}>{t(`naoConformidades.status.${status}`)}</StatusBadge>;
}
