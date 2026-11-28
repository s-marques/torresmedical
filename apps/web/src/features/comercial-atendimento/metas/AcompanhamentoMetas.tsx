import {
  META_METRICAS,
  type AcompanhamentoMetas,
  type MetaEvolucao,
  type MetaMetrica,
  type MetaResumo,
} from '@torres/shared';
import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { formatarPercentual, formatarValorMeta, rotuloPeriodo } from './formatar-meta';

/** Barra de progresso; passa de 100% sem estourar a largura. */
function Barra({ percentual }: Readonly<{ percentual: number | null }>) {
  const largura = Math.min(percentual ?? 0, 100);
  const cor =
    percentual !== null && percentual >= 100
      ? 'bg-emerald-600'
      : percentual !== null && percentual >= 50
        ? 'bg-amber-500'
        : 'bg-red-500';
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
      <div className={cn('h-full rounded-full', cor)} style={{ width: `${largura}%` }} />
    </div>
  );
}

function CartaoMetrica({ resumo }: Readonly<{ resumo: MetaResumo }>) {
  const { t } = useTranslation();
  return (
    <Card data-testid={`resumo-${resumo.metrica}`}>
      <CardContent className="grid gap-2 p-4">
        <span className="text-sm text-muted-foreground">
          {t(`metas.metricas.${resumo.metrica}`)}
        </span>
        <span className="text-2xl font-semibold">{formatarPercentual(resumo.percentual)}</span>
        <Barra percentual={resumo.percentual} />
        <span className="text-xs text-muted-foreground">
          {t('metas.acompanhamento.realizadoDeProjetado', {
            realizado: formatarValorMeta(resumo.metrica, resumo.realizado),
            projetado: formatarValorMeta(resumo.metrica, resumo.projetado),
          })}
        </span>
      </CardContent>
    </Card>
  );
}

function EvolucaoMetrica({
  metrica,
  pontos,
}: Readonly<{ metrica: MetaMetrica; pontos: readonly MetaEvolucao[] }>) {
  const { t } = useTranslation();
  return (
    <section
      aria-label={t('metas.acompanhamento.evolucaoDe', { metrica: t(`metas.metricas.${metrica}`) })}
      className="grid gap-2"
      data-testid={`evolucao-${metrica}`}
    >
      <h3 className="text-sm font-semibold">{t(`metas.metricas.${metrica}`)}</h3>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('metas.colunas.periodo')}</TableHead>
            <TableHead className="text-right">{t('metas.colunas.projetado')}</TableHead>
            <TableHead className="text-right">{t('metas.colunas.realizado')}</TableHead>
            <TableHead className="w-48">{t('metas.colunas.atingido')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {pontos.map((ponto) => (
            <TableRow key={ponto.periodo}>
              <TableCell>{rotuloPeriodo(t, ponto.periodoTipo, ponto.periodo)}</TableCell>
              <TableCell className="text-right">
                {formatarValorMeta(metrica, ponto.projetado)}
              </TableCell>
              <TableCell className="text-right">
                {formatarValorMeta(metrica, ponto.realizado)}
              </TableCell>
              <TableCell>
                <div className="grid gap-1">
                  <span className="text-sm">{formatarPercentual(ponto.percentual)}</span>
                  <Barra percentual={ponto.percentual} />
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </section>
  );
}

/**
 * Aba Acompanhamento: o total projetado × realizado de cada métrica e, abaixo, a evolução
 * período a período (o histórico dos períodos anteriores).
 */
export function AcompanhamentoMetasView({ dados }: Readonly<{ dados: AcompanhamentoMetas }>) {
  const { t } = useTranslation();
  if (dados.resumo.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        {t('metas.acompanhamento.vazio')}
      </p>
    );
  }
  return (
    <div className="grid gap-6">
      <section
        aria-label={t('metas.acompanhamento.resumo')}
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5"
      >
        {dados.resumo.map((resumo) => (
          <CartaoMetrica key={resumo.metrica} resumo={resumo} />
        ))}
      </section>
      <section className="grid gap-4">
        <h2 className="text-base font-semibold">{t('metas.acompanhamento.evolucao')}</h2>
        {META_METRICAS.map((metrica) => {
          const pontos = dados.evolucao.filter((p) => p.metrica === metrica);
          return pontos.length > 0 ? (
            <EvolucaoMetrica key={metrica} metrica={metrica} pontos={pontos} />
          ) : null;
        })}
      </section>
    </div>
  );
}
