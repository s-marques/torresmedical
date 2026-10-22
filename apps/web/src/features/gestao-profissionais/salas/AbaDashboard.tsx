import { BarChart3Icon, CheckIcon, DoorOpenIcon, UsersIcon, type LucideIcon } from 'lucide-react';
import { EmptyState } from '@/components/shared/EmptyState';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatarMoeda } from '@/lib/forms/mascaras';
import { useDashboardSalas } from './use-salas-painel';

const TAXA = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function Indicador({
  icone: Icone,
  rotulo,
  valor,
}: Readonly<{ icone: LucideIcon; rotulo: string; valor: string | number }>) {
  return (
    <Card className="flex-row items-center gap-4 px-6 py-5">
      <Icone aria-hidden className="size-10 text-emerald-500/70" />
      <div>
        <p className="text-xs text-muted-foreground">{rotulo}</p>
        <p className="text-2xl font-bold">{valor}</p>
      </div>
    </Card>
  );
}

/** Aba Dashboard: total, ocupadas, disponíveis, taxa de ocupação e a receita mensal por sala. */
export function AbaDashboard() {
  const dashboard = useDashboardSalas();
  const dados = dashboard.data;

  if (dashboard.isPending) return <Skeleton className="h-64 rounded-xl" aria-busy />;
  if (dashboard.isError || !dados) {
    return (
      <EmptyState
        titulo="Não foi possível carregar o dashboard."
        acao={
          <Button type="button" variant="outline" onClick={() => void dashboard.refetch()}>
            Tentar de novo
          </Button>
        }
      />
    );
  }

  return (
    <div className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Indicador icone={DoorOpenIcon} rotulo="Total Salas" valor={dados.totalSalas} />
        <Indicador icone={UsersIcon} rotulo="Ocupadas" valor={dados.ocupadas} />
        <Indicador icone={CheckIcon} rotulo="Disponíveis" valor={dados.disponiveis} />
        <Indicador
          icone={BarChart3Icon}
          rotulo="Taxa Ocupação"
          valor={`${TAXA.format(dados.taxaOcupacao)}%`}
        />
      </div>
      <Card className="gap-4 px-6 py-6">
        <h2 className="text-sm font-semibold">
          Receita Mensal Contratada: {formatarMoeda(dados.receitaMensalTotal)}
        </h2>
        <ul>
          {dados.receitaPorSala.map((sala) => (
            <li
              key={sala.salaId}
              className="flex justify-between border-b py-2 text-sm last:border-0"
            >
              <span>{sala.salaNome}</span>
              <span>{formatarMoeda(sala.valor)}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
