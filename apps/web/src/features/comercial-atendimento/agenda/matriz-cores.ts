import type { MatrizStatus } from '@torres/shared';
import { COR_BLOQUEIO, COR_CONTRATO } from '@/features/gestao-profissionais/salas/cores-bloqueio';

/**
 * Cor de cada status da Agenda matricial, nos temas claro e escuro. Bloqueio, manutenção, reserva,
 * cortesia e uso avulso têm as mesmas cores do Mapa de Ocupação (#138) e o período contratado a
 * dele (#110), para a gestão ler igual nas duas telas.
 */
export const COR_MATRIZ: Readonly<Record<MatrizStatus, string>> = {
  DISPONIVEL: 'bg-muted/40 text-muted-foreground',
  CONTRATADO: COR_CONTRATO,
  AGENDADO: 'bg-blue-600 text-white dark:bg-blue-500 dark:text-white',
  ...COR_BLOQUEIO,
};

/** Destaque do período contratado sem agendamento (contorno tracejado laranja). */
export const DESTAQUE_SEM_USO =
  'outline-2 outline-dashed outline-orange-500 -outline-offset-2 dark:outline-orange-400';
