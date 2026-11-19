import type { ContaReceberStatusExibicao } from '@torres/shared';
import { useTranslation } from 'react-i18next';

/** Rótulos do status da receita (inclusive "Vencido", calculado) no idioma da interface. */
export function useRotulosStatusReceita(): Record<ContaReceberStatusExibicao, string> {
  const { t } = useTranslation();
  return {
    PENDENTE: t('receitaProfissionais.status.pendente'),
    RECEBIDO: t('receitaProfissionais.status.recebido'),
    CANCELADO: t('receitaProfissionais.status.cancelado'),
    VENCIDO: t('receitaProfissionais.status.vencido'),
  };
}
