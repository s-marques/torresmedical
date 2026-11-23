import {
  encaminhamentoRelatorioPageSchema,
  relatorioEncaminhamentosQuerySchema,
  type EncaminhamentoRelatorioLinha,
} from '@torres/shared';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { DataGrid } from '@/components/shared/data-grid/DataGrid';
import type { ColunaGrid, FiltroGrid } from '@/components/shared/data-grid/tipos';
import { formatoNumero } from '@/lib/i18n';
import { URL_RELATORIO_ENCAMINHAMENTOS } from './use-encaminhamentos';

/**
 * Aba "Relatório por Profissional": encaminhamentos enviados e recebidos por profissional e a
 * conversão em atendimento, com período De/Até opcional.
 */
export function AbaRelatorio() {
  const { t } = useTranslation();

  const colunas = useMemo<ColunaGrid<EncaminhamentoRelatorioLinha>[]>(() => {
    const titulo = (chave: string) => t(`encaminhamentos.relatorio.colunas.${chave}`);
    const percentual = (valor: number) =>
      `${formatoNumero({ maximumFractionDigits: 1 }).format(valor)}%`;
    return [
      {
        id: 'profissional',
        titulo: titulo('profissional'),
        ordenavel: true,
        ocultavel: false,
        celula: (l) => l.profissionalNome ?? '-',
      },
      { id: 'enviados', titulo: titulo('enviados'), ordenavel: true },
      { id: 'enviadosAtendidos', titulo: titulo('enviadosAtendidos'), ordenavel: true },
      {
        id: 'taxaEnviados',
        titulo: titulo('taxaEnviados'),
        ordenavel: true,
        celula: (l) => percentual(l.taxaEnviados),
      },
      { id: 'recebidos', titulo: titulo('recebidos'), ordenavel: true },
      { id: 'recebidosAtendidos', titulo: titulo('recebidosAtendidos'), ordenavel: true },
      {
        id: 'taxaRecebidos',
        titulo: titulo('taxaRecebidos'),
        ordenavel: true,
        celula: (l) => percentual(l.taxaRecebidos),
      },
    ];
  }, [t]);

  const filtros = useMemo<readonly FiltroGrid[]>(
    () => [
      {
        tipo: 'periodo',
        rotulo: t('encaminhamentos.relatorio.periodo'),
        parametroDe: 'de',
        parametroAte: 'ate',
      },
    ],
    [t],
  );

  return (
    <DataGrid
      url={URL_RELATORIO_ENCAMINHAMENTOS}
      schema={encaminhamentoRelatorioPageSchema}
      querySchema={relatorioEncaminhamentosQuerySchema}
      colunas={colunas}
      idLinha={(linha) => linha.profissionalId}
      busca={false}
      filtros={filtros}
      mensagemVazio={t('encaminhamentos.relatorio.vazio')}
    />
  );
}
