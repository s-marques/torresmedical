import {
  exportLicencasQuerySchema,
  LICENCA_STATUS,
  licencaPageSchema,
  listLicencasQuerySchema,
  type Licenca,
} from '@torres/shared';
import { PencilIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DataGrid } from '@/components/shared/data-grid/DataGrid';
import type { ColunaGrid, ExportacaoGrid, FiltroStatus } from '@/components/shared/data-grid/tipos';
import { formatarData } from '@/lib/formatar';
import { ModalLicenca } from './ModalLicenca';
import { StatusLicenca } from './StatusLicenca';
import { URL_LICENCAS } from './use-alvaras-licencas';

const EXPORTACAO: ExportacaoGrid = {
  permissao: 'regulatorio-qualidade.alvaras-licencas.exportar',
  nomeArquivo: 'alvaras-licencas',
  schema: exportLicencasQuerySchema,
};

/** Aba "Licencas": grid com as colunas do inventário, filtrado pela unidade escolhida na tela. */
export function AbaLicencas({ unidadeId }: Readonly<{ unidadeId: string }>) {
  const { t } = useTranslation();
  const [editando, setEditando] = useState<Licenca | null>(null);

  const colunas = useMemo<ColunaGrid<Licenca>[]>(() => {
    const titulo = (chave: string) => t(`alvarasLicencas.colunas.${chave}`);
    return [
      {
        id: 'tipoLicenca',
        titulo: titulo('tipoLicenca'),
        ordenavel: true,
        exportavel: true,
        ocultavel: false,
        celula: (l) => l.tipoLicencaNome,
      },
      {
        id: 'unidade',
        titulo: titulo('unidade'),
        ordenavel: true,
        exportavel: true,
        celula: (l) => l.unidadeNome,
      },
      {
        id: 'numeroDocumento',
        titulo: titulo('numeroDocumento'),
        ordenavel: true,
        exportavel: true,
      },
      { id: 'orgaoEmissor', titulo: titulo('orgaoEmissor'), ordenavel: true, exportavel: true },
      {
        id: 'dataVencimento',
        titulo: titulo('vencimento'),
        ordenavel: true,
        exportavel: true,
        celula: (l) => formatarData(l.dataVencimento),
      },
      {
        id: 'dias',
        titulo: titulo('dias'),
        ordenavel: true,
        exportavel: true,
        celula: (l) => l.diasRestantes ?? '-',
      },
      {
        id: 'status',
        titulo: titulo('status'),
        ordenavel: true,
        exportavel: true,
        celula: (l) => <StatusLicenca status={l.status} />,
      },
      { id: 'responsavel', titulo: titulo('responsavel'), ordenavel: true, exportavel: true },
    ];
  }, [t]);

  const status = useMemo<FiltroStatus>(
    () => ({
      opcoes: LICENCA_STATUS.map((valor) => ({
        valor,
        rotulo: t(`alvarasLicencas.status.${valor}`),
      })),
    }),
    [t],
  );

  return (
    <>
      <DataGrid
        url={URL_LICENCAS}
        schema={licencaPageSchema}
        querySchema={listLicencasQuerySchema}
        colunas={colunas}
        consultaFixa={unidadeId ? { unidadeId } : undefined}
        busca={t('alvarasLicencas.buscar')}
        status={status}
        exportacao={EXPORTACAO}
        mensagemVazio={t('alvarasLicencas.vazio')}
        acoes={(licenca) => [
          {
            rotulo: t('alvarasLicencas.editar'),
            icone: PencilIcon,
            permissao: 'regulatorio-qualidade.alvaras-licencas.editar',
            onSelect: () => setEditando(licenca),
          },
        ]}
      />
      {editando && <ModalLicenca licenca={editando} onFechar={() => setEditando(null)} />}
    </>
  );
}
