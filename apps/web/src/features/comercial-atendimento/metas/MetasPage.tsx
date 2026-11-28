import {
  listMetasComerciaisQuerySchema,
  META_METRICAS,
  metaComercialPageSchema,
  type AcompanhamentoMetasQuery,
  type MetaComercial,
} from '@torres/shared';
import { PencilIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { DataGrid } from '@/components/shared/data-grid/DataGrid';
import type { AcaoLinha, ColunaGrid, FiltroGrid } from '@/components/shared/data-grid/tipos';
import { PageHeader } from '@/components/shared/PageHeader';
import { SePermitido } from '@/components/shared/SePermitido';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AcompanhamentoMetasView } from './AcompanhamentoMetas';
import { FiltrosMetas } from './FiltrosMetas';
import { formatarPercentual, formatarValorMeta, rotuloPeriodo } from './formatar-meta';
import { ModalMeta } from './ModalMeta';
import {
  URL_METAS,
  useAcompanhamentoMetas,
  useExcluirMeta,
  useResponsaveisMetas,
} from './use-metas';

function Acompanhamento() {
  const { t } = useTranslation();
  const [filtros, setFiltros] = useState<AcompanhamentoMetasQuery>({
    de: undefined,
    ate: undefined,
  });
  const acompanhamento = useAcompanhamentoMetas(filtros);
  return (
    <div className="grid gap-4">
      <FiltrosMetas valor={filtros} onChange={setFiltros} />
      {acompanhamento.isError && (
        <Alert variant="destructive">
          <AlertDescription>{t('metas.erroCarregar')}</AlertDescription>
        </Alert>
      )}
      {acompanhamento.isPending && <Skeleton className="h-48 w-full" />}
      {acompanhamento.data && <AcompanhamentoMetasView dados={acompanhamento.data} />}
    </div>
  );
}

/**
 * Metas (`/crm/metas`, issue #172, R §24): cadastro das metas comerciais por período e
 * responsável, com o projetado × realizado, o % atingido, a evolução e o histórico.
 */
export default function MetasPage() {
  const { t } = useTranslation();
  const [criando, setCriando] = useState(false);
  const [editando, setEditando] = useState<MetaComercial | null>(null);
  const [excluindo, setExcluindo] = useState<MetaComercial | null>(null);
  const excluir = useExcluirMeta();
  const responsaveis = useResponsaveisMetas();

  const colunas = useMemo<ColunaGrid<MetaComercial>[]>(
    () => [
      {
        id: 'metrica',
        titulo: t('metas.colunas.metrica'),
        ordenavel: true,
        ocultavel: false,
        tituloCartao: true,
        celula: (m) => t(`metas.metricas.${m.metrica}`),
      },
      {
        id: 'dataInicio',
        titulo: t('metas.colunas.periodo'),
        ordenavel: true,
        celula: (m) => rotuloPeriodo(t, m.periodoTipo, m.periodo),
      },
      {
        id: 'responsavel',
        titulo: t('metas.colunas.responsavel'),
        celula: (m) => m.responsavel ?? t('metas.campos.responsavelEquipe'),
      },
      {
        id: 'valor',
        titulo: t('metas.colunas.projetado'),
        ordenavel: true,
        celula: (m) => formatarValorMeta(m.metrica, m.valor),
      },
      {
        id: 'realizado',
        titulo: t('metas.colunas.realizado'),
        celula: (m) => formatarValorMeta(m.metrica, m.realizado),
      },
      {
        id: 'percentual',
        titulo: t('metas.colunas.atingido'),
        celula: (m) => formatarPercentual(m.percentual),
      },
    ],
    [t],
  );

  const filtros = useMemo<readonly FiltroGrid[]>(
    () => [
      {
        tipo: 'select',
        parametro: 'metrica',
        rotulo: t('metas.filtros.metrica'),
        rotuloTodos: t('metas.filtros.todasMetricas'),
        opcoes: META_METRICAS.map((valor) => ({ valor, rotulo: t(`metas.metricas.${valor}`) })),
      },
      {
        tipo: 'select',
        parametro: 'responsavelId',
        rotulo: t('metas.filtros.responsavel'),
        rotuloTodos: t('metas.filtros.todosResponsaveis'),
        opcoes: (responsaveis.data ?? []).map((r) => ({ valor: r.id, rotulo: r.nome })),
      },
      {
        tipo: 'periodo',
        rotulo: t('metas.filtros.periodo'),
        parametroDe: 'de',
        parametroAte: 'ate',
      },
    ],
    [t, responsaveis.data],
  );

  const acoes = (meta: MetaComercial): AcaoLinha[] => [
    {
      rotulo: t('metas.acoes.editar'),
      icone: PencilIcon,
      permissao: 'comercial-atendimento.metas.editar',
      onSelect: () => setEditando(meta),
    },
    {
      rotulo: t('metas.acoes.excluir'),
      icone: Trash2Icon,
      destrutiva: true,
      permissao: 'comercial-atendimento.metas.excluir',
      onSelect: () => setExcluindo(meta),
    },
  ];

  return (
    <div className="grid gap-6">
      <PageHeader
        titulo={t('metas.titulo')}
        descricao={t('metas.descricao')}
        acoes={
          <SePermitido permissao="comercial-atendimento.metas.criar">
            <Button type="button" onClick={() => setCriando(true)}>
              <PlusIcon aria-hidden />
              {t('metas.nova')}
            </Button>
          </SePermitido>
        }
      />
      <Tabs defaultValue="acompanhamento">
        <TabsList>
          <TabsTrigger value="acompanhamento">{t('metas.abas.acompanhamento')}</TabsTrigger>
          <TabsTrigger value="metas">{t('metas.abas.metas')}</TabsTrigger>
        </TabsList>
        <TabsContent value="acompanhamento" className="pt-4">
          <Acompanhamento />
        </TabsContent>
        <TabsContent value="metas" className="pt-4">
          <DataGrid
            url={URL_METAS}
            schema={metaComercialPageSchema}
            querySchema={listMetasComerciaisQuerySchema}
            colunas={colunas}
            busca={false}
            filtros={filtros}
            acoes={acoes}
            mensagemVazio={t('metas.vazio')}
          />
        </TabsContent>
      </Tabs>
      {criando && <ModalMeta onFechar={() => setCriando(false)} />}
      {editando && <ModalMeta meta={editando} onFechar={() => setEditando(null)} />}
      <ConfirmDialog
        aberto={excluindo !== null}
        onAbertoChange={(aberto) => aberto || setExcluindo(null)}
        titulo={t('metas.excluir.titulo')}
        descricao={t('metas.excluir.descricao', {
          metrica: excluindo ? t(`metas.metricas.${excluindo.metrica}`) : '',
          periodo: excluindo ? rotuloPeriodo(t, excluindo.periodoTipo, excluindo.periodo) : '',
        })}
        onConfirmar={() => (excluindo ? excluir.mutateAsync(excluindo.id) : undefined)}
      />
    </div>
  );
}
