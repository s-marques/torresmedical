import { Bell, LogOut, Monitor, Moon, Search, Sun } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { cn } from '@/lib/utils';
import { useTheme, type Theme } from '@/lib/theme';
import { useApiHealth, type ApiHealthStatus } from '../use-api-health';
import { useSair, useUsuarioExibido } from './use-usuario-logado';

export interface AppHeaderProps {
  onOpenSearch: () => void;
}

/** Cabeçalho: menu, busca (⌘K), saúde da API, tema, notificações e menu do usuário. */
export function AppHeader({ onOpenSearch }: Readonly<AppHeaderProps>) {
  return (
    <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur">
      <SidebarTrigger className="-ml-1" />
      <Button
        variant="outline"
        aria-label="Buscar telas"
        className="h-9 justify-start gap-2 px-3 text-muted-foreground sm:w-full sm:max-w-64"
        onClick={onOpenSearch}
      >
        <Search aria-hidden />
        <span className="hidden flex-1 text-left sm:inline">Buscar…</span>
        <kbd className="pointer-events-none hidden rounded border bg-muted px-1.5 text-[0.7rem] font-medium sm:inline">
          ⌘K
        </kbd>
      </Button>

      <div className="ml-auto flex items-center gap-1">
        <ApiStatus />
        <ThemeMenu />
        <NotificationsMenu />
        <UserMenu />
      </div>
    </header>
  );
}

const API_STATUS: Record<ApiHealthStatus, { rotulo: string; cor: string }> = {
  checking: { rotulo: 'API: verificando…', cor: 'bg-muted-foreground' },
  online: { rotulo: 'API: online', cor: 'bg-primary' },
  offline: { rotulo: 'API: indisponível', cor: 'bg-destructive' },
};

function ApiStatus() {
  const { rotulo, cor } = API_STATUS[useApiHealth()];
  return (
    <span role="status" title={rotulo} className="flex size-9 items-center justify-center">
      <span aria-hidden className={cn('size-2.5 rounded-full', cor)} />
      <span className="sr-only">{rotulo}</span>
    </span>
  );
}

const TEMAS: { valor: Theme; rotulo: string; Icone: typeof Sun }[] = [
  { valor: 'light', rotulo: 'Claro', Icone: Sun },
  { valor: 'dark', rotulo: 'Escuro', Icone: Moon },
  { valor: 'system', rotulo: 'Sistema', Icone: Monitor },
];

function ThemeMenu() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const IconeAtual = resolvedTheme === 'dark' ? Moon : Sun;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Tema">
          <IconeAtual aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Tema</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={theme}
          onValueChange={(valor) => {
            const escolhido = TEMAS.find((tema) => tema.valor === valor);
            if (escolhido) setTheme(escolhido.valor);
          }}
        >
          {TEMAS.map(({ valor, rotulo, Icone }) => (
            <DropdownMenuRadioItem key={valor} value={valor}>
              <Icone aria-hidden />
              {rotulo}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function NotificationsMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Notificações">
          <Bell aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel>Notificações</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <p className="px-2 py-6 text-center text-sm text-muted-foreground">Nenhuma notificação</p>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function UserMenu() {
  const usuario = useUsuarioExibido();
  const sair = useSair();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="rounded-full" aria-label="Menu do usuário">
          <Avatar className="size-8">
            <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
              {usuario.iniciais}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="grid">
          <span>{usuario.nome}</span>
          <span className="text-xs font-normal text-muted-foreground">{usuario.perfil}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={sair}>
          <LogOut aria-hidden />
          Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
