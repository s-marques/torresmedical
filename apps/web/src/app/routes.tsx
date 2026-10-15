import { TELAS } from '@torres/shared';
import type { RouteObject } from 'react-router';
import { AppLayout } from './layout/AppLayout';
import { LoginPage } from './pages/LoginPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { PageErrorPage } from './pages/PageErrorPage';
import { PaginaDaTela } from './pages/PaginaDaTela';

/**
 * Rotas da aplicação: o login fora do layout e as 70 telas do inventário (mesmas URLs do
 * sistema atual) dentro dele. O `errorElement` da rota sem caminho é o error boundary das
 * páginas: o erro aparece no lugar da página, com o menu visível.
 */
export const ROTAS: RouteObject[] = [
  { path: '/login', element: <LoginPage />, errorElement: <PageErrorPage /> },
  {
    element: <AppLayout />,
    errorElement: <PageErrorPage />,
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
];
