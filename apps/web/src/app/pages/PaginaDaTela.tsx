import type { TelaMenu } from '@torres/shared';
import { Suspense } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { PAGINAS } from '../paginas';
import { EmConstrucaoPage } from './EmConstrucaoPage';

export interface PaginaDaTelaProps {
  tela: TelaMenu;
}

/** Página registrada para a tela ou, se ainda não houver, o placeholder "Em construção". */
export function PaginaDaTela({ tela }: Readonly<PaginaDaTelaProps>) {
  const Pagina = PAGINAS[tela.id];
  if (!Pagina) return <EmConstrucaoPage tela={tela} />;
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" aria-label="Carregando" />}>
      <Pagina />
    </Suspense>
  );
}
