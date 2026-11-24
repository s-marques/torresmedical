import {
  CLASSIFICACAO_JANELA_DIAS,
  CLASSIFICACAO_NOVO_DIAS,
  type ClassificacaoMotivo,
  type ClassificacaoParametros,
} from '@torres/shared';
import { useTranslation } from 'react-i18next';

/** Texto do motivo no idioma do usuário ("1 de 4 períodos usados em 30 dias"). */
export function useTextoMotivo() {
  const { t } = useTranslation();
  return (motivo: ClassificacaoMotivo, parametros: ClassificacaoParametros): string =>
    t(`classificacao.motivos.${motivo}`, {
      ...parametros,
      janela: CLASSIFICACAO_JANELA_DIAS,
      limite: CLASSIFICACAO_NOVO_DIAS,
    });
}
