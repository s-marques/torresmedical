import { useTranslation } from 'react-i18next';
import { Skeleton } from '@/components/ui/skeleton';
import { EstadoVazio } from './EstadoVazio';
import { usePacotes } from './use-soroterapia';

/** Aba "Pacotes": protocolos de orçamentos aprovados. */
export function AbaPacotes() {
  const { t } = useTranslation();
  const { data, isPending, isError } = usePacotes();

  if (isPending) {
    return <Skeleton className="h-16 w-full max-w-3xl" aria-label={t('comum.carregando')} />;
  }
  if (isError) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {t('soroterapia.pacotes.erro')}
      </p>
    );
  }
  if (data.length === 0) {
    return (
      <EstadoVazio mensagem={t('soroterapia.pacotes.vazio')} dica={t('soroterapia.pacotes.dica')} />
    );
  }

  return (
    <ul className="grid max-w-3xl gap-2" aria-label={t('soroterapia.pacotes.lista')}>
      {data.map((pacote) => (
        <li key={pacote.id} className="flex items-center gap-3 rounded-lg border p-3">
          <span className="grid min-w-0 flex-1">
            <span className="truncate font-medium">{pacote.protocolo}</span>
            <span className="truncate text-xs text-muted-foreground">
              {pacote.pacienteNome ?? t('soroterapia.pacotes.semPaciente')} —{' '}
              {t('soroterapia.pacotes.orcamento', { numero: pacote.orcamentoNumero })}
            </span>
          </span>
          <span className="shrink-0 text-sm text-muted-foreground">
            {t('soroterapia.pacotes.quantidade', { quantidade: pacote.quantidade })}
          </span>
        </li>
      ))}
    </ul>
  );
}
