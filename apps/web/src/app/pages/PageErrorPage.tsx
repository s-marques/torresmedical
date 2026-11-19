import { TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';

/**
 * Error boundary das páginas (`errorElement` do React Router): um erro inesperado na tela
 * mostra este estado sem derrubar o menu. O detalhe técnico não aparece para o usuário.
 */
export function PageErrorPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();

  return (
    <section role="alert" className="flex flex-col items-center gap-3 py-16 text-center">
      <TriangleAlert className="size-10 text-destructive" aria-hidden />
      <h1 className="text-2xl font-bold tracking-tight">{t('paginas.erro')}</h1>
      <p className="max-w-md text-sm text-muted-foreground">{t('paginas.erroDescricao')}</p>
      <div className="flex gap-2">
        <Button variant="outline" onClick={() => void navigate(0)}>
          {t('comum.tentarNovamente')}
        </Button>
        <Button asChild>
          <Link to="/">{t('comum.voltarPainel')}</Link>
        </Button>
      </div>
    </section>
  );
}
