import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface ChipProps {
  ativo: boolean;
  onClick: () => void;
  children: ReactNode;
  tamanho?: 'sm' | 'md';
  className?: string;
}

/** Pílula de filtro da tela WhatsApp (canais e status): verde quando escolhida. */
export function Chip({ ativo, onClick, children, tamanho = 'md', className }: Readonly<ChipProps>) {
  return (
    <button
      type="button"
      aria-pressed={ativo}
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border font-medium transition-colors',
        tamanho === 'md' ? 'px-3 py-1 text-xs' : 'px-2.5 py-0.5 text-[11px]',
        ativo
          ? 'border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700'
          : 'bg-background text-muted-foreground hover:bg-muted',
        className,
      )}
    >
      {children}
    </button>
  );
}

/** Bolinha verde dos canais. */
export function PontoCanal() {
  return <span aria-hidden className="size-1.5 rounded-full bg-emerald-500" />;
}
