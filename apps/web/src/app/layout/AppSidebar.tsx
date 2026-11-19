import { encontrarTelaPorRota, filtrarMenu, MENU, type ModuloId } from '@torres/shared';
import { ChevronRight, LogOut } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router';
import { AvatarUsuario } from '@/components/shared/AvatarUsuario';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from '@/components/ui/sidebar';
import { nomeModulo, nomeTela } from '@/lib/i18n';
import { ICONES_TELA } from './menu-icones';
import { useSair, useUsuarioExibido } from './use-usuario-logado';

export interface AppSidebarProps {
  /** Permissões do usuário: o menu mostra só as telas com `<tela>.ver`. Sem lista, mostra todas. */
  permissoes?: readonly string[];
}

/**
 * Menu lateral na ordem do inventário. Acordeão: um módulo aberto por vez, que acompanha a
 * rota atual. Recolhível no desktop e em drawer no mobile.
 */
export function AppSidebar({ permissoes }: Readonly<AppSidebarProps>) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const { isMobile, setOpenMobile } = useSidebar();
  const usuario = useUsuarioExibido();
  const sair = useSair();
  const menu = useMemo(() => filtrarMenu(MENU, permissoes), [permissoes]);

  const moduloDaRota = encontrarTelaPorRota(pathname)?.modulo ?? null;
  const [aberto, setAberto] = useState<ModuloId | null>(moduloDaRota);
  const [moduloAnterior, setModuloAnterior] = useState(moduloDaRota);
  // Ao navegar para outro módulo, ele abre e os demais fecham.
  if (moduloDaRota !== moduloAnterior) {
    setModuloAnterior(moduloDaRota);
    if (moduloDaRota) setAberto(moduloDaRota);
  }

  const moduloAtual = MENU.find((modulo) => modulo.id === moduloDaRota);

  return (
    <Sidebar aria-label={t('layout.menuPrincipal')}>
      <SidebarHeader className="border-b border-sidebar-border">
        <Link to="/" className="flex items-center gap-2 rounded-md p-2">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-sidebar-primary text-sm font-bold text-sidebar-primary-foreground">
            TM
          </span>
          <span className="grid leading-tight">
            <span className="text-sm font-semibold uppercase">Torres Medical</span>
            <span className="text-xs text-sidebar-foreground/60 uppercase">
              {moduloAtual ? nomeModulo(t, moduloAtual) : t('layout.gestao')}
            </span>
          </span>
        </Link>
      </SidebarHeader>

      <SidebarContent className="gap-0 py-2">
        {menu.map((modulo) => (
          <Collapsible
            key={modulo.id}
            open={aberto === modulo.id}
            onOpenChange={(abrir) => setAberto(abrir ? modulo.id : null)}
            className="group/modulo"
          >
            <SidebarGroup className="py-0">
              <SidebarGroupLabel
                asChild
                className="h-9 text-[0.7rem] font-bold tracking-wider text-sidebar-foreground uppercase hover:bg-sidebar-accent"
              >
                <CollapsibleTrigger>
                  {nomeModulo(t, modulo)}
                  <ChevronRight
                    aria-hidden
                    className="ml-auto transition-transform group-data-[state=open]/modulo:rotate-90"
                  />
                </CollapsibleTrigger>
              </SidebarGroupLabel>
              <CollapsibleContent>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {modulo.telas.map((tela) => {
                      const Icone = ICONES_TELA[tela.id];
                      const ativa = pathname === tela.rota;
                      return (
                        <SidebarMenuItem key={tela.id}>
                          <SidebarMenuButton
                            asChild
                            isActive={ativa}
                            className="data-[active=true]:text-sidebar-primary"
                          >
                            <Link
                              to={tela.rota}
                              aria-current={ativa ? 'page' : undefined}
                              onClick={() => {
                                if (isMobile) setOpenMobile(false);
                              }}
                            >
                              <Icone aria-hidden />
                              <span>{nomeTela(t, tela)}</span>
                            </Link>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      );
                    })}
                  </SidebarMenu>
                </SidebarGroupContent>
              </CollapsibleContent>
            </SidebarGroup>
          </Collapsible>
        ))}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">
        <div className="flex items-center gap-2 p-1">
          <AvatarUsuario
            nome={usuario.nome}
            arquivoId={usuario.avatarArquivoId}
            classNameIniciais="bg-sidebar-primary text-xs font-normal text-sidebar-primary-foreground"
          />
          <span className="grid min-w-0 flex-1 leading-tight">
            <span className="truncate text-sm font-medium">{usuario.nome}</span>
            <span className="truncate text-xs text-sidebar-foreground/60">{usuario.perfil}</span>
          </span>
          <button
            type="button"
            aria-label={t('layout.sair')}
            onClick={sair}
            className="rounded-md p-2 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            <LogOut className="size-4" aria-hidden />
          </button>
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
