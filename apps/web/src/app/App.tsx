import { useState } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { AppProviders } from './providers/AppProviders';
import { ROTAS } from './routes';

export function App() {
  const [router] = useState(() => createBrowserRouter(ROTAS));

  return (
    <AppProviders onUnauthorized={() => void router.navigate('/login')}>
      <RouterProvider router={router} />
    </AppProviders>
  );
}
