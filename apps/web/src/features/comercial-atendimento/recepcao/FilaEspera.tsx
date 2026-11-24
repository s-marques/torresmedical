import { ClockIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { StatusRecepcao } from './StatusRecepcao';
import { formatarEspera, minutosDeEspera, useAgora } from './espera';
import { useFilaRecepcao } from './use-recepcao';
import { horaLocal } from '@/features/comercial-atendimento/agenda/agenda-datas';

/** Fila de espera: quem já chegou, do que chegou há mais tempo, com a espera em andamento. */
export function FilaEspera() {
  const { t } = useTranslation();
  const { data } = useFilaRecepcao();
  const agora = useAgora();
  const fila = data?.data ?? [];

  return (
    <section aria-labelledby="recepcao-fila-titulo" className="grid gap-2 rounded-lg border p-4">
      <h2 id="recepcao-fila-titulo" className="flex items-center gap-2 text-base font-semibold">
        <ClockIcon aria-hidden className="size-4" />
        {t('recepcao.fila.titulo')}
        <span className="text-muted-foreground text-sm font-normal">({fila.length})</span>
      </h2>
      {fila.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t('recepcao.fila.vazia')}</p>
      ) : (
        <ol className="grid gap-1">
          {fila.map((item, indice) => {
            const minutos = minutosDeEspera(item, agora);
            return (
              <li
                key={item.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm"
                data-testid="item-fila"
              >
                <span className="text-muted-foreground w-5">{indice + 1}.</span>
                <span className="font-medium">{item.pacienteNome}</span>
                <span className="text-muted-foreground">
                  {item.profissionalNome}
                  {item.salaNome ? ` · ${item.salaNome}` : ''}
                </span>
                <StatusRecepcao status={item.status} />
                {item.chegadaEm && (
                  <span className="text-muted-foreground">
                    {t('recepcao.fila.chegou', { hora: horaLocal(item.chegadaEm) })}
                  </span>
                )}
                {minutos !== null && (
                  <strong data-testid="espera-fila">
                    {t('recepcao.fila.espera', { tempo: formatarEspera(minutos) })}
                  </strong>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
