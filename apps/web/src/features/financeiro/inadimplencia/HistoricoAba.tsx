import {
  cobrancaEnviadaPageSchema,
  listCobrancasEnviadasQuerySchema,
  MARCOS_COBRANCA,
  STATUS_COBRANCA_ENVIO,
} from '@torres/shared';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { DataGrid } from '@/components/shared/data-grid/DataGrid';
import type { FiltroGrid, FiltroStatus } from '@/components/shared/data-grid/tipos';
import { colunasHistorico } from './colunas-historico';
import { URL_COBRANCAS } from './use-inadimplencia';

/** Aba Histórico: todas as cobranças da régua, com filtro por marco e situação. */
export function HistoricoAba() {
  const { t } = useTranslation();
  const COLUNAS = useMemo(() => colunasHistorico(t), [t]);
  const STATUS: FiltroStatus = useMemo(
    () => ({
      opcoes: STATUS_COBRANCA_ENVIO.map((valor) => ({
        valor,
        rotulo: t(`inadimplencia.historico.status.${valor}`),
      })),
    }),
    [t],
  );
  const FILTROS: readonly FiltroGrid[] = useMemo(
    () => [
      {
        tipo: 'select',
        parametro: 'marco',
        rotulo: t('inadimplencia.historico.colunas.marco'),
        rotuloTodos: t('inadimplencia.historico.todosMarcos'),
        opcoes: MARCOS_COBRANCA.map((valor) => ({
          valor,
          rotulo: t(`inadimplencia.regua.marcos.${valor}`),
        })),
      },
    ],
    [t],
  );
  return (
    <DataGrid
      url={URL_COBRANCAS}
      schema={cobrancaEnviadaPageSchema}
      querySchema={listCobrancasEnviadasQuerySchema}
      colunas={COLUNAS}
      status={STATUS}
      filtros={FILTROS}
      mensagemVazio={t('inadimplencia.historico.vazio')}
    />
  );
}
