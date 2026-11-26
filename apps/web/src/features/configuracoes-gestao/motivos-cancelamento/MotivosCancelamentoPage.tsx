import {
  listMotivosCancelamentoQuerySchema,
  motivoCancelamentoPageSchema,
  TIPOS_CANCELAMENTO,
  type MotivoCancelamento,
} from '@torres/shared';
import type { TFunction } from 'i18next';
import { PencilIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { DataGrid } from '@/components/shared/data-grid/DataGrid';
import type { ColunaGrid, FiltroGrid, FiltroStatus } from '@/components/shared/data-grid/tipos';
import { PageHeader } from '@/components/shared/PageHeader';
import { SePermitido } from '@/components/shared/SePermitido';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ModalMotivoCancelamento } from './ModalMotivoCancelamento';
import { URL_MOTIVOS_CANCELAMENTO, useExcluirMotivo } from './use-motivos-cancelamento';

function colunas(t: TFunction): ColunaGrid<MotivoCancelamento>[] {
  return [
    {
      id: 'tipo',
      titulo: t('motivosCancelamento.colunas.tipo'),
      celula: (m) => t(`cancelamento.tipos.${m.tipo}`),
    },
    {
      id: 'nome',
      titulo: t('motivosCancelamento.colunas.nome'),
      ordenavel: true,
      ocultavel: false,
      celula: (m) => (
        <span className="flex flex-wrap items-center gap-2">
          {m.nome}
          {m.sistema && <Badge variant="secondary">{t('motivosCancelamento.sistema')}</Badge>}
        </span>
      ),
    },
    {
      id: 'exigeTexto',
      titulo: t('motivosCancelamento.colunas.exigeTexto'),
      celula: (m) => (m.exigeTexto ? t('comum.sim') : t('comum.nao')),
    },
    {
      id: 'ativo',
      titulo: t('motivosCancelamento.colunas.ativo'),
      celula: (m) => (m.ativo ? t('comum.ativo') : t('comum.inativo')),
    },
  ];
}

/**
 * Motivos de Cancelamento (`/config/motivos-cancelamento`, issue #162): as listas de motivos por
 * tipo (consulta, contrato, cobrança, período e proposta) usadas no modal padrão de cancelamento.
 */
export default function MotivosCancelamentoPage() {
  const { t } = useTranslation();
  const [criando, setCriando] = useState(false);
  const [editando, setEditando] = useState<MotivoCancelamento | null>(null);
  const [excluindo, setExcluindo] = useState<MotivoCancelamento | null>(null);
  const excluir = useExcluirMotivo();
  const COLUNAS = useMemo(() => colunas(t), [t]);
  const STATUS: FiltroStatus = useMemo(
    () => ({
      opcoes: [
        { valor: 'ativo', rotulo: t('comum.ativo') },
        { valor: 'inativo', rotulo: t('comum.inativo') },
      ],
    }),
    [t],
  );
  const FILTROS: readonly FiltroGrid[] = useMemo(
    () => [
      {
        tipo: 'select',
        parametro: 'tipo',
        rotulo: t('motivosCancelamento.filtroTipo'),
        rotuloTodos: t('motivosCancelamento.todosTipos'),
        opcoes: TIPOS_CANCELAMENTO.map((valor) => ({
          valor,
          rotulo: t(`cancelamento.tipos.${valor}`),
        })),
      },
    ],
    [t],
  );

  return (
    <div className="grid gap-6">
      <PageHeader
        titulo={t('motivosCancelamento.titulo')}
        descricao={t('motivosCancelamento.descricao')}
        acoes={
          <SePermitido permissao="configuracoes-gestao.motivos-cancelamento.criar">
            <Button type="button" onClick={() => setCriando(true)}>
              <PlusIcon aria-hidden />
              {t('motivosCancelamento.novo')}
            </Button>
          </SePermitido>
        }
      />
      <DataGrid
        url={URL_MOTIVOS_CANCELAMENTO}
        schema={motivoCancelamentoPageSchema}
        querySchema={listMotivosCancelamentoQuerySchema}
        colunas={COLUNAS}
        busca={t('motivosCancelamento.buscar')}
        status={STATUS}
        filtros={FILTROS}
        mensagemVazio={t('motivosCancelamento.vazio')}
        acoes={(motivo) => [
          {
            rotulo: t('motivosCancelamento.acoes.editar'),
            icone: PencilIcon,
            permissao: 'configuracoes-gestao.motivos-cancelamento.editar',
            onSelect: () => setEditando(motivo),
          },
          {
            rotulo: t('motivosCancelamento.acoes.excluir'),
            icone: Trash2Icon,
            destrutiva: true,
            desabilitada: motivo.sistema,
            permissao: 'configuracoes-gestao.motivos-cancelamento.excluir',
            onSelect: () => setExcluindo(motivo),
          },
        ]}
      />
      {criando && <ModalMotivoCancelamento onFechar={() => setCriando(false)} />}
      {editando && <ModalMotivoCancelamento motivo={editando} onFechar={() => setEditando(null)} />}
      <ConfirmDialog
        aberto={excluindo !== null}
        onAbertoChange={(aberto) => aberto || setExcluindo(null)}
        titulo={t('motivosCancelamento.excluir.titulo')}
        descricao={t('motivosCancelamento.excluir.descricao', { nome: excluindo?.nome ?? '' })}
        rotuloConfirmar={t('motivosCancelamento.excluir.confirmar')}
        onConfirmar={() => (excluindo ? excluir.mutateAsync(excluindo.id) : undefined)}
      />
    </div>
  );
}
