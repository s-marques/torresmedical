import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '@/components/ui/card';
import { formatarMoeda } from '@/lib/forms/mascaras';
import { useResumoReceitas } from './use-receita-profissionais';

const CARREGANDO = '…';

/**
 * Cards "Total Recebido", "Total Pendente" e "Registros" e o "Resumo por Profissional". Somam todas
 * as páginas da consulta, com os mesmos filtros do grid.
 */
export function ResumoReceitas({
  filtros,
}: Readonly<{ filtros: Readonly<Record<string, string>> }>) {
  const { t } = useTranslation();
  const { data: resumo } = useResumoReceitas(filtros);
  const moeda = (valor: string | undefined) =>
    valor === undefined ? CARREGANDO : formatarMoeda(Number(valor));

  return (
    <div className="grid gap-4">
      <section aria-label={t('receitaProfissionais.totais')} className="grid gap-3 sm:grid-cols-3">
        <Card className="py-4">
          <CardContent className="grid gap-1 px-4">
            <p className="text-sm text-muted-foreground">
              {t('receitaProfissionais.totalRecebido')}
            </p>
            <p className="text-2xl font-semibold text-emerald-600 tabular-nums">
              {moeda(resumo?.totalRecebido)}
            </p>
          </CardContent>
        </Card>
        <Card className="py-4">
          <CardContent className="grid gap-1 px-4">
            <p className="text-sm text-muted-foreground">
              {t('receitaProfissionais.totalPendente')}
            </p>
            <p className="text-2xl font-semibold text-amber-600 tabular-nums">
              {moeda(resumo?.totalPendente)}
            </p>
          </CardContent>
        </Card>
        <Card className="py-4">
          <CardContent className="grid gap-1 px-4">
            <p className="text-sm text-muted-foreground">{t('receitaProfissionais.registros')}</p>
            <p className="text-2xl font-semibold tabular-nums">{resumo?.registros ?? CARREGANDO}</p>
          </CardContent>
        </Card>
      </section>

      {resumo && resumo.porProfissional.length > 0 && (
        <section aria-labelledby="resumo-por-profissional" className="grid gap-3">
          <h2 id="resumo-por-profissional" className="text-sm font-medium">
            {t('receitaProfissionais.resumoPorProfissional')}
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {resumo.porProfissional.map((profissional) => (
              <li key={profissional.profissionalId} className="rounded-lg border px-4 py-3">
                <p className="text-sm font-medium">{profissional.profissionalNome}</p>
                <p className="flex gap-3 text-xs tabular-nums">
                  <span className="text-emerald-600">{moeda(profissional.totalRecebido)}</span>
                  <span className="text-muted-foreground">
                    {t('receitaProfissionais.registrosAbreviado', {
                      total: profissional.registros,
                    })}
                  </span>
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
