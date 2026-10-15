import { useEffect } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router';
import { Skeleton } from '@/components/ui/skeleton';
import { iniciarSessao } from '@/lib/auth/sessao';
import { useSessao } from '@/lib/auth/use-sessao';

/**
 * Telas que exigem login. Ao abrir o app, retoma a sessão pelo cookie; sem sessão, vai para o
 * login e volta para a mesma URL depois de entrar.
 */
export function RotaProtegida() {
  const sessao = useSessao();
  const { pathname, search } = useLocation();

  useEffect(() => iniciarSessao(), []);

  if (sessao.status === 'carregando') {
    return (
      <div className="flex min-h-svh items-center justify-center" aria-busy="true">
        <Skeleton className="h-8 w-48" aria-label="Carregando sessão" />
      </div>
    );
  }
  if (sessao.status === 'anonimo') {
    const redirect = encodeURIComponent(`${pathname}${search}`);
    return <Navigate to={`/login?redirect=${redirect}`} replace />;
  }
  return <Outlet />;
}
