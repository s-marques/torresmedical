import {
  exportImoveisQuerySchema,
  imovelPageSchema,
  listImoveisQuerySchema,
  type Imovel,
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
import { ModalImovel } from './ModalImovel';
import { URL_IMOVEIS, useExcluirImovel } from './use-imoveis';

const EXPORTACAO: ExportacaoGrid = {
  permissao: 'patrimonio-pessoal.imoveis.exportar',
  nomeArquivo: 'imoveis',
  schema: exportImoveisQuerySchema,
};

const moeda = (valor: number | null) => formatarMoeda(valor) || '-';

/** Colunas do inventário. Desp. Mensal é calculada: não ordena nem aparece no menu "Colunas". */
function colunas(t: TFunction): ColunaGrid<Imovel>[] {
  return [
    { id: 'descricao', titulo: t('imoveis.colunas.descricao'), ordenavel: true, exportavel: true },
    {
      id: 'tipo',
      titulo: t('imoveis.colunas.tipo'),
      ordenavel: true,
      exportavel: true,
      celula: (i) => t(`imoveis.tipos.${i.tipo}`),
    },
    { id: 'endereco', titulo: t('imoveis.colunas.endereco'), ordenavel: true, exportavel: true },
    {
      id: 'valorCompra',
      titulo: t('imoveis.colunas.valorCompra'),
      ordenavel: true,
      exportavel: true,
      celula: (i) => moeda(i.valorCompra),
    },
    {
      id: 'financiamentoParcela',
      titulo: t('imoveis.colunas.financiamentoParcela'),
      ordenavel: true,
      exportavel: true,
      celula: (i) => moeda(i.financiamentoParcela),
    },
    {
      id: 'despesaMensal',
      titulo: t('imoveis.colunas.despesaMensal'),
      exportavel: true,
      ocultavel: false,
      celula: (i) => moeda(i.despesaMensal),
    },
  ];
}

/** Imóveis (`/imoveis`, docs/inventario/telas/patrimonio-pessoal-imoveis.md). */
export default function ImoveisPage() {
  const { t } = useTranslation();
  const [criando, setCriando] = useState(false);
  const [editando, setEditando] = useState<Imovel | null>(null);
  const [excluindo, setExcluindo] = useState<Imovel | null>(null);
  const excluir = useExcluirImovel();
  const COLUNAS = useMemo(() => colunas(t), [t]);

  return (
    <div className="grid gap-6">
      <PageHeader
        titulo={t('imoveis.titulo')}
        descricao={t('imoveis.descricao')}
        acoes={
          <SePermitido permissao="patrimonio-pessoal.imoveis.criar">
            <Button type="button" onClick={() => setCriando(true)}>
              <PlusIcon aria-hidden />
              {t('imoveis.novo')}
            </Button>
          </SePermitido>
        }
      />
      <DataGrid
        url={URL_IMOVEIS}
        schema={imovelPageSchema}
        querySchema={listImoveisQuerySchema}
        colunas={COLUNAS}
        busca={t('imoveis.buscar')}
        exportacao={EXPORTACAO}
        mensagemVazio={t('imoveis.vazio')}
        acoes={(imovel) => [
          {
            rotulo: t('imoveis.acoes.editar'),
            icone: PencilIcon,
            permissao: 'patrimonio-pessoal.imoveis.editar',
            onSelect: () => setEditando(imovel),
          },
          {
            rotulo: t('imoveis.acoes.excluir'),
            icone: Trash2Icon,
            destrutiva: true,
            permissao: 'patrimonio-pessoal.imoveis.excluir',
            onSelect: () => setExcluindo(imovel),
          },
        ]}
      />
      {criando && <ModalImovel onFechar={() => setCriando(false)} />}
      {editando && <ModalImovel imovel={editando} onFechar={() => setEditando(null)} />}
      <ConfirmDialog
        aberto={excluindo !== null}
        onAbertoChange={(aberto) => aberto || setExcluindo(null)}
        titulo={t('imoveis.excluir.titulo')}
        descricao={t('imoveis.excluir.descricao', { descricao: excluindo?.descricao ?? '' })}
        rotuloConfirmar={t('imoveis.excluir.confirmar')}
        onConfirmar={() => (excluindo ? excluir.mutateAsync(excluindo.id) : undefined)}
      />
    </div>
  );
}
