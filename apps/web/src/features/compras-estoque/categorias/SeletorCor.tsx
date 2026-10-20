import { CATEGORIA_CORES } from '@torres/shared';
import { useController, useFormContext } from 'react-hook-form';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

const ROTULO_COR: Readonly<Record<string, string>> = {
  '#6366f1': 'Índigo',
  '#3b82f6': 'Azul',
  '#22c55e': 'Verde',
  '#eab308': 'Amarelo',
  '#f97316': 'Laranja',
  '#ef4444': 'Vermelho',
  '#ec4899': 'Rosa',
  '#a855f7': 'Roxo',
  '#6b7280': 'Cinza',
  '#14b8a6': 'Turquesa',
};

/** Bolinha de cor da categoria (grid e seletor). */
export function BolinhaCor({ cor, className }: Readonly<{ cor: string; className?: string }>) {
  return (
    <span
      aria-hidden
      className={cn('inline-block size-3 rounded-full', className)}
      style={{ backgroundColor: cor }}
    />
  );
}

/** Campo "Cor" do modal: uma bolinha por cor da paleta, com a escolhida em destaque. */
export function SeletorCor({ name = 'cor' }: Readonly<{ name?: string }>) {
  const { control } = useFormContext();
  const { field } = useController({ name, control });

  return (
    <div className="grid gap-2">
      <Label id={`${name}-rotulo`}>Cor</Label>
      <div role="radiogroup" aria-labelledby={`${name}-rotulo`} className="flex flex-wrap gap-2">
        {CATEGORIA_CORES.map((cor) => {
          const escolhida = field.value === cor;
          return (
            <button
              key={cor}
              type="button"
              role="radio"
              aria-checked={escolhida}
              aria-label={ROTULO_COR[cor]}
              onClick={() => field.onChange(cor)}
              onBlur={field.onBlur}
              className={cn(
                'size-8 rounded-full outline-offset-2 focus-visible:outline-2',
                escolhida && 'ring-2 ring-foreground ring-offset-2 ring-offset-background',
              )}
              style={{ backgroundColor: cor }}
            />
          );
        })}
      </div>
    </div>
  );
}
