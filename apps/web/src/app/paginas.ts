import type { TelaId } from '@torres/shared';
import { lazy, type ComponentType } from 'react';

/**
 * Página de cada tela já implementada. Telas fora daqui abrem o placeholder "Em construção".
 * Ao implementar uma tela, registre a página com `lazy`, por exemplo:
 * `'financeiro.contas-receber': lazy(() => import('@/features/financeiro/contas-receber/ContasReceberPage'))`.
 */
export const PAGINAS: Partial<Record<TelaId, ComponentType>> = {
  'configuracoes-gestao.relatorios': lazy(
    () => import('@/features/configuracoes-gestao/relatorios/RelatoriosGestaoPage'),
  ),
};
