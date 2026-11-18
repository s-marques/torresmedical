import type { LookupEntidade } from '@torres/shared';
import { XIcon } from 'lucide-react';
import { useState } from 'react';
import type { FiltrosLookup } from '@/lib/api/lookups';
import { Badge } from '@/components/ui/badge';
import { EntitySelect } from './EntitySelect';

/** Item já selecionado, com o rótulo para o chip. */
export interface ItemSelecionado {
  id: string;
  nome: string;
}

export interface EntityMultiSelectProps {
  /** Lookup consultado: `GET /api/lookups/<entidade>`. */
  entidade: LookupEntidade;
  /** Ids selecionados (controlado). */
  value: readonly string[];
  onChange: (ids: string[]) => void;
  /** Rótulos dos já selecionados (ex.: edição), para os chips sem consultar de novo. */
  iniciais?: readonly ItemSelecionado[];
  filtros?: FiltrosLookup;
  /** Texto do combobox de busca. */
  placeholder?: string;
  /** Texto quando nada foi selecionado. */
  vazio?: string;
  disabled?: boolean;
  id?: string;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
}

/**
 * Seleção de várias entidades: o combobox (`EntitySelect`) acrescenta um item e cada item vira
 * um chip com "x" para remover. Controlado, para usar com o `FormField` (`tipo="entidades"`).
 */
export function EntityMultiSelect({
  entidade,
  value,
  onChange,
  iniciais = [],
  filtros,
  placeholder = 'Adicionar',
  vazio = 'Nenhum item selecionado.',
  disabled,
  ...aria
}: Readonly<EntityMultiSelectProps>) {
  const [rotulos, setRotulos] = useState<ReadonlyMap<string, string>>(
    () => new Map(iniciais.map((item) => [item.id, item.nome])),
  );

  return (
    <div className="grid gap-2">
      <EntitySelect
        entidade={entidade}
        filtros={filtros}
        value={null}
        permitirLimpar={false}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(novoId, item) => {
          if (!novoId || value.includes(novoId)) return;
          if (item) setRotulos((atual) => new Map(atual).set(novoId, item.label));
          onChange([...value, novoId]);
        }}
        {...aria}
      />
      {value.length === 0 ? (
        <p className="text-sm text-muted-foreground">{vazio}</p>
      ) : (
        <ul className="flex flex-wrap gap-2" aria-label="Selecionados">
          {value.map((id) => {
            const rotulo = rotulos.get(id) ?? id;
            return (
              <li key={id}>
                <Badge variant="secondary" className="gap-1 pr-1">
                  {rotulo}
                  <button
                    type="button"
                    className="rounded-sm p-0.5 hover:bg-muted-foreground/20 disabled:opacity-50"
                    aria-label={`Remover ${rotulo}`}
                    disabled={disabled}
                    onClick={() => onChange(value.filter((atual) => atual !== id))}
                  >
                    <XIcon className="size-3" aria-hidden />
                  </button>
                </Badge>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
