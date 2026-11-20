import type { SalaBloqueioTipo } from '@torres/shared';

/** Cor de cada tipo de bloqueio no Mapa e na tabela, nos temas claro e escuro (issue #138). */
export const COR_BLOQUEIO: Readonly<Record<SalaBloqueioTipo, string>> = {
  BLOQUEIO: 'bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-100',
  MANUTENCAO: 'bg-amber-100 text-amber-900 dark:bg-amber-900/50 dark:text-amber-100',
  RESERVA: 'bg-violet-100 text-violet-900 dark:bg-violet-900/50 dark:text-violet-100',
  CORTESIA: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/50 dark:text-emerald-100',
  USO_AVULSO: 'bg-cyan-100 text-cyan-900 dark:bg-cyan-900/50 dark:text-cyan-100',
};

/** Cor do período contratado no Mapa. */
export const COR_CONTRATO = 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-100';
