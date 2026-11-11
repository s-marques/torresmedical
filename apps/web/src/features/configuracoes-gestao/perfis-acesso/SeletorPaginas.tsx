import { MENU } from '@torres/shared';
import { ChevronRightIcon } from 'lucide-react';
import { useId, useState } from 'react';
import { useController, useFormContext } from 'react-hook-form';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

export interface SeletorPaginasProps {
  name?: string;
  className?: string;
}

/**
 * Campo "Páginas Permitidas" dos modais Novo/Editar Perfil: uma árvore com os módulos do menu
 * e, dentro de cada um, uma página por tela. Marcar uma página concede a permissão `.ver` dela.
 */
export function SeletorPaginas({
  name = 'paginasPermitidas',
  className,
}: Readonly<SeletorPaginasProps>) {
  const { control } = useFormContext();
  const { field, fieldState } = useController({ name, control });
  const selecionadas: string[] = field.value ?? [];
  const id = useId();
  const erro = fieldState.error?.message;
  const [abertos, setAbertos] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      MENU.map((modulo) => [
        modulo.id,
        modulo.telas.some((tela) => selecionadas.includes(tela.id)),
      ]),
    ),
  );

  function alternar(id: string, marcado: boolean) {
    field.onChange(
      marcado ? [...new Set([...selecionadas, id])] : selecionadas.filter((p) => p !== id),
    );
  }

  function alternarModulo(telaIds: string[], marcado: boolean) {
    field.onChange(
      marcado
        ? [...new Set([...selecionadas, ...telaIds])]
        : selecionadas.filter((p) => !telaIds.includes(p)),
    );
  }

  return (
    <div className={cn('grid content-start gap-2', className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1">
          <Label id={`${id}-rotulo`}>Páginas Permitidas</Label>
          <span aria-hidden className="text-sm leading-none text-destructive">
            *
          </span>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            className="text-sm font-medium text-primary hover:underline"
            onClick={() => field.onChange(MENU.flatMap((modulo) => modulo.telas.map((t) => t.id)))}
          >
            Selecionar Todas
          </button>
          <button
            type="button"
            className="text-sm font-medium text-muted-foreground hover:underline"
            onClick={() => field.onChange([])}
          >
            Limpar
          </button>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        {selecionadas.length} página(s) selecionada(s)
      </p>
      <div
        role="group"
        aria-labelledby={`${id}-rotulo`}
        aria-invalid={Boolean(erro)}
        className="grid gap-1 rounded-md border p-2"
      >
        {MENU.map((modulo) => {
          const telaIds = modulo.telas.map((tela) => tela.id);
          const marcadas = telaIds.filter((telaId) => selecionadas.includes(telaId)).length;
          const estado =
            marcadas === 0 ? false : marcadas === telaIds.length ? true : 'indeterminate';

          return (
            <Collapsible
              key={modulo.id}
              open={abertos[modulo.id] ?? false}
              onOpenChange={(aberto) => setAbertos((atual) => ({ ...atual, [modulo.id]: aberto }))}
            >
              <div className="flex items-center gap-2 py-1.5">
                <CollapsibleTrigger asChild>
                  <button
                    type="button"
                    aria-label={`${abertos[modulo.id] ? 'Recolher' : 'Expandir'} ${modulo.nome}`}
                    className="text-muted-foreground"
                  >
                    <ChevronRightIcon
                      aria-hidden
                      className={cn(
                        'size-4 transition-transform',
                        abertos[modulo.id] && 'rotate-90',
                      )}
                    />
                  </button>
                </CollapsibleTrigger>
                <Checkbox
                  checked={estado}
                  aria-label={modulo.nome}
                  onCheckedChange={(marcado) => alternarModulo(telaIds, marcado === true)}
                />
                <span className="flex-1 text-sm font-medium">{modulo.nome}</span>
                <span className="text-xs text-muted-foreground">
                  {marcadas}/{telaIds.length}
                </span>
              </div>
              <CollapsibleContent className="grid gap-1 py-1 pl-9 sm:grid-cols-2">
                {modulo.telas.map((tela) => (
                  <label key={tela.id} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={selecionadas.includes(tela.id)}
                      onCheckedChange={(marcado) => alternar(tela.id, marcado === true)}
                    />
                    {tela.nome}
                  </label>
                ))}
              </CollapsibleContent>
            </Collapsible>
          );
        })}
      </div>
      {erro && (
        <p id={`${id}-erro`} className="text-sm text-destructive">
          {erro}
        </p>
      )}
    </div>
  );
}
