import { InboxIcon, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface EmptyStateProps {
  /** Ex.: "Nenhum veiculo encontrado." (texto do inventário de cada tela). */
  titulo: string;
  descricao?: ReactNode;
  icone?: LucideIcon;
  /** Ex.: botão "Criar primeira resposta". */
  acao?: ReactNode;
  className?: string;
}

/** Estado vazio de listas e painéis. */
export function EmptyState({
  titulo,
  descricao,
  icone: Icone = InboxIcon,
  acao,
  className,
}: Readonly<EmptyStateProps>) {
  return (
    <div
      role="status"
      className={cn('flex flex-col items-center justify-center gap-2 py-10 text-center', className)}
    >
      <Icone aria-hidden className="size-8 text-muted-foreground" />
      <p className="text-sm font-medium">{titulo}</p>
      {descricao && <p className="max-w-sm text-sm text-muted-foreground">{descricao}</p>}
      {acao && <div className="mt-2">{acao}</div>}
    </div>
  );
}
