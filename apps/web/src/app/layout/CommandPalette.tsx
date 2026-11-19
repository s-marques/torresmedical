import { filtrarMenu, MENU } from '@torres/shared';
import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { nomeModulo, nomeTela } from '@/lib/i18n';
import { ICONES_TELA } from './menu-icones';

export interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Mesmas permissões do menu: só aparecem as telas permitidas. */
  permissoes?: readonly string[];
}

/** Busca de telas (⌘K / Ctrl+K): filtra pelo nome e navega para a tela escolhida. */
export function CommandPalette({ open, onOpenChange, permissoes }: Readonly<CommandPaletteProps>) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const menu = useMemo(() => filtrarMenu(MENU, permissoes), [permissoes]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        onOpenChange(!open);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onOpenChange]);

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('layout.buscarTela')}
      description={t('layout.buscarTelaDescricao')}
    >
      <CommandInput placeholder={t('layout.buscarTelaPlaceholder')} />
      <CommandList>
        <CommandEmpty>{t('layout.nenhumaTela')}</CommandEmpty>
        {menu.map((modulo) => (
          <CommandGroup key={modulo.id} heading={nomeModulo(t, modulo)}>
            {modulo.telas.map((tela) => {
              const Icone = ICONES_TELA[tela.id];
              const nome = nomeTela(t, tela);
              return (
                <CommandItem
                  key={tela.id}
                  value={`${nome} ${nomeModulo(t, modulo)}`}
                  onSelect={() => {
                    onOpenChange(false);
                    void navigate(tela.rota);
                  }}
                >
                  <Icone aria-hidden />
                  {nome}
                </CommandItem>
              );
            })}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  );
}
