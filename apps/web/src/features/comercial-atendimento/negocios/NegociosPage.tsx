import {
  exportNegociosQuerySchema,
  listNegociosQuerySchema,
  NEGOCIO_STATUS,
  NEGOCIO_STATUS_ROTULO,
  negocioPageSchema,
  type Negocio,
} from '@torres/shared';
import { PencilIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { DataGrid } from '@/components/shared/data-grid/DataGrid';
import type {
  AcaoLinha,
  ColunaGrid,
  ExportacaoGrid,
  FiltroGrid,
  FiltroStatus,
} from '@/components/shared/data-grid/tipos';
import { PageHeader } from '@/components/shared/PageHeader';
import { SePermitido } from '@/components/shared/SePermitido';
import { Button } from '@/components/ui/button';
import { formatarMoeda } from '@/lib/forms/mascaras';
import { ModalNegocioTela } from './ModalNegocioTela';
import {
  URL_NEGOCIOS,
  useExcluirNegocioTela,
  usePipelinesNegocios,
  useResumoNegocios,
} from './use-negocios';

const STATUS: FiltroStatus = {
  opcoes: NEGOCIO_STATUS.map((status) => ({
    valor: status,
    rotulo: NEGOCIO_STATUS_ROTULO[status],
  })),
};

const EXPORTACAO: ExportacaoGrid = {
  permissao: 'comercial-atendimento.negocios.exportar',
  nomeArquivo: 'negocios',
  schema: exportNegociosQuerySchema,
};

const dataBr = (iso: string) => iso.split('-').reverse().join('/');

const COLUNAS: ColunaGrid<Negocio>[] = [
  { id: 'titulo', titulo: 'Título', ordenavel: true, exportavel: true, ocultavel: false },
  {
    id: 'cliente',
    titulo: 'Cliente',
    ordenavel: true,
    exportavel: true,
    celula: (n) => n.contato ?? '-',
  },
  { id: 'estagio', titulo: 'Estágio', ordenavel: true, exportavel: true },
  {
    id: 'valor',
    titulo: 'Valor (R$)',
    ordenavel: true,
    exportavel: true,
    celula: (n) => (n.valor === null ? '-' : formatarMoeda(Number(n.valor))),
  },
  {
    id: 'previsaoFechamento',
    titulo: 'Previsão Fechamento',
    ordenavel: true,
    exportavel: true,
    celula: (n) => (n.previsaoFechamento ? dataBr(n.previsaoFechamento) : '-'),
  },
  {
    id: 'status',
    titulo: 'Status',
    ordenavel: true,
    exportavel: true,
    celula: (n) => NEGOCIO_STATUS_ROTULO[n.status],
  },
  {
    id: 'origem',
    titulo: 'Origem',
    ordenavel: true,
    exportavel: true,
    celula: (n) => n.origem ?? '-',
  },
  {
    id: 'motivoPerda',
    titulo: 'Motivo Perda',
    ordenavel: true,
    exportavel: true,
    celula: (n) => n.motivoPerda ?? '-',
  },
  {
    id: 'responsavel',
    titulo: 'Responsável',
    ordenavel: true,
    exportavel: true,
    celula: (n) => n.responsavel ?? '-',
  },
];

function Cartao({ rotulo, valor }: Readonly<{ rotulo: string; valor: string }>) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-sm text-muted-foreground">{rotulo}</p>
      <p className="text-2xl font-semibold">{valor}</p>
    </div>
  );
}

/** Cartões do cabeçalho: seguem a busca e o pipeline escolhidos no grid. */
function Resumo() {
  const [params] = useSearchParams();
  const resumo = useResumoNegocios({
    search: params.get('search') ?? undefined,
    pipelineId: params.get('pipelineId') ?? undefined,
  }).data;
  const grupos = resumo ? [resumo.abertos, resumo.ganhos, resumo.perdidos] : [];
  const total = grupos.reduce((soma, g) => soma + g.quantidade, 0);
  const valor = grupos.reduce((soma, g) => soma + Number(g.total), 0);
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4" data-testid="resumo-negocios">
      <Cartao rotulo="Total de Negócios" valor={String(total)} />
      <Cartao rotulo="Valor Total" valor={formatarMoeda(valor)} />
      <Cartao rotulo="Ganhos" valor={String(resumo?.ganhos.quantidade ?? 0)} />
      <Cartao rotulo="Perdidos" valor={String(resumo?.perdidos.quantidade ?? 0)} />
    </div>
  );
}

/**
 * Negócios (`/negocios`, docs/inventario/telas/comercial-atendimento-negocios.md): pipeline de
 * vendas e oportunidades em lista, com os mesmos negócios do quadro da tela Pipeline.
 */
export default function NegociosPage() {
  const [criando, setCriando] = useState(false);
  const [editando, setEditando] = useState<Negocio | null>(null);
  const [excluindo, setExcluindo] = useState<Negocio | null>(null);
  const pipelines = usePipelinesNegocios();
  const excluir = useExcluirNegocioTela();

  const filtros = useMemo<readonly FiltroGrid[]>(
    () => [
      {
        tipo: 'select',
        parametro: 'pipelineId',
        rotulo: 'Todos os Pipelines',
        opcoes: (pipelines.data ?? []).map((p) => ({ valor: p.id, rotulo: p.nome })),
      },
    ],
    [pipelines.data],
  );

  const acoes = (negocio: Negocio): AcaoLinha[] => [
    {
      rotulo: 'Editar',
      icone: PencilIcon,
      permissao: 'comercial-atendimento.negocios.editar',
      onSelect: () => setEditando(negocio),
    },
    {
      rotulo: 'Excluir',
      icone: Trash2Icon,
      destrutiva: true,
      permissao: 'comercial-atendimento.negocios.excluir',
      onSelect: () => setExcluindo(negocio),
    },
  ];

  return (
    <div className="grid gap-6">
      <PageHeader
        titulo="Negócios"
        descricao="Pipeline de vendas e oportunidades"
        acoes={
          <SePermitido permissao="comercial-atendimento.negocios.criar">
            <Button type="button" onClick={() => setCriando(true)}>
              <PlusIcon aria-hidden />
              Novo Negócio
            </Button>
          </SePermitido>
        }
      />
      <Resumo />
      <DataGrid
        url={URL_NEGOCIOS}
        schema={negocioPageSchema}
        querySchema={listNegociosQuerySchema}
        colunas={COLUNAS}
        busca="Buscar negócios..."
        status={STATUS}
        filtros={filtros}
        exportacao={EXPORTACAO}
        acoes={acoes}
        mensagemVazio="Nenhum negócio encontrado."
      />
      {criando && (
        <ModalNegocioTela pipelines={pipelines.data ?? []} onFechar={() => setCriando(false)} />
      )}
      {editando && (
        <ModalNegocioTela
          pipelines={pipelines.data ?? []}
          negocio={editando}
          onFechar={() => setEditando(null)}
        />
      )}
      <ConfirmDialog
        aberto={excluindo !== null}
        onAbertoChange={(aberto) => aberto || setExcluindo(null)}
        titulo="Excluir Negócio"
        descricao={`Tem certeza que deseja excluir o negócio "${excluindo?.titulo ?? ''}"? Esta ação não pode ser desfeita.`}
        onConfirmar={() => (excluindo ? excluir.mutateAsync(excluindo.id) : undefined)}
      />
    </div>
  );
}
