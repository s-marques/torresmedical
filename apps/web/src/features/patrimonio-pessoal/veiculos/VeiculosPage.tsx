import {
  exportVeiculosQuerySchema,
  listVeiculosQuerySchema,
  veiculoPageSchema,
  type Veiculo,
} from '@torres/shared';
import type { TFunction } from 'i18next';
import { PencilIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { DataGrid } from '@/components/shared/data-grid/DataGrid';
import type { ColunaGrid, ExportacaoGrid } from '@/components/shared/data-grid/tipos';
import { PageHeader } from '@/components/shared/PageHeader';
import { SePermitido } from '@/components/shared/SePermitido';
import { Button } from '@/components/ui/button';
import { formatarMoeda } from '@/lib/forms/mascaras';
import { ModalVeiculo } from './ModalVeiculo';
import { URL_VEICULOS, useExcluirVeiculo } from './use-veiculos';

const EXPORTACAO: ExportacaoGrid = {
  permissao: 'patrimonio-pessoal.veiculos.exportar',
  nomeArquivo: 'veiculos',
  schema: exportVeiculosQuerySchema,
};

const moeda = (valor: number | null) => formatarMoeda(valor) || '-';

/** Colunas do inventário: as sete são ordenáveis, exportáveis e aparecem no menu "Colunas". */
function colunas(t: TFunction): ColunaGrid<Veiculo>[] {
  return [
    { id: 'descricao', titulo: t('veiculos.colunas.descricao'), ordenavel: true, exportavel: true },
    {
      id: 'placa',
      titulo: t('veiculos.colunas.placa'),
      ordenavel: true,
      exportavel: true,
      celula: (v) => v.placa ?? '-',
    },
    {
      id: 'tipo',
      titulo: t('veiculos.colunas.tipo'),
      ordenavel: true,
      exportavel: true,
      celula: (v) => t(`veiculos.tipos.${v.tipo}`),
    },
    {
      id: 'uso',
      titulo: t('veiculos.colunas.uso'),
      ordenavel: true,
      exportavel: true,
      celula: (v) => t(`veiculos.usos.${v.uso}`),
    },
    {
      id: 'ipvaAnual',
      titulo: t('veiculos.colunas.ipvaAnual'),
      ordenavel: true,
      exportavel: true,
      celula: (v) => moeda(v.ipvaAnual),
    },
    {
      id: 'seguroAnual',
      titulo: t('veiculos.colunas.seguroAnual'),
      ordenavel: true,
      exportavel: true,
      celula: (v) => moeda(v.seguroAnual),
    },
    {
      id: 'financiamentoParcela',
      titulo: t('veiculos.colunas.financiamentoParcela'),
      ordenavel: true,
      exportavel: true,
      celula: (v) => moeda(v.financiamentoParcela),
    },
  ];
}

/** Veículos (`/veiculos`, docs/inventario/telas/patrimonio-pessoal-veiculos.md). */
export default function VeiculosPage() {
  const { t } = useTranslation();
  const [criando, setCriando] = useState(false);
  const [editando, setEditando] = useState<Veiculo | null>(null);
  const [excluindo, setExcluindo] = useState<Veiculo | null>(null);
  const excluir = useExcluirVeiculo();
  const COLUNAS = useMemo(() => colunas(t), [t]);

  return (
    <div className="grid gap-6">
      <PageHeader
        titulo={t('veiculos.titulo')}
        descricao={t('veiculos.descricao')}
        acoes={
          <SePermitido permissao="patrimonio-pessoal.veiculos.criar">
            <Button type="button" onClick={() => setCriando(true)}>
              <PlusIcon aria-hidden />
              {t('veiculos.novo')}
            </Button>
          </SePermitido>
        }
      />
      <DataGrid
        url={URL_VEICULOS}
        schema={veiculoPageSchema}
        querySchema={listVeiculosQuerySchema}
        colunas={COLUNAS}
        busca={t('veiculos.buscar')}
        exportacao={EXPORTACAO}
        mensagemVazio={t('veiculos.vazio')}
        acoes={(veiculo) => [
          {
            rotulo: t('veiculos.acoes.editar'),
            icone: PencilIcon,
            permissao: 'patrimonio-pessoal.veiculos.editar',
            onSelect: () => setEditando(veiculo),
          },
          {
            rotulo: t('veiculos.acoes.excluir'),
            icone: Trash2Icon,
            destrutiva: true,
            permissao: 'patrimonio-pessoal.veiculos.excluir',
            onSelect: () => setExcluindo(veiculo),
          },
        ]}
      />
      {criando && <ModalVeiculo onFechar={() => setCriando(false)} />}
      {editando && <ModalVeiculo veiculo={editando} onFechar={() => setEditando(null)} />}
      <ConfirmDialog
        aberto={excluindo !== null}
        onAbertoChange={(aberto) => aberto || setExcluindo(null)}
        titulo={t('veiculos.excluir.titulo')}
        descricao={t('veiculos.excluir.descricao', { descricao: excluindo?.descricao ?? '' })}
        rotuloConfirmar={t('veiculos.excluir.confirmar')}
        onConfirmar={() => (excluindo ? excluir.mutateAsync(excluindo.id) : undefined)}
      />
    </div>
  );
}
