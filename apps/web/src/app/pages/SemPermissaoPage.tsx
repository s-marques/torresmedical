import { ShieldX } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';

/** Tela que o perfil do usuário não libera (sem a permissão `.ver`). */
export function SemPermissaoPage() {
  const { t } = useTranslation();
  return (
    <section className="flex flex-col items-center gap-3 py-16 text-center">
      <ShieldX className="size-10 text-muted-foreground" aria-hidden />
      <h1 className="text-2xl font-bold tracking-tight">{t('paginas.semPermissao')}</h1>
      <p className="max-w-md text-sm text-muted-foreground">{t('paginas.semPermissaoDescricao')}</p>
      <Button asChild>
        <Link to="/">{t('comum.voltarPainel')}</Link>
      </Button>
    </section>
  );
}
