import {
  exportPacotesQuerySchema,
  listPacotesQuerySchema,
  pacotePageSchema,
  type Pacote,
} from '@torres/shared';
import { EyeIcon, PencilIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import { useState } from 'react';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { DataGrid } from '@/components/shared/data-grid/DataGrid';
import type { ColunaGrid, ExportacaoGrid, FiltroStatus } from '@/components/shared/data-grid/tipos';
import { PageHeader } from '@/components/shared/PageHeader';
import { SePermitido } from '@/components/shared/SePermitido';
import { Button } from '@/components/ui/button';
import { formatarData } from '@/lib/formatar';
import { formatarMoeda } from '@/lib/forms/mascaras';
import { DetalhePacote } from './DetalhePacote';
import { ModalPacote } from './ModalPacote';
import { BarraSessoes, StatusPacote } from './StatusPacote';
import { URL_PACOTES, useExcluirPacote } from './use-pacotes';

const STATUS: FiltroStatus = {
  opcoes: [
    { valor: 'ativo', rotulo: 'Ativo' },
    { valor: 'finalizado', rotulo: 'Finalizado' },
    { valor: 'vencido', rotulo: 'Vencido' },
    { valor: 'cancelado', rotulo: 'Cancelado' },
  ],
};

const EXPORTACAO: ExportacaoGrid = {
  permissao: 'comercial-atendimento.pacotes.exportar',
  nomeArquivo: 'pacotes',
  schema: exportPacotesQuerySchema,
};

const COLUNAS: ColunaGrid<Pacote>[] = [
  { id: 'cliente', titulo: 'Cliente', ordenavel: true, exportavel: true },
  {
    id: 'nome',
    titulo: 'Pacote',
    ordenavel: true,
    exportavel: true,
    celula: (p) => (
      <div className="grid">
        <span className="font-medium">{p.nome}</span>
        {p.descricao && (
          <span className="max-w-64 truncate text-xs text-muted-foreground">{p.descricao}</span>
        )}
      </div>
    ),
  },
  {
    id: 'sessoes',
    titulo: 'Sessões',
    exportavel: true,
    ocultavel: false,
    celula: (p) => (
      <div className="flex items-center gap-2">
        <BarraSessoes
          usadas={p.sessoesUsadas}
          total={p.sessoesTotal}
          rotulo={`Sessões usadas de ${p.nome}`}
          className="h-1.5 w-16"
        />
        <span className="text-xs text-muted-foreground">
          {p.sessoesUsadas}/{p.sessoesTotal}
        </span>
      </div>
    ),
  },
  {
    id: 'saldo',
    titulo: 'Saldo',
    exportavel: true,
    ocultavel: false,
    celula: (p) => (
      <span className="font-medium text-emerald-700 dark:text-emerald-400">{p.saldo}</span>
    ),
  },
  {
    id: 'valor',
    titulo: 'Valor',
    ordenavel: true,
    exportavel: true,
    celula: (p) => formatarMoeda(Number(p.valorTotal)),
  },
  {
    id: 'vencimento',
    titulo: 'Vencimento',
    ordenavel: true,
    exportavel: true,
    celula: (p) => formatarData(p.dataVencimento),
  },
  {
    id: 'status',
    titulo: 'Status',
    ordenavel: true,
    exportavel: true,
    celula: (p) => <StatusPacote status={p.status} />,
  },
];

/**
 * Pacotes de Sessões (`/pacotes`, docs/inventario/telas/comercial-atendimento-pacotes.md):
 * listagem, cadastro, edição, exclusão, detalhe com progresso e uso de sessões.
 */
export default function PacotesPage() {
  const [criando, setCriando] = useState(false);
  const [detalhando, setDetalhando] = useState<Pacote | null>(null);
  const [editando, setEditando] = useState<Pacote | null>(null);
  const [excluindo, setExcluindo] = useState<Pacote | null>(null);
  const excluir = useExcluirPacote();

  return (
    <div className="grid gap-6">
      <PageHeader
        titulo="Pacotes de Sessões"
        descricao="Gerencie pacotes de sessões dos pacientes."
        acoes={
          <SePermitido permissao="comercial-atendimento.pacotes.criar">
            <Button type="button" onClick={() => setCriando(true)}>
              <PlusIcon aria-hidden />
              Novo Pacote
            </Button>
          </SePermitido>
        }
      />
      <DataGrid
        url={URL_PACOTES}
        schema={pacotePageSchema}
        querySchema={listPacotesQuerySchema}
        colunas={COLUNAS}
        busca="Buscar pacotes..."
        status={STATUS}
        exportacao={EXPORTACAO}
        acoes={(pacote) => [
          { rotulo: 'Visualizar', icone: EyeIcon, onSelect: () => setDetalhando(pacote) },
          {
            rotulo: 'Editar',
            icone: PencilIcon,
            permissao: 'comercial-atendimento.pacotes.editar',
            onSelect: () => setEditando(pacote),
          },
          {
            rotulo: 'Excluir',
            icone: Trash2Icon,
            destrutiva: true,
            permissao: 'comercial-atendimento.pacotes.excluir',
            onSelect: () => setExcluindo(pacote),
          },
        ]}
        aoClicarLinha={setDetalhando}
        mensagemVazio="Nenhum pacote encontrado."
      />
      {criando && <ModalPacote onFechar={() => setCriando(false)} />}
      {editando && <ModalPacote pacote={editando} onFechar={() => setEditando(null)} />}
      {detalhando && (
        <DetalhePacote
          pacote={detalhando}
          onFechar={() => setDetalhando(null)}
          onEditar={(pacote) => {
            setDetalhando(null);
            setEditando(pacote);
          }}
        />
      )}
      <ConfirmDialog
        aberto={excluindo !== null}
        onAbertoChange={(aberto) => aberto || setExcluindo(null)}
        titulo="Excluir Pacote"
        descricao={`Tem certeza que deseja excluir o pacote "${excluindo?.nome ?? ''}" do cliente ${excluindo?.cliente ?? ''}? Esta ação não pode ser desfeita.`}
        rotuloConfirmar="Excluir"
        onConfirmar={() => (excluindo ? excluir.mutateAsync(excluindo.id) : undefined)}
      />
    </div>
  );
}
