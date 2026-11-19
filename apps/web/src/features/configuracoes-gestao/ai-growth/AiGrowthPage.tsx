import type { AiGrowthInsight, AiGrowthPrioridade } from '@torres/shared';
import { ClockIcon, EyeIcon, Loader2Icon, SparklesIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/shared/PageHeader';
import { SePermitido } from '@/components/shared/SePermitido';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatarDataHora } from '@/lib/formatar';
import { cn } from '@/lib/utils';
import { ModalInsight } from './ModalInsight';
import { textosDoInsight } from './textos-insight';
import { useAnalisarAgora, usePainelAiGrowth } from './use-ai-growth';

/** Cor do ícone do card: verde quando não há pendência; âmbar e vermelho conforme a prioridade. */
const COR_ICONE: Record<AiGrowthPrioridade, string> = {
  BAIXA: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400',
  MEDIA: 'bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-400',
  ALTA: 'bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-400',
};

/**
 * AI Growth (`/ai-growth`, docs/inventario/telas/configuracoes-gestao-ai-growth.md): pontos de
 * atenção do negócio. "Analisar Agora" pede uma nova análise ao servidor, que roda em segundo plano.
 */
export default function AiGrowthPage() {
  const { t } = useTranslation();
  const [detalhe, setDetalhe] = useState<AiGrowthInsight | null>(null);
  const painel = usePainelAiGrowth();
  const analisar = useAnalisarAgora();
  const analisando = analisar.isPending || Boolean(painel.data?.emAndamento);

  return (
    <div className="space-y-6">
      <PageHeader
        titulo={t('aiGrowth.titulo')}
        descricao={t('aiGrowth.descricao')}
        acoes={
          <SePermitido permissao="configuracoes-gestao.ai-growth.criar">
            <Button type="button" disabled={analisando} onClick={() => analisar.mutate()}>
              {analisando ? (
                <Loader2Icon className="animate-spin" aria-hidden />
              ) : (
                <SparklesIcon aria-hidden />
              )}
              {analisando ? t('aiGrowth.analisando') : t('aiGrowth.analisarAgora')}
            </Button>
          </SePermitido>
        }
      />

      {painel.isError && (
        <Alert variant="destructive">
          <AlertDescription className="flex items-center justify-between gap-4">
            {t('aiGrowth.erroCarregar')}
            <Button type="button" size="sm" variant="outline" onClick={() => painel.refetch()}>
              {t('comum.tentarNovamente')}
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {painel.isPending && <Skeleton className="h-48 w-full" />}

      {painel.data && (
        <>
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <ClockIcon className="size-4" aria-hidden />
            {painel.data.ultimaAnalise ? (
              <>
                {t('aiGrowth.ultimaAnalise', {
                  data: formatarDataHora(painel.data.ultimaAnalise.concluidaEm),
                })}
                {' • '}
                {t(
                  painel.data.pontosAtencao === 1 ? 'aiGrowth.pontosUm' : 'aiGrowth.pontosVarios',
                  { count: painel.data.pontosAtencao },
                )}
              </>
            ) : (
              t('aiGrowth.semAnalise')
            )}
          </p>

          <div className="grid gap-4 md:grid-cols-2">
            {painel.data.insights.map((insight) => (
              <CardInsight key={insight.id} insight={insight} onDetalhes={setDetalhe} />
            ))}
          </div>
        </>
      )}

      <ModalInsight insight={detalhe} onFechar={() => setDetalhe(null)} />
    </div>
  );
}

function CardInsight({
  insight,
  onDetalhes,
}: Readonly<{ insight: AiGrowthInsight; onDetalhes: (insight: AiGrowthInsight) => void }>) {
  const { t } = useTranslation();
  const textos = textosDoInsight(t, insight);
  return (
    <Card>
      <CardContent className="flex h-full flex-col gap-3">
        <div className="flex gap-4">
          <span
            className={cn(
              'flex size-10 shrink-0 items-center justify-center rounded-lg',
              COR_ICONE[insight.prioridade],
            )}
          >
            <SparklesIcon className="size-5" aria-hidden />
          </span>
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-semibold">{textos.titulo}</h2>
              <Badge variant="outline">{t(`aiGrowth.prioridade.${insight.prioridade}`)}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">{textos.descricao}</p>
            <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
              {textos.destaque}
            </p>
            <p className="rounded-md bg-emerald-50 p-3 text-xs text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
              {textos.acao}
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-auto w-fit"
          onClick={() => onDetalhes(insight)}
        >
          <EyeIcon aria-hidden />
          {t('aiGrowth.verDetalhes')}
        </Button>
      </CardContent>
    </Card>
  );
}
