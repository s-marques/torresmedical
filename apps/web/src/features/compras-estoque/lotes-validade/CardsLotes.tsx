import type { ResumoLotes } from '@torres/shared';
import { ClockIcon, ShieldAlertIcon, TriangleAlertIcon, type LucideIcon } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { useResumoLotes } from './use-lotes';

interface CardInfo {
  rotulo: string;
  campo: keyof ResumoLotes;
  icone: LucideIcon;
  /** Borda colorida do print: vermelha, laranja e amarela. */
  borda: string;
}

const CARDS: readonly CardInfo[] = [
  {
    rotulo: 'Lotes Vencidos',
    campo: 'vencidos',
    icone: ShieldAlertIcon,
    borda: 'border-red-200 dark:border-red-900',
  },
  {
    rotulo: 'Vencendo em 60 dias',
    campo: 'vencendo',
    icone: ClockIcon,
    borda: 'border-orange-200 dark:border-orange-900',
  },
  {
    rotulo: 'Estoque Abaixo do Minimo',
    campo: 'abaixoMinimo',
    icone: TriangleAlertIcon,
    borda: 'border-amber-200 dark:border-amber-900',
  },
];

/** Os 3 cards do topo (print principal). */
export function CardsLotes() {
  const resumo = useResumoLotes();
  return (
    <section aria-label="Resumo dos lotes" className="grid gap-4 sm:grid-cols-3">
      {CARDS.map(({ rotulo, campo, icone: Icone, borda }) => (
        <Card key={campo} className={cn('py-5', borda)}>
          <CardContent className="grid gap-3 px-6">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm text-muted-foreground">{rotulo}</p>
              <Icone aria-hidden className="size-5 text-muted-foreground" />
            </div>
            <p className="text-2xl font-semibold tabular-nums" aria-label={rotulo}>
              {resumo.data ? resumo.data[campo] : '…'}
            </p>
          </CardContent>
        </Card>
      ))}
    </section>
  );
}
