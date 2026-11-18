import { faixaDoScore } from '@torres/shared';
import { MehIcon, ThumbsDownIcon, ThumbsUpIcon, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useResumoNps } from './use-pesquisa-nps';

function CartaoNumero({ rotulo, valor }: Readonly<{ rotulo: string; valor: string | number }>) {
  return (
    <div className="rounded-lg border bg-card p-4 text-center">
      <p className="text-2xl font-semibold">{valor}</p>
      <p className="text-sm text-muted-foreground">{rotulo}</p>
    </div>
  );
}

function CartaoClasse({
  rotulo,
  percentual,
  quantidade,
  icone: Icone,
  cor,
}: Readonly<{
  rotulo: string;
  percentual: number;
  quantidade: number;
  icone: LucideIcon;
  cor: string;
}>) {
  return (
    <div className={cn('grid justify-items-center gap-1 rounded-lg border p-4', cor)}>
      <Icone aria-hidden className="size-5" />
      <p className="text-xl font-semibold">{percentual}%</p>
      <p className="text-sm text-muted-foreground">
        {rotulo} ({quantidade})
      </p>
    </div>
  );
}

/** Aba Dashboard: score NPS, envios e a divisão em promotores, neutros e detratores. */
export function AbaDashboard({ de, ate }: Readonly<{ de: string; ate: string }>) {
  const { data: resumo } = useResumoNps({ de, ate });
  const score = resumo?.score ?? 0;
  return (
    <div className="grid gap-4" data-testid="dashboard-nps">
      <div className="rounded-lg border bg-card p-6 text-center">
        <p className="text-sm text-muted-foreground">Score NPS</p>
        <p className="text-5xl font-bold text-amber-600" data-testid="score-nps">
          {score}
        </p>
        <p className="text-sm text-muted-foreground">{faixaDoScore(score)}</p>
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <CartaoNumero rotulo="Enviadas" valor={resumo?.enviadas ?? 0} />
        <CartaoNumero rotulo="Respondidas" valor={resumo?.respondidas ?? 0} />
        <CartaoNumero rotulo="Taxa Resposta" valor={`${resumo?.taxaResposta ?? 0}%`} />
        <CartaoNumero rotulo="Avaliacoes" valor={resumo?.avaliacoes ?? 0} />
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <CartaoClasse
          rotulo="Promotores"
          percentual={resumo?.percentualPromotores ?? 0}
          quantidade={resumo?.promotores ?? 0}
          icone={ThumbsUpIcon}
          cor="border-emerald-200 text-emerald-600 dark:border-emerald-900"
        />
        <CartaoClasse
          rotulo="Neutros"
          percentual={resumo?.percentualNeutros ?? 0}
          quantidade={resumo?.neutros ?? 0}
          icone={MehIcon}
          cor="border-amber-200 text-amber-600 dark:border-amber-900"
        />
        <CartaoClasse
          rotulo="Detratores"
          percentual={resumo?.percentualDetratores ?? 0}
          quantidade={resumo?.detratores ?? 0}
          icone={ThumbsDownIcon}
          cor="border-red-200 text-red-600 dark:border-red-900"
        />
      </div>
    </div>
  );
}
