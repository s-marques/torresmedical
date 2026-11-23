import {
  coletaResiduoPageSchema,
  exportColetasResiduoQuerySchema,
  listColetasResiduoQuerySchema,
  type ColetaResiduo,
} from '@torres/shared';
import { PencilIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { DataGrid } from '@/components/shared/data-grid/DataGrid';
import type { ColunaGrid, ExportacaoGrid } from '@/components/shared/data-grid/tipos';
import { PageHeader } from '@/components/shared/PageHeader';
import { SePermitido } from '@/components/shared/SePermitido';
import { Button } from '@/components/ui/button';
import { formatarData } from '@/lib/formatar';
import { ModalColetaResiduo } from './ModalColetaResiduo';
import { URL_COLETAS_RESIDUO, useExcluirColetaResiduo } from './use-coletas-residuo';

const EXPORTACAO: ExportacaoGrid = {
  permissao: 'regulatorio-qualidade.coleta-residuos.exportar',
  nomeArquivo: 'coletas-residuo',
  schema: exportColetasResiduoQuerySchema,
};

/**
 * Coleta Resíduos (`/coletas-residuo`,
 * docs/inventario/telas/regulatorio-qualidade-coleta-residuos.md): registro de coletas de
 * resíduos biológicos e manifestos de transporte.
 */
export default function ColetasResiduoPage() {
  const { t } = useTranslation();
  const [criando, setCriando] = useState(false);
  const [editando, setEditando] = useState<ColetaResiduo | null>(null);
  const [excluindo, setExcluindo] = useState<ColetaResiduo | null>(null);
  const excluir = useExcluirColetaResiduo();

  const colunas = useMemo<ColunaGrid<ColetaResiduo>[]>(() => {
    const titulo = (chave: string) => t(`coletasResiduo.colunas.${chave}`);
    return [
      {
        id: 'dataColeta',
        titulo: titulo('dataColeta'),
        ordenavel: true,
        exportavel: true,
        celula: (c) => formatarData(c.dataColeta),
      },
      {
        id: 'proximaColeta',
        titulo: titulo('proximaColeta'),
        ordenavel: true,
        exportavel: true,
        celula: (c) => formatarData(c.proximaColeta) || '-',
      },
      {
        id: 'empresaColetora',
        titulo: titulo('empresaColetora'),
        ordenavel: true,
        exportavel: true,
      },
      { id: 'manifestoMtr', titulo: titulo('manifestoMtr'), ordenavel: true, exportavel: true },
      {
        id: 'pesoKg',
        titulo: titulo('pesoKg'),
        ordenavel: true,
        exportavel: true,
        celula: (c) => (c.pesoKg === null ? '-' : String(c.pesoKg)),
      },
      {
        id: 'tipoResiduo',
        titulo: titulo('tipoResiduo'),
        ordenavel: true,
        exportavel: true,
        celula: (c) => t(`coletasResiduo.tipos.${c.tipoResiduo}`),
      },
      { id: 'responsavel', titulo: titulo('responsavel'), ordenavel: true, exportavel: true },
    ];
  }, [t]);

  return (
    <div className="grid gap-6">
      <PageHeader
        titulo={t('coletasResiduo.titulo')}
        descricao={t('coletasResiduo.descricao')}
        acoes={
          <SePermitido permissao="regulatorio-qualidade.coleta-residuos.criar">
            <Button type="button" onClick={() => setCriando(true)}>
              <PlusIcon aria-hidden />
              {t('coletasResiduo.novo')}
            </Button>
          </SePermitido>
        }
      />
      <DataGrid
        url={URL_COLETAS_RESIDUO}
        schema={coletaResiduoPageSchema}
        querySchema={listColetasResiduoQuerySchema}
        colunas={colunas}
        busca={t('coletasResiduo.buscar')}
        exportacao={EXPORTACAO}
        mensagemVazio={t('coletasResiduo.vazio')}
        acoes={(coleta) => [
          {
            rotulo: t('coletasResiduo.acoes.editar'),
            icone: PencilIcon,
            permissao: 'regulatorio-qualidade.coleta-residuos.editar',
            onSelect: () => setEditando(coleta),
          },
          {
            rotulo: t('coletasResiduo.acoes.excluir'),
            icone: Trash2Icon,
            destrutiva: true,
            permissao: 'regulatorio-qualidade.coleta-residuos.excluir',
            onSelect: () => setExcluindo(coleta),
          },
        ]}
      />
      {criando && <ModalColetaResiduo onFechar={() => setCriando(false)} />}
      {editando && <ModalColetaResiduo coleta={editando} onFechar={() => setEditando(null)} />}
      <ConfirmDialog
        aberto={excluindo !== null}
        onAbertoChange={(aberto) => aberto || setExcluindo(null)}
        titulo={t('coletasResiduo.excluir.titulo')}
        descricao={t('coletasResiduo.excluir.descricao', {
          data: excluindo ? formatarData(excluindo.dataColeta) : '',
        })}
        rotuloConfirmar={t('coletasResiduo.excluir.confirmar')}
        onConfirmar={() => (excluindo ? excluir.mutateAsync(excluindo.id) : undefined)}
      />
    </div>
  );
}
