import type { ContaReceberStatusExibicao } from '@torres/shared';
import { useTranslation } from 'react-i18next';

/** Rótulos do status da receita (inclusive "Vencido", calculado) no idioma da interface. */
export function useRotulosStatusReceita(): Record<ContaReceberStatusExibicao, string> {
  const { t } = useTranslation();
  return {
    A_VENCER: t('receitaProfissionais.status.pendente'),
    RECEBIDO: t('receitaProfissionais.status.recebido'),
    CANCELADO: t('receitaProfissionais.status.cancelado'),
    // Parcial e Renegociado só existem em Contas a Receber (issue #165); a receita não os usa.
    PARCIAL: t('contasReceber.status.parcial'),
    RENEGOCIADO: t('contasReceber.status.renegociado'),
    VENCIDO: t('receitaProfissionais.status.vencido'),
  };
}
