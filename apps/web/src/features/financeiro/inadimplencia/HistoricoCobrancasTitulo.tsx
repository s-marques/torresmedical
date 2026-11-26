import { cobrancaEnviadaPageSchema } from '@torres/shared';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { apiFetch } from '@/lib/api/client';
import { formatarDataHora } from '@/lib/formatar';
import { rotuloErroCobranca } from './colunas-historico';
import { URL_COBRANCAS } from './use-inadimplencia';

/**
 * Cobranças da régua enviadas para um título (issue #166), no detalhe de Contas a Receber. Some
 * quando o título nunca foi cobrado.
 */
export function HistoricoCobrancasTitulo({ contaReceberId }: Readonly<{ contaReceberId: string }>) {
  const { t } = useTranslation();
  const cobrancas = useQuery({
    queryKey: ['financeiro', 'inadimplencia', 'cobrancas', contaReceberId],
    queryFn: ({ signal }) =>
      apiFetch(URL_COBRANCAS, {
        query: { contaReceberId, pageSize: 50, sort: 'createdAt:desc' },
        schema: cobrancaEnviadaPageSchema,
        signal,
      }),
  });
  const envios = cobrancas.data?.data ?? [];
  if (envios.length === 0) return null;

  return (
    <div className="mt-4 grid gap-2">
      <h3 className="text-sm font-medium">{t('inadimplencia.historico.doTitulo')}</h3>
      <ul className="grid gap-1 rounded-lg border p-3 text-sm">
        {envios.map((envio) => (
          <li key={envio.id} className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>{t(`inadimplencia.regua.marcos.${envio.marco}`)}</span>
            <StatusBadge tom={envio.status === 'ENVIADO' ? 'sucesso' : 'perigo'}>
              {t(`inadimplencia.historico.status.${envio.status}`)}
            </StatusBadge>
            {envio.erro && (
              <span className="text-muted-foreground">{rotuloErroCobranca(t, envio.erro)}</span>
            )}
            <span className="text-muted-foreground">{formatarDataHora(envio.createdAt)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
