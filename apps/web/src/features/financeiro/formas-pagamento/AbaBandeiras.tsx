import type { Bandeira } from '@torres/shared';
import { FlagIcon, PlusIcon } from 'lucide-react';
import { useState } from 'react';
import { EmptyState } from '@/components/shared/EmptyState';
import { SePermitido } from '@/components/shared/SePermitido';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ModalBandeira } from './ModalBandeira';
import { useBandeiras } from './use-bandeiras';

function CardBandeira({ bandeira }: Readonly<{ bandeira: Bandeira }>) {
  return (
    <li className="flex items-center gap-3 rounded-xl border bg-card p-4 text-card-foreground shadow-xs">
      <span
        aria-hidden
        className="flex size-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
      >
        <FlagIcon className="size-4" />
      </span>
      <div className="min-w-0">
        <h2 className="truncate text-sm font-medium">{bandeira.nome}</h2>
        <code className="text-xs text-muted-foreground">{bandeira.icone}</code>
      </div>
    </li>
  );
}

/** Aba "Bandeiras": cadastro das bandeiras de cartão (Visa, Mastercard, Elo...). */
export function AbaBandeiras() {
  const [criando, setCriando] = useState(false);
  const bandeiras = useBandeiras();

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Cadastre as bandeiras (Visa, Mastercard, Elo...). As taxas são configuradas na aba
          &quot;Taxas por Bandeira&quot;.
        </p>
        <SePermitido permissao="financeiro.formas-pagamento.criar">
          <Button type="button" onClick={() => setCriando(true)}>
            <PlusIcon aria-hidden />
            Nova Bandeira
          </Button>
        </SePermitido>
      </div>
      {bandeiras.isPending && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-busy>
          {[1, 2, 3].map((n) => (
            <Skeleton key={n} className="h-16 rounded-xl" />
          ))}
        </div>
      )}
      {bandeiras.isError && (
        <EmptyState
          titulo="Não foi possível carregar as bandeiras."
          acao={
            <Button type="button" variant="outline" onClick={() => void bandeiras.refetch()}>
              Tentar de novo
            </Button>
          }
        />
      )}
      {bandeiras.data?.data.length === 0 && (
        <div className="rounded-xl border">
          <EmptyState
            icone={FlagIcon}
            titulo="Nenhuma bandeira cadastrada"
            descricao="Cadastre Visa, Mastercard, Elo, etc."
          />
        </div>
      )}
      {bandeiras.data && bandeiras.data.data.length > 0 && (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {bandeiras.data.data.map((bandeira) => (
            <CardBandeira key={bandeira.id} bandeira={bandeira} />
          ))}
        </ul>
      )}
      {criando && <ModalBandeira onFechar={() => setCriando(false)} />}
    </div>
  );
}
