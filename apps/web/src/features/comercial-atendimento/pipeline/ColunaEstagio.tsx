import { useDroppable } from '@dnd-kit/core';
import type { ColunaQuadro, Estagio } from '@torres/shared';
import { PlusIcon } from 'lucide-react';
import { SePermitido } from '@/components/shared/SePermitido';
import { Button } from '@/components/ui/button';
import { formatarMoeda } from '@/lib/forms/mascaras';
import { cn } from '@/lib/utils';
import { CartaoNegocio, type AcoesCartao } from './CartaoNegocio';

export interface ColunaEstagioProps extends AcoesCartao {
  coluna: ColunaQuadro;
  estagios: readonly Estagio[];
  onNovo: (estagioId: string) => void;
}

/** Coluna do quadro: estágio com quantidade, total, botão "+" e os cartões (área de soltar). */
export function ColunaEstagio({
  coluna,
  estagios,
  onNovo,
  ...acoes
}: Readonly<ColunaEstagioProps>) {
  const { setNodeRef, isOver } = useDroppable({ id: coluna.estagioId });

  return (
    <section
      aria-label={coluna.nome}
      className={cn(
        'flex max-h-[calc(100svh-18rem)] min-h-64 w-72 shrink-0 flex-col rounded-xl border bg-muted/40',
        isOver && 'ring-2 ring-primary/60',
      )}
    >
      <header className="grid gap-1 border-b p-3">
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className="size-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: coluna.cor }}
          />
          <h2 className="truncate text-sm font-semibold uppercase">{coluna.nome}</h2>
          <span className="rounded-md bg-muted px-1.5 text-xs font-medium" aria-label="Quantidade">
            {coluna.quantidade}
          </span>
          <SePermitido permissao="comercial-atendimento.pipeline.criar">
            <Button
              variant="ghost"
              size="icon"
              className="ml-auto size-7"
              aria-label={`Novo negócio em ${coluna.nome}`}
              onClick={() => onNovo(coluna.estagioId)}
            >
              <PlusIcon />
            </Button>
          </SePermitido>
        </div>
        <p className="text-xs text-muted-foreground">{formatarMoeda(Number(coluna.total))}</p>
      </header>
      <div ref={setNodeRef} className="grid flex-1 content-start gap-2 overflow-y-auto p-2">
        {coluna.negocios.length === 0 ? (
          <p className="py-4 text-center text-xs text-muted-foreground">Nenhum negócio</p>
        ) : (
          coluna.negocios.map((negocio) => (
            <CartaoNegocio key={negocio.id} negocio={negocio} estagios={estagios} {...acoes} />
          ))
        )}
      </div>
    </section>
  );
}
