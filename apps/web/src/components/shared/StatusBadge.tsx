import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

/** Tom da pílula de status (prints do inventário: Ativo verde, Inativo vermelho, Pendente laranja…). */
export type TomStatus = 'sucesso' | 'perigo' | 'alerta' | 'info' | 'destaque' | 'neutro';

const CORES: Record<TomStatus, string> = {
  sucesso:
    'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  perigo:
    'border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300',
  alerta:
    'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300',
  info: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300',
  destaque:
    'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-300',
  neutro: 'border-border bg-muted text-muted-foreground',
};

export interface StatusBadgeProps {
  tom?: TomStatus;
  children: ReactNode;
  className?: string;
}

/** Pílula de status das tabelas e detalhes. Ex.: `<StatusBadge tom="alerta">Pendente</StatusBadge>`. */
export function StatusBadge({ tom = 'neutro', children, className }: Readonly<StatusBadgeProps>) {
  return (
    <Badge variant="outline" data-tom={tom} className={cn(CORES[tom], className)}>
      {children}
    </Badge>
  );
}

/** Status Ativo/Inativo, o mais comum do inventário. */
export function StatusAtivo({ ativo }: Readonly<{ ativo: boolean }>) {
  return (
    <StatusBadge tom={ativo ? 'sucesso' : 'perigo'}>{ativo ? 'Ativo' : 'Inativo'}</StatusBadge>
  );
}
