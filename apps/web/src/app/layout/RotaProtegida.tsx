import { useEffect } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router';
import { Skeleton } from '@/components/ui/skeleton';
import { iniciarSessao } from '@/lib/auth/sessao';
import { useSessao } from '@/lib/auth/use-sessao';

const ROTA_TROCAR_SENHA = '/trocar-senha';

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
  // Senha provisória ou vencida (issue #156): só a tela de troca de senha fica liberada.
  if (sessao.usuario.trocarSenha && pathname !== ROTA_TROCAR_SENHA) {
    const redirect = encodeURIComponent(`${pathname}${search}`);
    return <Navigate to={`${ROTA_TROCAR_SENHA}?redirect=${redirect}`} replace />;
  }
  return <Outlet />;
}
