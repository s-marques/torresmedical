import { SECOES_INDICADORES } from '@torres/shared';
import { RefreshCwIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/shared/PageHeader';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { CardIndicador } from './CardIndicador';
import { useIndicadores } from './use-indicadores';

const MES = /^\d{4}-(0[1-9]|1[0-2])$/;

function mesAtual(): string {
  const hoje = new Date();
  return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Indicadores Financeiros (`/financeiro/indicadores`,
 * docs/inventario/telas/financeiro-indicadores.md): cards do mês escolhido, com a comparação com
 * o mês anterior. Somente leitura; o botão de ícone refaz a consulta.
 */
export default function IndicadoresPage() {
  const { t } = useTranslation();
  const [mes, setMes] = useState(mesAtual);
  const indicadores = useIndicadores(mes);

  return (
    <div className="space-y-6">
      <PageHeader
        titulo={t('indicadoresFinanceiros.titulo')}
        descricao={t('indicadoresFinanceiros.descricao')}
        acoes={
          <div className="flex items-center gap-2">
            <Input
              type="month"
              aria-label={t('indicadoresFinanceiros.mes')}
              value={mes}
              // O campo fica vazio quando o usuário limpa o mês: só busca com um mês válido.
              onChange={(evento) => MES.test(evento.target.value) && setMes(evento.target.value)}
              className="w-44"
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label={t('indicadoresFinanceiros.atualizar')}
              title={t('indicadoresFinanceiros.atualizar')}
              disabled={indicadores.isFetching}
              onClick={() => indicadores.refetch()}
            >
              <RefreshCwIcon className={indicadores.isFetching ? 'animate-spin' : ''} aria-hidden />
            </Button>
          </div>
        }
      />

      {indicadores.isError && (
        <Alert variant="destructive">
          <AlertDescription className="flex items-center justify-between gap-4">
            {t('indicadoresFinanceiros.erroCarregar')}
            <Button type="button" size="sm" variant="outline" onClick={() => indicadores.refetch()}>
              {t('comum.tentarNovamente')}
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {indicadores.isPending && !indicadores.isError && (
        <Skeleton className="h-64 w-full" aria-label={t('comum.carregando')} />
      )}

      {indicadores.data &&
        SECOES_INDICADORES.map((secao) => (
          <section key={secao} aria-labelledby={`secao-${secao}`} className="space-y-3">
            <h2
              id={`secao-${secao}`}
              className="text-sm font-semibold uppercase tracking-wide text-muted-foreground"
            >
              {t(`indicadoresFinanceiros.secoes.${secao}`)}
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {indicadores.data.indicadores
                .filter((indicador) => indicador.secao === secao)
                .map((indicador) => (
                  <CardIndicador key={indicador.id} indicador={indicador} />
                ))}
            </div>
          </section>
        ))}
    </div>
  );
}
