import type { TelaMenu } from '@torres/shared';
import { Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { Skeleton } from '@/components/ui/skeleton';
import { usePermissao } from '@/lib/auth/use-sessao';
import { PAGINAS } from '../paginas';
import { EmConstrucaoPage } from './EmConstrucaoPage';
import { SemPermissaoPage } from './SemPermissaoPage';

export interface PaginaDaTelaProps {
  tela: TelaMenu;
}

/**
 * Página registrada para a tela ou, se ainda não houver, o placeholder "Em construção".
 * Sem a permissão de ver a tela, mostra "Sem permissão".
 */
export function PaginaDaTela({ tela }: Readonly<PaginaDaTelaProps>) {
  const permitida = usePermissao(tela.permissao);
  const { t } = useTranslation();
  const Pagina = PAGINAS[tela.id];
  if (!permitida) return <SemPermissaoPage />;
  if (!Pagina) return <EmConstrucaoPage tela={tela} />;
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" aria-label={t('paginas.carregando')} />}>
      <Pagina />
    </Suspense>
  );
}
