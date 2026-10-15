import { useState } from 'react';
import { Outlet } from 'react-router';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { AppHeader } from './AppHeader';
import { AppSidebar } from './AppSidebar';
import { CommandPalette } from './CommandPalette';

/** Layout das telas autenticadas: menu lateral, cabeçalho e a página da rota. */
export function AppLayout() {
  const [buscaAberta, setBuscaAberta] = useState(false);

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <AppHeader onOpenSearch={() => setBuscaAberta(true)} />
        <div className="flex-1 p-4 md:p-6">
          <Outlet />
        </div>
      </SidebarInset>
      <CommandPalette open={buscaAberta} onOpenChange={setBuscaAberta} />
    </SidebarProvider>
  );
}
