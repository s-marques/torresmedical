import { TriangleAlertIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useAlertas } from '../alertas/use-alertas';

/**
 * Alertas do dia na aba Hoje (#170): os mesmos da central de notificações (#160), cada um com o
 * link da lista já filtrada. Só os que o perfil do usuário pode ver (a API já filtra).
 */
export function AlertasHoje() {
  const { t } = useTranslation();
  const { data } = useAlertas(false);
  const alertas = data?.data ?? [];
  return (
    <section aria-label={t('painel.hoje.alertas')} className="space-y-4">
      <h2 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
        {t('painel.hoje.alertas')}
      </h2>
      {alertas.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('painel.hoje.semAlertas')}</p>
      ) : (
        <ul className="space-y-2">
          {alertas.map((alerta) => (
            <li key={alerta.id}>
              <Link
                to={alerta.rota}
                className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 hover:bg-amber-100 dark:bg-amber-950/30 dark:text-amber-200"
              >
                <TriangleAlertIcon aria-hidden className="size-4 shrink-0" />
                {t(`alertas.tipo.${alerta.tipo}`, { count: alerta.quantidade })}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
