import { RefreshCwIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/shared/PageHeader';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { HistoricoAba } from './HistoricoAba';
import { PainelAba } from './PainelAba';
import { ReguaAba } from './ReguaAba';
import { usePainelInadimplencia } from './use-inadimplencia';

/**
 * Inadimplência (`/financeiro/inadimplencia`, issue #166, R §18): painel do dia (a receber hoje,
 * vencidos, aging e inadimplentes), régua de cobrança (3 dias antes, no vencimento, 3 e 7 dias
 * depois) e o histórico das cobranças enviadas.
 */
export default function InadimplenciaPage() {
  const { t } = useTranslation();
  const painel = usePainelInadimplencia();

  return (
    <div className="space-y-6">
      <PageHeader
        titulo={t('inadimplencia.titulo')}
        descricao={t('inadimplencia.descricao')}
        acoes={
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label={t('inadimplencia.atualizar')}
            title={t('inadimplencia.atualizar')}
            disabled={painel.isFetching}
            onClick={() => painel.refetch()}
          >
            <RefreshCwIcon className={painel.isFetching ? 'animate-spin' : ''} aria-hidden />
          </Button>
        }
      />
      <Tabs defaultValue="painel">
        <TabsList>
          <TabsTrigger value="painel">{t('inadimplencia.abas.painel')}</TabsTrigger>
          <TabsTrigger value="regua">{t('inadimplencia.abas.regua')}</TabsTrigger>
          <TabsTrigger value="historico">{t('inadimplencia.abas.historico')}</TabsTrigger>
        </TabsList>
        <TabsContent value="painel" className="pt-4">
          {painel.isError && (
            <Alert variant="destructive">
              <AlertDescription>{t('inadimplencia.erroCarregar')}</AlertDescription>
            </Alert>
          )}
          {painel.isPending && <Skeleton className="h-64 w-full" />}
          {painel.data && <PainelAba painel={painel.data} />}
        </TabsContent>
        <TabsContent value="regua" className="pt-4">
          <ReguaAba />
        </TabsContent>
        <TabsContent value="historico" className="pt-4">
          <HistoricoAba />
        </TabsContent>
      </Tabs>
    </div>
  );
}
