import { TELAS } from '@torres/shared';
import type { RouteObject } from 'react-router';
import { AppLayout } from './layout/AppLayout';
import { RotaProtegida } from './layout/RotaProtegida';
import { EsqueciSenhaPage } from './pages/auth/EsqueciSenhaPage';
import { LoginPage } from './pages/auth/LoginPage';
import { RedefinirSenhaPage } from './pages/auth/RedefinirSenhaPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { PageErrorPage } from './pages/PageErrorPage';
import { PaginaDaTela } from './pages/PaginaDaTela';

/**
 * Rotas da aplicação: login e senha fora do layout; as 70 telas do inventário (mesmas URLs do
 * sistema atual) dentro dele, só com sessão (`RotaProtegida`). O `errorElement` da rota sem
 * caminho é o error boundary das páginas: o erro aparece no lugar da página, com o menu visível.
 */
export const ROTAS: RouteObject[] = [
  { path: '/login', element: <LoginPage />, errorElement: <PageErrorPage /> },
  { path: '/esqueci-senha', element: <EsqueciSenhaPage />, errorElement: <PageErrorPage /> },
  { path: '/redefinir-senha', element: <RedefinirSenhaPage />, errorElement: <PageErrorPage /> },
  {
    element: <RotaProtegida />,
    errorElement: <PageErrorPage />,
    children: [
      {
        element: <AppLayout />,
        children: [
          {
            errorElement: <PageErrorPage />,
            children: [
              ...TELAS.map((tela) => ({ path: tela.rota, element: <PaginaDaTela tela={tela} /> })),
              { path: '*', element: <NotFoundPage /> },
            ],
          },
        ],
      },
    ],
  },
];
