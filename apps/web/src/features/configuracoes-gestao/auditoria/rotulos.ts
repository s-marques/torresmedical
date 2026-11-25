import type { AuditAction } from '@torres/shared';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Rótulos da trilha no idioma do usuário. Entidade ou campo sem tradução aparece com o nome
 * técnico (`defaultValue`), então uma entidade nova nunca quebra a tela. As funções só mudam
 * com o idioma, por isso servem de dependência de `useMemo`.
 */
export function useRotulosAuditoria() {
  const { t } = useTranslation();
  return useMemo(
    () => ({
      rotuloAcao: (acao: AuditAction) => t(`auditoria.acoes.${acao}`),
      rotuloEntidade: (entidade: string) =>
        t(`auditoria.entidades.${entidade}`, { defaultValue: entidade }),
      rotuloCampo: (campo: string) => t(`auditoria.campos.${campo}`, { defaultValue: campo }),
    }),
    [t],
  );
}
