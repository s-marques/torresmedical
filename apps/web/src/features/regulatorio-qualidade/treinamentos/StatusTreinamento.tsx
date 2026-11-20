import { type TreinamentoStatus } from '@torres/shared';
import { useTranslation } from 'react-i18next';
import { StatusBadge, type TomStatus } from '@/components/shared/StatusBadge';

const TOM: Record<TreinamentoStatus, TomStatus> = {
  valido: 'sucesso',
  vencido: 'perigo',
};

/** Pílula de status do treinamento: Válido ou Vencido. */
export function StatusTreinamento({ status }: Readonly<{ status: TreinamentoStatus }>) {
  const { t } = useTranslation();
  return <StatusBadge tom={TOM[status]}>{t(`treinamentos.status.${status}`)}</StatusBadge>;
}
