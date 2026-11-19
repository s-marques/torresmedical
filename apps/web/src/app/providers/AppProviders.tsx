import { QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { createQueryClient } from '@/lib/api/query-client';
import '@/lib/i18n';
import { SincronizarPreferencias } from './SincronizarPreferencias';
import { ThemeProvider } from './ThemeProvider';

export interface AppProvidersProps {
  /** O que fazer no 401 da API: ir para o login. */
  onUnauthorized: () => void;
  children: ReactNode;
}

/**
 * Tema e preferências de aparência/idioma, TanStack Query (com o tratamento de erros da API),
 * tooltips e toasts.
 */
export function AppProviders({ onUnauthorized, children }: Readonly<AppProvidersProps>) {
  const [queryClient] = useState(() => createQueryClient({ onUnauthorized }));

  return (
    <ThemeProvider>
      <SincronizarPreferencias />
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>{children}</TooltipProvider>
        <Toaster richColors closeButton />
      </QueryClientProvider>
    </ThemeProvider>
  );
}
