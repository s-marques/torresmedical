import type { ContaPagarAprovacao } from '@torres/shared';
import { useTranslation } from 'react-i18next';
import { StatusBadge, type TomStatus } from '@/components/shared/StatusBadge';

const TOM: Record<ContaPagarAprovacao, TomStatus> = {
  LANCADA: 'alerta',
  APROVADA: 'sucesso',
  RECUSADA: 'perigo',
};

/** Pílula da situação de aprovação da conta a pagar (issue #164). */
export function SituacaoAprovacao({ aprovacao }: Readonly<{ aprovacao: ContaPagarAprovacao }>) {
  const { t } = useTranslation();
  return (
    <StatusBadge tom={TOM[aprovacao]}>
      {t(`contasPagar.aprovacao.situacoes.${aprovacao}`)}
    </StatusBadge>
  );
}
