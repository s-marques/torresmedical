import {
  BEM_TIPOS,
  bemPageSchema,
  exportBensQuerySchema,
  listBensQuerySchema,
  type Bem,
} from '@torres/shared';
import type { TFunction } from 'i18next';
import { PencilIcon, Trash2Icon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { DataGrid } from '@/components/shared/data-grid/DataGrid';
import type { ColunaGrid, ExportacaoGrid, FiltroGrid } from '@/components/shared/data-grid/tipos';
import { formatarData } from '@/lib/formatar';
import { formatarMoeda } from '@/lib/forms/mascaras';
import { ModalBem } from './ModalBem';
import { URL_PATRIMONIO, useExcluirBem } from './use-patrimonio';

const EXPORTACAO: ExportacaoGrid = {
  permissao: 'patrimonio-pessoal.patrimonio.exportar',
  nomeArquivo: 'patrimonio',
  schema: exportBensQuerySchema,
};

const moeda = (valor: number | null) => formatarMoeda(valor) || '-';

/** Colunas do inventário. "Impostos Pend." não ordena: ainda não há cadastro de impostos. */
function colunas(t: TFunction): ColunaGrid<Bem>[] {
  return [
    {
      id: 'descricao',
      titulo: t('patrimonio.colunas.descricao'),
      ordenavel: true,
      exportavel: true,
    },
    {
      id: 'tipo',
      titulo: t('patrimonio.colunas.tipo'),
      ordenavel: true,
      exportavel: true,
      celula: (b) => t(`patrimonio.tipos.${b.tipo}`),
    },
    {
      id: 'valorCompra',
      titulo: t('patrimonio.colunas.valorCompra'),
      ordenavel: true,
      exportavel: true,
      celula: (b) => moeda(b.valorCompra),
    },
    {
      id: 'valorAtual',
      titulo: t('patrimonio.colunas.valorAtual'),
      ordenavel: true,
      exportavel: true,
      celula: (b) => moeda(b.valorAtual),
    },
    {
      id: 'dataAquisicao',
      titulo: t('patrimonio.colunas.dataAquisicao'),
      ordenavel: true,
      exportavel: true,
      celula: (b) => formatarData(b.dataAquisicao),
    },
    {
      id: 'impostosPendentes',
      titulo: t('patrimonio.colunas.impostosPendentes'),
      exportavel: true,
    },
  ];
}

/** Aba Bens: grid com busca "Buscar bens...", filtro Tipo, Colunas e Exportar. */
export function AbaBens() {
  const { t } = useTranslation();
  const [editando, setEditando] = useState<Bem | null>(null);
  const [excluindo, setExcluindo] = useState<Bem | null>(null);
  const excluir = useExcluirBem();
  const COLUNAS = useMemo(() => colunas(t), [t]);
  const FILTROS = useMemo<FiltroGrid[]>(
    () => [
      {
        tipo: 'select',
        parametro: 'tipo',
        rotulo: t('patrimonio.filtroTipo'),
        rotuloTodos: t('patrimonio.todos'),
        opcoes: BEM_TIPOS.map((valor) => ({ valor, rotulo: t(`patrimonio.tipos.${valor}`) })),
      },
    ],
    [t],
  );

  return (
    <>
      <DataGrid
        url={URL_PATRIMONIO}
        schema={bemPageSchema}
        querySchema={listBensQuerySchema}
        colunas={COLUNAS}
        busca={t('patrimonio.buscar')}
        filtros={FILTROS}
        exportacao={EXPORTACAO}
        mensagemVazio={t('patrimonio.vazio')}
        acoes={(bem) => [
          {
            rotulo: t('patrimonio.acoes.editar'),
            icone: PencilIcon,
            permissao: 'patrimonio-pessoal.patrimonio.editar',
            onSelect: () => setEditando(bem),
          },
          {
            rotulo: t('patrimonio.acoes.excluir'),
            icone: Trash2Icon,
            destrutiva: true,
            permissao: 'patrimonio-pessoal.patrimonio.excluir',
            onSelect: () => setExcluindo(bem),
          },
        ]}
      />
      {editando && <ModalBem bem={editando} onFechar={() => setEditando(null)} />}
      <ConfirmDialog
        aberto={excluindo !== null}
        onAbertoChange={(aberto) => aberto || setExcluindo(null)}
        titulo={t('patrimonio.excluir.titulo')}
        descricao={t('patrimonio.excluir.descricao', { descricao: excluindo?.descricao ?? '' })}
        rotuloConfirmar={t('patrimonio.excluir.confirmar')}
        onConfirmar={() => (excluindo ? excluir.mutateAsync(excluindo.id) : undefined)}
      />
    </>
  );
}
