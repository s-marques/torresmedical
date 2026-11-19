import { PREFERENCIAS_PADRAO, preferenciasSchema, type Preferencias } from '@torres/shared';
import type { PreferenciaUsuario } from '../../generated/prisma/client';

/**
 * Preferências gravadas do usuário (issue #30), ou as padrão quando ele nunca alterou nada.
 * Um valor fora do catálogo (gravado fora da API) volta ao padrão só naquele campo.
 */
export function toPreferencias(linha: PreferenciaUsuario | null | undefined): Preferencias {
  if (!linha) return { ...PREFERENCIAS_PADRAO };
  const campos = Object.keys(PREFERENCIAS_PADRAO) as (keyof Preferencias)[];
  const resultado = { ...PREFERENCIAS_PADRAO } as Record<keyof Preferencias, unknown>;
  for (const campo of campos) {
    const valido = preferenciasSchema.shape[campo].safeParse(linha[campo]);
    if (valido.success) resultado[campo] = valido.data;
  }
  return resultado as Preferencias;
}
