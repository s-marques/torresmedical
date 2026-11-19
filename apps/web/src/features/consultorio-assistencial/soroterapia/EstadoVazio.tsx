import { DropletsIcon } from 'lucide-react';
import type { ReactNode } from 'react';

/** Estado vazio das abas Fila do Dia e Pacotes (gota, mensagem e dica opcional). */
export function EstadoVazio({ mensagem, dica }: Readonly<{ mensagem: string; dica?: ReactNode }>) {
  return (
    <div role="status" className="grid justify-items-center gap-2 py-16 text-center">
      <DropletsIcon aria-hidden className="size-10 text-muted-foreground" />
      <p className="text-muted-foreground">{mensagem}</p>
      {dica && <p className="text-xs text-muted-foreground">{dica}</p>}
    </div>
  );
}
