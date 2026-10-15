import { MENU, type TelaMenu } from '@torres/shared';
import { Construction } from 'lucide-react';

export interface EmConstrucaoPageProps {
  tela: TelaMenu;
}

/** Placeholder de uma tela do inventário até a issue da tela ser implementada. */
export function EmConstrucaoPage({ tela }: Readonly<EmConstrucaoPageProps>) {
  const modulo = MENU.find((m) => m.id === tela.modulo);

  return (
    <section className="grid gap-6">
      <header>
        <p className="text-sm text-muted-foreground">{modulo?.nome}</p>
        <h1 className="text-2xl font-bold tracking-tight">{tela.nome}</h1>
      </header>
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-12 text-center">
        <Construction className="size-10 text-muted-foreground" aria-hidden />
        <h2 className="text-lg font-semibold">Em construção</h2>
        <p className="max-w-md text-sm text-muted-foreground">
          Esta tela ainda está sendo reconstruída e estará disponível em breve.
        </p>
      </div>
    </section>
  );
}
