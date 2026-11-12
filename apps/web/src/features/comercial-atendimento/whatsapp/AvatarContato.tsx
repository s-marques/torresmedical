import { cn } from '@/lib/utils';
import { iniciais } from './formatar';

/** Avatar com as iniciais do contato (sem foto: a foto vem da integração com o provedor). */
export function AvatarContato({
  nome,
  className,
}: Readonly<{ nome: string | null; className?: string }>) {
  return (
    <span
      aria-hidden
      className={cn(
        'flex size-10 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-sm font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
        className,
      )}
    >
      {iniciais(nome)}
    </span>
  );
}
