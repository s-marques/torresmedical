import type { LookupEntidade, LookupItem } from '@torres/shared';
import { CheckIcon, ChevronsUpDownIcon, XIcon } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useDebounce } from '@/hooks/use-debounce';
import { useItemLookup, useLookup, type FiltrosLookup } from '@/lib/api/lookups';
import { cn } from '@/lib/utils';

/** Atraso da busca ao digitar, para não consultar a API a cada tecla. */
export const ENTITY_SELECT_DEBOUNCE_MS = 300;

const VALOR_LIMPAR = '__limpar__';

export interface EntitySelectProps {
  /** Lookup consultado: `GET /api/lookups/<entidade>`. */
  entidade: LookupEntidade;
  /** Id selecionado (controlado). */
  value: string | null | undefined;
  onChange: (id: string | null, item: LookupItem | null) => void;
  /** Filtros extras do lookup, ex.: `{ finalidade: 'receber' }`. */
  filtros?: FiltrosLookup;
  placeholder?: string;
  placeholderBusca?: string;
  disabled?: boolean;
  /** Mostra a opção "Limpar seleção". Padrão: `true`. */
  permitirLimpar?: boolean;
  id?: string;
  className?: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
}

/**
 * Combobox com busca na API para as entidades compartilhadas (pacientes, profissionais,
 * produtos…). Controlado (`value`/`onChange`), para usar com o `Controller` do React Hook Form.
 * Exibe o rótulo do valor atual mesmo que ele não esteja na primeira página (`/:id`).
 */
export function EntitySelect({
  entidade,
  value,
  onChange,
  filtros,
  placeholder = 'Selecione',
  placeholderBusca = 'Buscar…',
  disabled = false,
  permitirLimpar = true,
  id,
  className,
  ...aria
}: Readonly<EntitySelectProps>) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState('');
  const [escolhido, setEscolhido] = useState<LookupItem | null>(null);
  const buscaAtrasada = useDebounce(busca.trim(), ENTITY_SELECT_DEBOUNCE_MS);

  const opcoes = useLookup(entidade, buscaAtrasada, { filtros, ativo: aberto });
  // O item escolhido aqui já tem o rótulo; um valor vindo de fora é buscado pelo id.
  const conhecido = escolhido?.id === value ? escolhido : null;
  const atual = useItemLookup(entidade, conhecido ? null : value);
  const selecionado = value ? (conhecido ?? atual.data ?? null) : null;

  function abrirOuFechar(novo: boolean) {
    setAberto(novo);
    if (!novo) setBusca('');
  }

  function selecionar(item: LookupItem | null) {
    setEscolhido(item);
    onChange(item?.id ?? null, item);
    abrirOuFechar(false);
  }

  const itens = opcoes.data?.data ?? [];
  const total = opcoes.data?.meta.total ?? 0;

  return (
    <Popover open={aberto} onOpenChange={abrirOuFechar}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={aberto}
          disabled={disabled}
          className={cn('w-full justify-between font-normal', className)}
          {...aria}
        >
          <span className={cn('truncate', !selecionado && 'text-muted-foreground')}>
            {rotuloDoValor(value, selecionado, atual.isError, placeholder)}
          </span>
          <ChevronsUpDownIcon className="opacity-50" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) min-w-64 p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder={placeholderBusca} value={busca} onValueChange={setBusca} />
          <CommandList aria-busy={opcoes.isFetching}>
            <EstadoDaLista
              carregando={opcoes.isPending}
              erro={opcoes.isError}
              vazio={opcoes.isSuccess && itens.length === 0}
            />
            {value && permitirLimpar && (
              <CommandGroup>
                <CommandItem value={VALOR_LIMPAR} onSelect={() => selecionar(null)}>
                  <XIcon aria-hidden="true" />
                  Limpar seleção
                </CommandItem>
              </CommandGroup>
            )}
            {itens.length > 0 && (
              <CommandGroup>
                {itens.map((item) => (
                  <CommandItem key={item.id} value={item.id} onSelect={() => selecionar(item)}>
                    <CheckIcon
                      aria-hidden="true"
                      className={cn(item.id === value ? 'opacity-100' : 'opacity-0')}
                    />
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate">{item.label}</span>
                      {item.descricao && (
                        <span className="truncate text-xs text-muted-foreground">
                          {item.descricao}
                        </span>
                      )}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {total > itens.length && (
              <p className="px-3 py-2 text-xs text-muted-foreground" role="status">
                Mostrando {itens.length} de {total}. Refine a busca para encontrar outros.
              </p>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function rotuloDoValor(
  value: string | null | undefined,
  selecionado: LookupItem | null,
  erro: boolean,
  placeholder: string,
): string {
  if (selecionado) return selecionado.label;
  if (!value) return placeholder;
  return erro ? 'Registro indisponível' : 'Carregando…';
}

function EstadoDaLista({
  carregando,
  erro,
  vazio,
}: Readonly<{ carregando: boolean; erro: boolean; vazio: boolean }>) {
  if (erro) {
    return (
      <p className="px-3 py-6 text-center text-sm text-destructive" role="alert">
        Não foi possível carregar as opções.
      </p>
    );
  }
  if (carregando) {
    return (
      <p className="px-3 py-6 text-center text-sm text-muted-foreground" role="status">
        Carregando…
      </p>
    );
  }
  if (!vazio) return null;
  return (
    <p className="px-3 py-6 text-center text-sm text-muted-foreground" role="status">
      Nenhum resultado encontrado.
    </p>
  );
}
