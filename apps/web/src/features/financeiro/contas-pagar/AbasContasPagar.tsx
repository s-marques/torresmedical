import { BanknoteIcon, LayersIcon, ScaleIcon, type LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

export type IdAbaContasPagar = 'contas' | 'divergencias' | 'centros-custo';

const ABAS: readonly { id: IdAbaContasPagar; chave: string; icone: LucideIcon }[] = [
  { id: 'contas', chave: 'contasPagar.abas.contas', icone: BanknoteIcon },
  { id: 'divergencias', chave: 'contasPagar.abas.divergencias', icone: ScaleIcon },
  { id: 'centros-custo', chave: 'contasPagar.abas.centrosCusto', icone: LayersIcon },
];

export interface AbasContasPagarProps {
  aba: IdAbaContasPagar;
  onAba: (aba: IdAbaContasPagar) => void;
}

/** Abas de Contas a Pagar: lista de contas, relatório de divergências e centros de custo. */
export function AbasContasPagar({ aba, onAba }: Readonly<AbasContasPagarProps>) {
  const { t } = useTranslation();
  return (
    <div
      role="tablist"
      aria-label={t('contasPagar.abas.rotulo')}
      className="flex w-fit gap-1 rounded-lg bg-muted p-1"
    >
      {ABAS.map(({ id, chave, icone: Icone }) => (
        <button
          key={id}
          type="button"
          role="tab"
          id={`aba-${id}`}
          aria-selected={aba === id}
          aria-controls="painel-aba-contas-pagar"
          className={cn(
            'flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
            aba === id
              ? 'bg-background text-foreground shadow-xs'
              : 'text-muted-foreground hover:text-foreground',
          )}
          onClick={() => onAba(id)}
        >
          <Icone aria-hidden className="size-4" />
          {t(chave)}
        </button>
      ))}
    </div>
  );
}
