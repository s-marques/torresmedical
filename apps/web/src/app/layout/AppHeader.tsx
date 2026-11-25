import { LogOut, Monitor, Moon, Search, Sun } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AvatarUsuario } from '@/components/shared/AvatarUsuario';
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
import { MenuAlertas } from '@/features/painel/alertas/MenuAlertas';
import { useAtualizarPreferencias } from '@/hooks/use-atualizar-preferencias';
import { THEME_PARA_TEMA } from '@/lib/aparencia';
import { usePermissao } from '@/lib/auth/use-sessao';
import { useTheme, type Theme } from '@/lib/theme';
import { cn } from '@/lib/utils';
import { useApiHealth, type ApiHealthStatus } from '../use-api-health';
import { useSair, useUsuarioExibido } from './use-usuario-logado';

export interface AppHeaderProps {
  onOpenSearch: () => void;
}

/** Cabeçalho: menu, busca (⌘K), saúde da API, tema, notificações e menu do usuário. */
export function AppHeader({ onOpenSearch }: Readonly<AppHeaderProps>) {
  const { t } = useTranslation();
  return (
    <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur">
      <SidebarTrigger className="-ml-1" />
      <Button
        variant="outline"
        aria-label={t('layout.buscarTelas')}
        className="h-9 justify-start gap-2 px-3 text-muted-foreground sm:w-full sm:max-w-64"
        onClick={onOpenSearch}
      >
        <Search aria-hidden />
        <span className="hidden flex-1 text-left sm:inline">{t('layout.buscar')}</span>
        <kbd className="pointer-events-none hidden rounded border bg-muted px-1.5 text-[0.7rem] font-medium sm:inline">
          ⌘K
        </kbd>
      </Button>

      <div className="ml-auto flex items-center gap-1">
        <ApiStatus />
        <ThemeMenu />
        <MenuAlertas />
        <UserMenu />
      </div>
    </header>
  );
}

const API_STATUS: Record<ApiHealthStatus, { chave: string; cor: string }> = {
  checking: { chave: 'layout.apiVerificando', cor: 'bg-muted-foreground' },
  online: { chave: 'layout.apiOnline', cor: 'bg-primary' },
  offline: { chave: 'layout.apiOffline', cor: 'bg-destructive' },
};

function ApiStatus() {
  const { t } = useTranslation();
  const { chave, cor } = API_STATUS[useApiHealth()];
  const rotulo = t(chave);
  return (
    <span role="status" title={rotulo} className="flex size-9 items-center justify-center">
      <span aria-hidden className={cn('size-2.5 rounded-full', cor)} />
      <span className="sr-only">{rotulo}</span>
    </span>
  );
}

const TEMAS: { valor: Theme; Icone: typeof Sun }[] = [
  { valor: 'light', Icone: Sun },
  { valor: 'dark', Icone: Moon },
  { valor: 'system', Icone: Monitor },
];

/**
 * Atalho do tema. Com `configuracoes.editar`, grava na preferência do usuário (a mesma da aba
 * Aparência); sem ela, vale só neste navegador.
 */
function ThemeMenu() {
  const { t } = useTranslation();
  const { theme, resolvedTheme, setTheme } = useTheme();
  const podeGravar = usePermissao('configuracoes-gestao.configuracoes.editar');
  const atualizar = useAtualizarPreferencias();
  const IconeAtual = resolvedTheme === 'dark' ? Moon : Sun;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t('layout.tema')}>
          <IconeAtual aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{t('layout.tema')}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={theme}
          onValueChange={(valor) => {
            const escolhido = TEMAS.find((tema) => tema.valor === valor);
            if (!escolhido) return;
            setTheme(escolhido.valor);
            if (podeGravar) atualizar.mutate({ tema: THEME_PARA_TEMA[escolhido.valor] });
          }}
        >
          {TEMAS.map(({ valor, Icone }) => (
            <DropdownMenuRadioItem key={valor} value={valor}>
              <Icone aria-hidden />
              {t(`temas.${THEME_PARA_TEMA[valor]}`)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function UserMenu() {
  const { t } = useTranslation();
  const usuario = useUsuarioExibido();
  const sair = useSair();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="rounded-full"
          aria-label={t('layout.menuUsuario')}
        >
          <AvatarUsuario
            nome={usuario.nome}
            arquivoId={usuario.avatarArquivoId}
            classNameIniciais="text-xs"
          />
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
          {t('layout.sair')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
