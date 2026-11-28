import type { PontoIndicador } from '@torres/shared';
import { useTranslation } from 'react-i18next';

/** Rótulo do ponto: o fixo do sistema, traduzido, ou o nome vindo dos dados. */
export function useRotuloDoPonto() {
  const { t } = useTranslation();
  return (ponto: PontoIndicador): string =>
    ponto.chave
      ? t(`apresentacao.series.${ponto.chave}`, { defaultValue: ponto.rotulo })
      : ponto.rotulo;
}
