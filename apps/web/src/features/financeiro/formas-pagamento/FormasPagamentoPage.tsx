import { CreditCardIcon, FlagIcon, PercentIcon, PlusIcon, type LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { PageHeader } from '@/components/shared/PageHeader';
import { SePermitido } from '@/components/shared/SePermitido';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { AbaBandeiras } from './AbaBandeiras';
import { AbaFormasPagamento } from './AbaFormasPagamento';
import { AbaTaxas } from './AbaTaxas';

type IdAba = 'formas' | 'bandeiras' | 'taxas';

const ABAS: readonly { id: IdAba; rotulo: string; icone: LucideIcon }[] = [
  { id: 'formas', rotulo: 'Formas de Pagamento', icone: CreditCardIcon },
  { id: 'bandeiras', rotulo: 'Bandeiras', icone: FlagIcon },
  { id: 'taxas', rotulo: 'Taxas por Bandeira', icone: PercentIcon },
];

/**
 * Formas de Pagamento (`/formas-pgto`,
 * docs/inventario/telas/financeiro-formas-de-pagamento.md): formas de pagamento, bandeiras e
 * taxas de cartão, em três abas.
 */
export default function FormasPagamentoPage() {
  const [aba, setAba] = useState<IdAba>('formas');
  const [criando, setCriando] = useState(false);

  return (
    <div className="grid gap-6">
      <PageHeader
        titulo="Formas de Pagamento"
        descricao="Gerencie formas de pagamento, bandeiras e taxas de cartão."
        acoes={
          aba === 'formas' && (
            <SePermitido permissao="financeiro.formas-pagamento.criar">
              <Button type="button" onClick={() => setCriando(true)}>
                <PlusIcon aria-hidden />
                Nova Forma de Pagamento
              </Button>
            </SePermitido>
          )
        }
      />
      <div
        role="tablist"
        aria-label="Seções de Formas de Pagamento"
        className="flex w-fit gap-1 rounded-lg bg-muted p-1"
      >
        {ABAS.map(({ id, rotulo, icone: Icone }) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`aba-${id}`}
            aria-selected={aba === id}
            aria-controls="painel-aba"
            className={cn(
              'flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              aba === id
                ? 'bg-background text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground',
            )}
            onClick={() => setAba(id)}
          >
            <Icone aria-hidden className="size-4" />
            {rotulo}
          </button>
        ))}
      </div>
      <div id="painel-aba" role="tabpanel" aria-labelledby={`aba-${aba}`}>
        {aba === 'formas' && (
          <AbaFormasPagamento criando={criando} onFecharCriar={() => setCriando(false)} />
        )}
        {aba === 'bandeiras' && <AbaBandeiras />}
        {aba === 'taxas' && <AbaTaxas />}
      </div>
    </div>
  );
}
