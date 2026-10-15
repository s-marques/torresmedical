import { filtrarMenu, MENU } from '@torres/shared';
import { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { ICONES_TELA } from './menu-icones';

export interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Mesmas permissões do menu: só aparecem as telas permitidas. */
  permissoes?: readonly string[];
}

/** Busca de telas (⌘K / Ctrl+K): filtra pelo nome e navega para a tela escolhida. */
export function CommandPalette({ open, onOpenChange, permissoes }: Readonly<CommandPaletteProps>) {
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
      title="Buscar tela"
      description="Digite o nome da tela para navegar até ela"
    >
      <CommandInput placeholder="Buscar tela…" />
      <CommandList>
        <CommandEmpty>Nenhuma tela encontrada.</CommandEmpty>
        {menu.map((modulo) => (
          <CommandGroup key={modulo.id} heading={modulo.nome}>
            {modulo.telas.map((tela) => {
              const Icone = ICONES_TELA[tela.id];
              return (
                <CommandItem
                  key={tela.id}
                  value={`${tela.nome} ${modulo.nome}`}
                  onSelect={() => {
                    onOpenChange(false);
                    void navigate(tela.rota);
                  }}
                >
                  <Icone aria-hidden />
                  {tela.nome}
                </CommandItem>
              );
            })}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  );
}
