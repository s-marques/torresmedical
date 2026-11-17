import {
  ATIVIDADE_STATUS,
  ATIVIDADE_STATUS_ROTULO,
  ATIVIDADE_TIPO_ROTULO,
  ATIVIDADE_TIPOS,
  atividadePageSchema,
  exportAtividadesQuerySchema,
  listAtividadesQuerySchema,
  type Atividade,
} from '@torres/shared';
import {
  CheckCheckIcon,
  CheckIcon,
  CircleXIcon,
  ClockIcon,
  ListTodoIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
  XIcon,
  type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { DataGrid } from '@/components/shared/data-grid/DataGrid';
import type {
  AcaoLinha,
  ColunaGrid,
  ExportacaoGrid,
  FiltroGrid,
} from '@/components/shared/data-grid/tipos';
import { PageHeader } from '@/components/shared/PageHeader';
import { SePermitido } from '@/components/shared/SePermitido';
import { Button } from '@/components/ui/button';
import { formatarDataHora } from '@/lib/formatar';
import { ModalAtividade, type FechamentoAtividade } from './ModalAtividade';
import {
  URL_ATIVIDADES,
  useExcluirAtividade,
  useFecharAtividade,
  useResumoAtividades,
} from './use-atividades';

/** Os dois combos "Todos" do inventário: Tipo e Status. */
const FILTROS: readonly FiltroGrid[] = [
  {
    tipo: 'select',
    parametro: 'tipo',
    rotulo: 'Todos os tipos',
    opcoes: ATIVIDADE_TIPOS.map((tipo) => ({ valor: tipo, rotulo: ATIVIDADE_TIPO_ROTULO[tipo] })),
  },
  {
    tipo: 'select',
    parametro: 'status',
    rotulo: 'Todos os status',
    opcoes: ATIVIDADE_STATUS.map((status) => ({
      valor: status,
      rotulo: ATIVIDADE_STATUS_ROTULO[status],
    })),
  },
];

const EXPORTACAO: ExportacaoGrid = {
  permissao: 'comercial-atendimento.atividades.exportar',
  nomeArquivo: 'atividades',
  schema: exportAtividadesQuerySchema,
};

const COLUNAS: ColunaGrid<Atividade>[] = [
  { id: 'titulo', titulo: 'Título', ordenavel: true, exportavel: true, ocultavel: false },
  {
    id: 'tipo',
    titulo: 'Tipo',
    ordenavel: true,
    exportavel: true,
    celula: (a) => ATIVIDADE_TIPO_ROTULO[a.tipo],
  },
  {
    id: 'negocio',
    titulo: 'Negócio',
    ordenavel: true,
    exportavel: true,
    celula: (a) => a.negocio ?? '-',
  },
  {
    id: 'dataHora',
    titulo: 'Data Agendamento',
    ordenavel: true,
    exportavel: true,
    celula: (a) => formatarDataHora(a.dataHora),
  },
  {
    id: 'status',
    titulo: 'Status',
    ordenavel: true,
    exportavel: true,
    celula: (a) => ATIVIDADE_STATUS_ROTULO[a.status],
  },
  {
    id: 'responsavel',
    titulo: 'Responsável',
    ordenavel: true,
    exportavel: true,
    oculta: true,
    celula: (a) => a.responsavel ?? '-',
  },
];

function Cartao({
  rotulo,
  valor,
  icone: Icone,
  cor,
}: Readonly<{ rotulo: string; valor: number; icone: LucideIcon; cor: string }>) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">{rotulo}</p>
        <Icone aria-hidden className={`size-4 ${cor}`} />
      </div>
      <p className={`text-2xl font-semibold ${cor}`}>{valor}</p>
    </div>
  );
}

/** Cartões do cabeçalho: seguem a busca e o tipo escolhidos no grid. */
function Resumo() {
  const [params] = useSearchParams();
  const resumo = useResumoAtividades({
    search: params.get('search') ?? undefined,
    tipo: params.get('tipo') ?? undefined,
  }).data;
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4" data-testid="resumo-atividades">
      <Cartao rotulo="Total" valor={resumo?.total ?? 0} icone={ListTodoIcon} cor="" />
      <Cartao
        rotulo="Pendentes"
        valor={resumo?.pendentes ?? 0}
        icone={ClockIcon}
        cor="text-amber-600"
      />
      <Cartao
        rotulo="Concluídas"
        valor={resumo?.concluidas ?? 0}
        icone={CheckCheckIcon}
        cor="text-emerald-600"
      />
      <Cartao
        rotulo="Canceladas"
        valor={resumo?.canceladas ?? 0}
        icone={CircleXIcon}
        cor="text-muted-foreground"
      />
    </div>
  );
}

/**
 * Atividades (`/atividades`, docs/inventario/telas/comercial-atendimento-atividades.md): tarefas,
 * ligações e follow-ups, ligados ou não a um negócio do CRM.
 */
export default function AtividadesPage() {
  const [criando, setCriando] = useState(false);
  const [editando, setEditando] = useState<Atividade | null>(null);
  const [fechamento, setFechamento] = useState<FechamentoAtividade | null>(null);
  const [cancelando, setCancelando] = useState<Atividade | null>(null);
  const [excluindo, setExcluindo] = useState<Atividade | null>(null);
  const concluir = useFecharAtividade('concluir');
  const cancelar = useFecharAtividade('cancelar');
  const excluir = useExcluirAtividade();

  const acoes = (atividade: Atividade): AcaoLinha[] => {
    const pendente = atividade.status === 'PENDENTE';
    return [
      {
        rotulo: 'Editar',
        icone: PencilIcon,
        permissao: 'comercial-atendimento.atividades.editar',
        onSelect: () => setEditando(atividade),
      },
      ...(pendente
        ? [
            {
              rotulo: 'Concluir',
              icone: CheckIcon,
              permissao: 'comercial-atendimento.atividades.editar' as const,
              onSelect: () =>
                atividade.exigeProximaAcao
                  ? setFechamento({ atividade, acao: 'concluir' })
                  : concluir.mutate({ id: atividade.id }),
            },
            {
              rotulo: 'Cancelar',
              icone: XIcon,
              destrutiva: true,
              permissao: 'comercial-atendimento.atividades.editar' as const,
              onSelect: () =>
                atividade.exigeProximaAcao
                  ? setFechamento({ atividade, acao: 'cancelar' })
                  : setCancelando(atividade),
            },
          ]
        : []),
      {
        rotulo: 'Excluir',
        icone: Trash2Icon,
        destrutiva: true,
        permissao: 'comercial-atendimento.atividades.excluir',
        onSelect: () => setExcluindo(atividade),
      },
    ];
  };

  return (
    <div className="grid gap-6">
      <PageHeader
        titulo="Atividades"
        descricao="Tarefas, ligações e follow-ups"
        acoes={
          <SePermitido permissao="comercial-atendimento.atividades.criar">
            <Button type="button" onClick={() => setCriando(true)}>
              <PlusIcon aria-hidden />
              Nova Atividade
            </Button>
          </SePermitido>
        }
      />
      <Resumo />
      <DataGrid
        url={URL_ATIVIDADES}
        schema={atividadePageSchema}
        querySchema={listAtividadesQuerySchema}
        colunas={COLUNAS}
        busca="Buscar atividades..."
        filtros={FILTROS}
        exportacao={EXPORTACAO}
        acoes={acoes}
        mensagemVazio="Nenhuma atividade encontrada."
      />
      {criando && <ModalAtividade onFechar={() => setCriando(false)} />}
      {editando && <ModalAtividade atividade={editando} onFechar={() => setEditando(null)} />}
      {fechamento && (
        <ModalAtividade fechamento={fechamento} onFechar={() => setFechamento(null)} />
      )}
      <ConfirmDialog
        aberto={cancelando !== null}
        onAbertoChange={(aberto) => aberto || setCancelando(null)}
        titulo="Cancelar Atividade"
        descricao={`Tem certeza que deseja cancelar a atividade "${cancelando?.titulo ?? ''}"?`}
        onConfirmar={() => (cancelando ? cancelar.mutateAsync({ id: cancelando.id }) : undefined)}
      />
      <ConfirmDialog
        aberto={excluindo !== null}
        onAbertoChange={(aberto) => aberto || setExcluindo(null)}
        titulo="Excluir Atividade"
        descricao={`Tem certeza que deseja excluir a atividade "${excluindo?.titulo ?? ''}"? Esta ação não pode ser desfeita.`}
        onConfirmar={() => (excluindo ? excluir.mutateAsync(excluindo.id) : undefined)}
      />
    </div>
  );
}
