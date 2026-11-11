import type { LookupItem } from '@torres/shared';
import { Chip, PontoCanal } from './Chip';

export interface ChipsCanalProps {
  canais: readonly LookupItem[];
  /** Id do canal escolhido; `undefined` é "Todos". */
  canalId?: string;
  onChange: (canalId?: string) => void;
}

/** Filtro "Canal:" do topo da tela: Todos e cada canal com o número. */
export function ChipsCanal({ canais, canalId, onChange }: Readonly<ChipsCanalProps>) {
  return (
    <div
      role="group"
      aria-labelledby="whatsapp-canal"
      className="flex flex-wrap items-center gap-2"
    >
      <span id="whatsapp-canal" className="text-sm font-medium">
        Canal:
      </span>
      <Chip ativo={!canalId} onClick={() => onChange(undefined)}>
        Todos
      </Chip>
      {canais.map((canal) => (
        <Chip key={canal.id} ativo={canalId === canal.id} onClick={() => onChange(canal.id)}>
          <PontoCanal />
          {canal.descricao ? `${canal.label} (${canal.descricao})` : canal.label}
        </Chip>
      ))}
    </div>
  );
}
