import { PESQUISA_PROFISSIONAL_CATEGORIAS } from '@torres/shared';
import { StarIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatoNumero } from '@/lib/i18n';
import { chaveFaixa } from './faixa';
import {
  useResumoPesquisaProfissional,
  type FiltroPesquisaProfissional,
} from './use-pesquisa-profissional';

function CartaoNumero({ rotulo, valor }: Readonly<{ rotulo: string; valor: string | number }>) {
  return (
    <div className="rounded-lg border bg-card p-4 text-center">
      <p className="text-2xl font-semibold">{valor}</p>
      <p className="text-sm text-muted-foreground">{rotulo}</p>
    </div>
  );
}

/** Aba Resultados: NPS dos profissionais, envios e a média de estrelas de cada categoria. */
export function AbaResultados(filtro: Readonly<FiltroPesquisaProfissional>) {
  const { t } = useTranslation();
  const { data: resumo } = useResumoPesquisaProfissional(filtro);
  const score = resumo?.score ?? 0;
  const media = formatoNumero({ minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return (
    <div className="grid gap-4" data-testid="resultados-pesquisa-profissional">
      <div className="rounded-lg border bg-card p-6 text-center">
        <p className="text-sm text-muted-foreground">
          {t('pesquisaProfissional.resultados.score')}
        </p>
        <p className="text-5xl font-bold text-amber-600" data-testid="score-pesquisa-profissional">
          {score}
        </p>
        <p className="text-sm text-muted-foreground">
          {t(`pesquisaProfissional.faixa.${chaveFaixa(score)}`)}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <CartaoNumero
          rotulo={t('pesquisaProfissional.resultados.enviadas')}
          valor={resumo?.enviadas ?? 0}
        />
        <CartaoNumero
          rotulo={t('pesquisaProfissional.resultados.respondidas')}
          valor={resumo?.respondidas ?? 0}
        />
        <CartaoNumero
          rotulo={t('pesquisaProfissional.resultados.taxaResposta')}
          valor={`${resumo?.taxaResposta ?? 0}%`}
        />
        <CartaoNumero
          rotulo={t('pesquisaProfissional.resultados.classes')}
          valor={`${resumo?.promotores ?? 0} / ${resumo?.neutros ?? 0} / ${resumo?.detratores ?? 0}`}
        />
      </div>
      <section aria-labelledby="titulo-categorias" className="rounded-lg border bg-card p-4">
        <h2 id="titulo-categorias" className="mb-3 text-sm font-medium">
          {t('pesquisaProfissional.resultados.categorias')}
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {PESQUISA_PROFISSIONAL_CATEGORIAS.map((categoria) => {
            const item = resumo?.categorias.find((c) => c.categoria === categoria);
            return (
              <li
                key={categoria}
                className="grid justify-items-center gap-1 rounded-lg border p-3"
                data-testid={`media-${categoria}`}
              >
                <StarIcon aria-hidden className="size-5 text-amber-500" />
                <p className="text-xl font-semibold">
                  {item && item.avaliacoes > 0 ? media.format(item.media) : '-'}
                </p>
                <p className="text-sm text-muted-foreground">
                  {t(`pesquisaProfissional.categorias.${categoria}`)}
                </p>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
