import { ABAS_PAINEL } from '@torres/shared';
import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { PageHeader } from '@/components/shared/PageHeader';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { SecaoPainelView } from './BlocosPainel';
import {
  filtrosDaUrl,
  filtrosParaApi,
  filtrosParaUrl,
  ROTULOS_ABA,
  type FiltrosAplicados,
} from './filtros-painel';
import { FiltrosPainel } from './FiltrosPainel';
import { useDashboard } from './use-dashboard';

/**
 * Painel (`/`, docs/inventario/telas/painel-painel.md): dashboard com 5 abas e os filtros de
 * período. Aba e filtros ficam na URL; os dados vêm de `GET /api/painel/dashboard/:aba`.
 */
export default function PainelPage() {
  const [params, setParams] = useSearchParams();
  const filtros = useMemo(() => filtrosDaUrl(params), [params]);
  const dashboard = useDashboard(filtros.aba, filtrosParaApi(filtros));

  const aplicar = useCallback(
    (novos: FiltrosAplicados) => setParams(filtrosParaUrl(novos), { replace: true }),
    [setParams],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        titulo="Dashboard"
        descricao="Torres Medical Center — Visão completa"
        breadcrumb={[{ rotulo: 'Painel' }]}
        acoes={
          <FiltrosPainel key={JSON.stringify(filtros)} aplicados={filtros} onBuscar={aplicar} />
        }
      />

      <div role="tablist" aria-label="Abas do dashboard" className="flex gap-1 border-b">
        {ABAS_PAINEL.map((aba) => (
          <button
            key={aba}
            type="button"
            role="tab"
            id={`aba-${aba}`}
            aria-selected={aba === filtros.aba}
            aria-controls="painel-aba"
            className={cn(
              '-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors',
              aba === filtros.aba
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
            onClick={() => aplicar({ ...filtros, aba })}
          >
            {ROTULOS_ABA[aba]}
          </button>
        ))}
      </div>

      <div
        id="painel-aba"
        role="tabpanel"
        aria-labelledby={`aba-${filtros.aba}`}
        className="space-y-8"
      >
        {dashboard.isPending && <Skeleton className="h-64 w-full" aria-label="Carregando" />}
        {dashboard.isError && (
          <p role="alert" className="text-sm text-destructive">
            Não foi possível carregar o dashboard. Tente novamente.
          </p>
        )}
        {dashboard.data?.secoes.map((secao) => (
          <SecaoPainelView key={secao.id} secao={secao} />
        ))}
      </div>
    </div>
  );
}
