import { MENU, type TelaMenu } from '@torres/shared';
import { Construction } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { nomeModulo, nomeTela } from '@/lib/i18n';

export interface EmConstrucaoPageProps {
  tela: TelaMenu;
}

/** Placeholder de uma tela do inventário até a issue da tela ser implementada. */
export function EmConstrucaoPage({ tela }: Readonly<EmConstrucaoPageProps>) {
  const modulo = MENU.find((m) => m.id === tela.modulo);
  const { t } = useTranslation();

  return (
    <section className="grid gap-6">
      <header>
        <p className="text-sm text-muted-foreground">{modulo && nomeModulo(t, modulo)}</p>
        <h1 className="text-2xl font-bold tracking-tight">{nomeTela(t, tela)}</h1>
      </header>
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-12 text-center">
        <Construction className="size-10 text-muted-foreground" aria-hidden />
        <h2 className="text-lg font-semibold">{t('paginas.emConstrucao')}</h2>
        <p className="max-w-md text-sm text-muted-foreground">
          {t('paginas.emConstrucaoDescricao')}
        </p>
      </div>
    </section>
  );
}
