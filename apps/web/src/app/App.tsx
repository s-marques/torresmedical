import { useState } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { encerrarSessaoLocal } from '@/lib/auth/sessao';
import { AppProviders } from './providers/AppProviders';
import { ROTAS } from './routes';

export function App() {
  const [router] = useState(() => createBrowserRouter(ROTAS));

  return (
    // 401 que a renovação não resolveu: sem sessão, a RotaProtegida leva ao login.
    <AppProviders onUnauthorized={encerrarSessaoLocal}>
      <RouterProvider router={router} />
    </AppProviders>
  );
}
