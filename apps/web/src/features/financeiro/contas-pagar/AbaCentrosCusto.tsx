import {
  centroCustoPageSchema,
  listCentrosCustoQuerySchema,
  type CentroCusto,
} from '@torres/shared';
import { PencilIcon, PlusIcon, PowerIcon, Trash2Icon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { DataGrid } from '@/components/shared/data-grid/DataGrid';
import type { AcaoLinha, ColunaGrid } from '@/components/shared/data-grid/tipos';
import { SePermitido } from '@/components/shared/SePermitido';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Button } from '@/components/ui/button';
import { ModalCentroCusto } from './ModalCentroCusto';
import {
  URL_CENTROS_CUSTO,
  useAlternarCentroCusto,
  useExcluirCentroCusto,
} from './use-centros-custo';

/** Aba "Centros de Custo" de Contas a Pagar: cadastro simples (issue #163). */
export function AbaCentrosCusto() {
  const { t } = useTranslation();
  const [criando, setCriando] = useState(false);
  const [editando, setEditando] = useState<CentroCusto | null>(null);
  const [excluindo, setExcluindo] = useState<CentroCusto | null>(null);
  const alternar = useAlternarCentroCusto();
  const excluir = useExcluirCentroCusto();

  const colunas = useMemo<ColunaGrid<CentroCusto>[]>(
    () => [
      {
        id: 'nome',
        titulo: t('contasPagar.centrosCusto.nome'),
        ordenavel: true,
        ocultavel: false,
      },
      {
        id: 'ativo',
        titulo: t('contasPagar.centrosCusto.status'),
        celula: (c) => (
          <StatusBadge tom={c.ativo ? 'sucesso' : 'perigo'}>
            {t(c.ativo ? 'contasPagar.centrosCusto.ativo' : 'contasPagar.centrosCusto.inativo')}
          </StatusBadge>
        ),
      },
    ],
    [t],
  );

  const acoes = (centro: CentroCusto): AcaoLinha[] => [
    {
      rotulo: t('contasPagar.centrosCusto.editar'),
      icone: PencilIcon,
      permissao: 'financeiro.contas-pagar.editar',
      onSelect: () => setEditando(centro),
    },
    {
      rotulo: t(
        centro.ativo ? 'contasPagar.centrosCusto.desativar' : 'contasPagar.centrosCusto.ativar',
      ),
      icone: PowerIcon,
      permissao: 'financeiro.contas-pagar.editar',
      onSelect: () => void alternar.mutateAsync({ id: centro.id, ativo: !centro.ativo }),
    },
    {
      rotulo: t('contasPagar.centrosCusto.excluir'),
      icone: Trash2Icon,
      destrutiva: true,
      permissao: 'financeiro.contas-pagar.excluir',
      onSelect: () => setExcluindo(centro),
    },
  ];

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{t('contasPagar.centrosCusto.descricao')}</p>
        <SePermitido permissao="financeiro.contas-pagar.criar">
          <Button type="button" onClick={() => setCriando(true)}>
            <PlusIcon aria-hidden />
            {t('contasPagar.centrosCusto.novo')}
          </Button>
        </SePermitido>
      </div>
      <DataGrid
        url={URL_CENTROS_CUSTO}
        schema={centroCustoPageSchema}
        querySchema={listCentrosCustoQuerySchema}
        colunas={colunas}
        busca={t('contasPagar.centrosCusto.busca')}
        acoes={acoes}
        mensagemVazio={t('contasPagar.centrosCusto.vazio')}
      />
      {criando && <ModalCentroCusto onFechar={() => setCriando(false)} />}
      {editando && <ModalCentroCusto centro={editando} onFechar={() => setEditando(null)} />}
      <ConfirmDialog
        aberto={excluindo !== null}
        onAbertoChange={(aberto) => aberto || setExcluindo(null)}
        titulo={t('contasPagar.centrosCusto.excluirTitulo')}
        descricao={t('contasPagar.centrosCusto.excluirDescricao', { nome: excluindo?.nome ?? '' })}
        rotuloConfirmar={t('contasPagar.centrosCusto.excluir')}
        onConfirmar={() => (excluindo ? excluir.mutateAsync(excluindo.id) : undefined)}
      />
    </div>
  );
}
