import { useTranslation } from 'react-i18next';
import { Skeleton } from '@/components/ui/skeleton';
import { formatoData } from '@/lib/i18n';
import { StatusAgendamento } from '../atendimento-medico/StatusAgendamento';
import { EstadoVazio } from './EstadoVazio';
import { useFilaDia } from './use-soroterapia';

/** Aba "Fila do Dia": agendamentos de soroterapia de hoje, por horário. */
export function AbaFilaDia() {
  const { t } = useTranslation();
  const { data, isPending, isError } = useFilaDia();

  if (isPending) {
    return <Skeleton className="h-16 w-full max-w-3xl" aria-label={t('comum.carregando')} />;
  }
  if (isError) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {t('soroterapia.filaDia.erro')}
      </p>
    );
  }
  if (data.length === 0) return <EstadoVazio mensagem={t('soroterapia.filaDia.vazio')} />;

  return (
    <ul className="grid max-w-3xl gap-2" aria-label={t('soroterapia.filaDia.lista')}>
      {data.map((agendamento) => (
        <li key={agendamento.id} className="flex items-center gap-3 rounded-lg border p-3">
          <span className="w-14 shrink-0 font-mono text-sm">
            {formatoData({ timeStyle: 'short' }).format(new Date(agendamento.inicio))}
          </span>
          <span className="grid min-w-0 flex-1">
            <span className="truncate font-medium">{agendamento.pacienteNome}</span>
            <span className="truncate text-xs text-muted-foreground">
              {[agendamento.profissionalNome, agendamento.procedimento].filter(Boolean).join(' — ')}
            </span>
          </span>
          <StatusAgendamento status={agendamento.status} />
        </li>
      ))}
    </ul>
  );
}
