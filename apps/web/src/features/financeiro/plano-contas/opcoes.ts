import { PLANO_CONTA_ROTULO_TIPO, PLANO_CONTA_TIPOS } from '@torres/shared';

/** Combo Tipo do modal e filtro da listagem: valor da API (minúsculo) com o rótulo do grid. */
export const OPCOES_TIPO = PLANO_CONTA_TIPOS.map((valor) => ({
  valor,
  rotulo: PLANO_CONTA_ROTULO_TIPO[valor.toUpperCase() as keyof typeof PLANO_CONTA_ROTULO_TIPO],
}));
