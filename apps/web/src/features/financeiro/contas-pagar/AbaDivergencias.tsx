import {
  contaPagarDivergenciaPageSchema,
  exportDivergenciasContaPagarQuerySchema,
  listDivergenciasContaPagarQuerySchema,
  type ContaPagarDivergencia,
} from '@torres/shared';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { DataGrid } from '@/components/shared/data-grid/DataGrid';
import type { ColunaGrid, ExportacaoGrid, FiltroGrid } from '@/components/shared/data-grid/tipos';
import { formatarData } from '@/lib/formatar';
import { formatarMoeda } from '@/lib/forms/mascaras';
import { URL_CONTAS_PAGAR } from './use-contas-pagar';

const URL_DIVERGENCIAS = `${URL_CONTAS_PAGAR}/divergencias`;

const EXPORTACAO: ExportacaoGrid = {
  permissao: 'financeiro.contas-pagar.exportar',
  url: `${URL_DIVERGENCIAS}/export`,
  nomeArquivo: 'contas-pagar-divergencias',
  schema: exportDivergenciasContaPagarQuerySchema,
};

/**
 * Aba "Divergências" de Contas a Pagar (issue #163): baixas com valor pago diferente do saldo do
 * título, com a justificativa informada na baixa.
 */
export function AbaDivergencias() {
  const { t } = useTranslation();

  const colunas = useMemo<ColunaGrid<ContaPagarDivergencia>[]>(
    () => [
      {
        id: 'numero',
        titulo: t('contasPagar.divergencias.colunas.numero'),
        exportavel: true,
        ocultavel: false,
      },
      {
        id: 'descricao',
        titulo: t('contasPagar.divergencias.colunas.descricao'),
        exportavel: true,
        ocultavel: false,
      },
      {
        id: 'beneficiario',
        titulo: t('contasPagar.divergencias.colunas.beneficiario'),
        exportavel: true,
        celula: (d) => d.beneficiarioNome ?? '-',
      },
      {
        id: 'valor',
        titulo: t('contasPagar.divergencias.colunas.valor'),
        exportavel: true,
        celula: (d) => formatarMoeda(Number(d.valor)),
      },
      {
        id: 'valorPago',
        titulo: t('contasPagar.divergencias.colunas.valorPago'),
        ordenavel: true,
        exportavel: true,
        celula: (d) => formatarMoeda(Number(d.valorPago)),
      },
      {
        id: 'divergencia',
        titulo: t('contasPagar.divergencias.colunas.divergencia'),
        ordenavel: true,
        exportavel: true,
        celula: (d) => formatarMoeda(Number(d.divergencia)),
      },
      {
        id: 'justificativa',
        titulo: t('contasPagar.divergencias.colunas.justificativa'),
        exportavel: true,
        celula: (d) => d.justificativa ?? '-',
      },
      {
        id: 'dataPagamento',
        titulo: t('contasPagar.divergencias.colunas.dataPagamento'),
        ordenavel: true,
        exportavel: true,
        celula: (d) => formatarData(d.dataPagamento),
      },
    ],
    [t],
  );

  const filtros = useMemo<readonly FiltroGrid[]>(
    () => [
      {
        tipo: 'periodo',
        rotulo: t('contasPagar.divergencias.pagamento'),
        parametroDe: 'pagamentoDe',
        parametroAte: 'pagamentoAte',
      },
    ],
    [t],
  );

  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted-foreground">{t('contasPagar.divergencias.descricao')}</p>
      <DataGrid
        url={URL_DIVERGENCIAS}
        schema={contaPagarDivergenciaPageSchema}
        querySchema={listDivergenciasContaPagarQuerySchema}
        idLinha={(d) => d.baixaId}
        colunas={colunas}
        busca={false}
        filtros={filtros}
        exportacao={EXPORTACAO}
        mensagemVazio={t('contasPagar.divergencias.vazio')}
      />
    </div>
  );
}
