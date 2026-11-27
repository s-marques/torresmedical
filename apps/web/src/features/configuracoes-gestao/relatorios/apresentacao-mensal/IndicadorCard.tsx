import type { IndicadorApresentacao } from '@torres/shared';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatarValorIndicador, formatarVariacao, mesPorExtenso } from './formatar-apresentacao';
import { GraficoComparativo, GraficoTendencia } from './GraficoIndicador';
import { useRotuloDoPonto } from './use-rotulo-do-ponto';

const ROTULO_COMPARACAO = {
  MES_ANTERIOR: 'apresentacao.mesAnterior',
  MEDIA_90_DIAS: 'apresentacao.media90Dias',
} as const;

/** Um indicador da apresentação: número, comparação, gráfico, lista de apoio e observações. */
export function IndicadorCard({
  indicador,
  mes,
}: Readonly<{ indicador: IndicadorApresentacao; mes: string }>) {
  const { t } = useTranslation();
  const rotulo = useRotuloDoPonto();
  const { id, numero, formato, valor, anterior, variacao, comparacao, serie, detalhe, avisos } =
    indicador;
  const nome = t(`apresentacao.indicadores.${id}`);
  const titulo = `${numero}. ${nome}`;
  const semNada = valor === null && serie.every((p) => p.valor === null);
  const rotuloComparacao = comparacao === 'NENHUMA' ? null : t(ROTULO_COMPARACAO[comparacao]);

  return (
    <Card data-testid={`indicador-${id}`} aria-label={titulo}>
      <CardHeader>
        <CardTitle className="text-base">{titulo}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-1">
          {valor !== null && (
            <p className="text-3xl font-semibold tracking-tight text-primary">
              {formatarValorIndicador(formato, valor)}
            </p>
          )}
          {semNada && (
            <p className="text-lg italic text-muted-foreground">{t('apresentacao.indisponivel')}</p>
          )}
          {valor !== null && rotuloComparacao && (
            <p className="text-sm text-muted-foreground">
              {rotuloComparacao}:{' '}
              {anterior === null
                ? t('apresentacao.indisponivel')
                : formatarValorIndicador(formato, anterior)}
              {' · '}
              {t('apresentacao.variacao')}:{' '}
              {variacao === null
                ? '—'
                : formatarVariacao(formato, variacao, t('apresentacao.pontos'))}
            </p>
          )}
        </div>

        {indicador.grafico === 'tendencia' ? (
          <GraficoTendencia
            formato={formato}
            serie={serie}
            descricao={t('apresentacao.graficoTendencia', { indicador: nome })}
          />
        ) : (
          <GraficoComparativo
            formato={formato}
            serie={serie}
            descricao={t('apresentacao.graficoComparativo', { indicador: nome })}
            rotuloAtual={mesPorExtenso(mes)}
            rotuloComparacao={rotuloComparacao}
          />
        )}

        {detalhe.length > 0 && (
          <section aria-label={t(`apresentacao.detalhe.${id}`)} className="grid gap-1">
            <h3 className="text-sm font-medium">{t(`apresentacao.detalhe.${id}`)}</h3>
            <ul className="text-sm">
              {detalhe.map((ponto) => (
                <li key={ponto.rotulo} className="flex justify-between gap-4 border-b py-1">
                  <span>{rotulo(ponto)}</span>
                  <span>
                    {ponto.valor === null ? '—' : formatarValorIndicador('numero', ponto.valor)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {avisos.length > 0 && (
          <ul className="grid gap-1 text-xs text-muted-foreground">
            {avisos.map((aviso) => (
              <li key={aviso}>{t(`apresentacao.avisos.${aviso}`)}</li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
