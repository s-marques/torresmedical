import { filtrarMenu, MENU, type TipoBusca } from '@torres/shared';
import {
  FileSignature,
  Handshake,
  Stethoscope,
  Truck,
  UserRound,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
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
import { useBuscaGlobal } from '@/features/painel/busca/use-busca-global';
import { nomeModulo, nomeTela } from '@/lib/i18n';
import { ICONES_TELA } from './menu-icones';

export interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Mesmas permissões do menu: só aparecem as telas permitidas. */
  permissoes?: readonly string[];
}

const ICONES_BUSCA: Readonly<Record<TipoBusca, LucideIcon>> = {
  PACIENTE: UserRound,
  PROFISSIONAL: Stethoscope,
  CONTRATO: FileSignature,
  FORNECEDOR: Truck,
  LEAD: Handshake,
};

/**
 * Busca global (⌘K / Ctrl+K): filtra as telas pelo nome e, a partir de 2 caracteres, busca
 * pacientes, profissionais, contratos, fornecedores e leads (nome, CPF/CNPJ, telefone, CRM, nº do
 * contrato). A API só devolve o que o usuário pode ver. Escolher um item navega para a tela.
 */
export function CommandPalette({ open, onOpenChange, permissoes }: Readonly<CommandPaletteProps>) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const menu = useMemo(() => filtrarMenu(MENU, permissoes), [permissoes]);
  const [termo, setTermo] = useState('');
  const { grupos, buscando } = useBuscaGlobal(termo, open);

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

  // O termo não sobra para a próxima abertura, seja qual for o jeito de fechar.
  const [abertoAntes, setAbertoAntes] = useState(open);
  if (open !== abertoAntes) {
    setAbertoAntes(open);
    if (!open) setTermo('');
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('layout.buscarTela')}
      description={t('layout.buscarTelaDescricao')}
    >
      <CommandInput
        placeholder={t('layout.buscarTelaPlaceholder')}
        value={termo}
        onValueChange={setTermo}
      />
      <CommandList>
        <CommandEmpty>{buscando ? t('layout.buscando') : t('layout.nenhumaTela')}</CommandEmpty>
        {grupos.map((grupo) => {
          const Icone = ICONES_BUSCA[grupo.tipo];
          return (
            <CommandGroup
              key={grupo.tipo}
              forceMount
              heading={t(`layout.buscaTipos.${grupo.tipo}`)}
            >
              {grupo.itens.map((item) => (
                <CommandItem
                  key={item.id}
                  forceMount
                  value={`${grupo.tipo}:${item.id}`}
                  onSelect={() => {
                    onOpenChange(false);
                    void navigate(item.rota);
                  }}
                >
                  <Icone aria-hidden />
                  <span>{item.titulo}</span>
                  {item.descricao ? (
                    <span className="ml-auto text-xs text-muted-foreground">{item.descricao}</span>
                  ) : null}
                </CommandItem>
              ))}
            </CommandGroup>
          );
        })}
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
