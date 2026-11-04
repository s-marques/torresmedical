import {
  CONTA_RECEBER_ROTULO_FILTRO_STATUS,
  CONTA_RECEBER_ROTULO_STATUS_EXIBICAO,
  exportContasReceberQuerySchema,
  listContasReceberQuerySchema,
  contaReceberPageSchema,
  statusExibicaoContaReceber,
  type ContaReceber,
  type ContaReceberStatusExibicao,
} from '@torres/shared';
import { PencilIcon, PlusIcon, SearchIcon, Trash2Icon } from 'lucide-react';
import { useState } from 'react';
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
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Button } from '@/components/ui/button';
import { formatarData } from '@/lib/formatar';
import { formatarMoeda } from '@/lib/forms/mascaras';
import { DetalheContaReceber } from './DetalheContaReceber';
import { ModalContaReceber } from './ModalContaReceber';
import { URL_CONTAS_RECEBER, useExcluirContaReceber } from './use-contas-receber';

const STATUS: FiltroStatus = {
  opcoes: Object.entries(CONTA_RECEBER_ROTULO_FILTRO_STATUS).map(([valor, rotulo]) => ({
    valor,
    rotulo,
  })),
};

const FILTROS: readonly FiltroGrid[] = [
  {
    tipo: 'periodo',
    rotulo: 'Vencimento',
    parametroDe: 'vencimentoDe',
    parametroAte: 'vencimentoAte',
  },
];

const EXPORTACAO: ExportacaoGrid = {
  permissao: 'financeiro.contas-receber.exportar',
  nomeArquivo: 'contas-receber',
  schema: exportContasReceberQuerySchema,
};

const TOM_STATUS: Record<ContaReceberStatusExibicao, 'sucesso' | 'alerta' | 'perigo'> = {
  PENDENTE: 'alerta',
  RECEBIDO: 'sucesso',
  CANCELADO: 'perigo',
  VENCIDO: 'perigo',
};

const COLUNAS: ColunaGrid<ContaReceber>[] = [
  { id: 'id', titulo: '#', celula: (c) => c.numero, ocultavel: false },
  {
    id: 'descricao',
    titulo: 'Descricao',
    ordenavel: true,
    exportavel: true,
    ocultavel: false,
  },
  {
    id: 'cliente',
    titulo: 'Cliente',
    ordenavel: true,
    exportavel: true,
    celula: (c) => c.pacienteNome ?? '-',
  },
  {
    id: 'valor',
    titulo: 'Valor',
    ordenavel: true,
    exportavel: true,
    celula: (c) => formatarMoeda(Number(c.valor)),
  },
  {
    id: 'dataVencimento',
    titulo: 'Vencimento',
    ordenavel: true,
    exportavel: true,
    celula: (c) => formatarData(c.dataVencimento),
  },
  {
    id: 'status',
    titulo: 'Status',
    ordenavel: true,
    exportavel: true,
    celula: (c) => {
      const status = statusExibicaoContaReceber(c);
      return (
        <StatusBadge tom={TOM_STATUS[status]}>
          {CONTA_RECEBER_ROTULO_STATUS_EXIBICAO[status]}
        </StatusBadge>
      );
    },
  },
];

/**
 * Contas a Receber (`/receber`, docs/inventario/telas/financeiro-contas-a-receber.md): gerencie
 * suas contas a receber e receitas.
 */
export default function ContasReceberPage() {
  const [criando, setCriando] = useState(false);
  const [detalhando, setDetalhando] = useState<ContaReceber | null>(null);
  const [editando, setEditando] = useState<ContaReceber | null>(null);
  const [excluindo, setExcluindo] = useState<ContaReceber | null>(null);
  const excluir = useExcluirContaReceber();

  const acoes = (conta: ContaReceber): AcaoLinha[] => [
    {
      rotulo: 'Detalhar',
      icone: SearchIcon,
      onSelect: () => setDetalhando(conta),
    },
    {
      rotulo: 'Editar',
      icone: PencilIcon,
      permissao: 'financeiro.contas-receber.editar',
      onSelect: () => setEditando(conta),
    },
    {
      rotulo: 'Excluir',
      icone: Trash2Icon,
      destrutiva: true,
      permissao: 'financeiro.contas-receber.excluir',
      onSelect: () => setExcluindo(conta),
    },
  ];

  return (
    <div className="grid gap-6">
      <PageHeader
        titulo="Contas a Receber"
        descricao="Gerencie suas contas a receber e receitas."
        acoes={
          <SePermitido permissao="financeiro.contas-receber.criar">
            <Button type="button" onClick={() => setCriando(true)}>
              <PlusIcon aria-hidden />
              Nova Conta
            </Button>
          </SePermitido>
        }
      />
      <DataGrid
        url={URL_CONTAS_RECEBER}
        schema={contaReceberPageSchema}
        querySchema={listContasReceberQuerySchema}
        colunas={COLUNAS}
        busca="Buscar contas a receber..."
        status={STATUS}
        filtros={FILTROS}
        exportacao={EXPORTACAO}
        acoes={acoes}
        aoClicarLinha={setDetalhando}
        mensagemVazio="Nenhuma conta a receber encontrada."
      />
      {criando && <ModalContaReceber onFechar={() => setCriando(false)} />}
      {editando && <ModalContaReceber conta={editando} onFechar={() => setEditando(null)} />}
      {detalhando && (
        <DetalheContaReceber
          conta={detalhando}
          onFechar={() => setDetalhando(null)}
          onEditar={() => {
            setEditando(detalhando);
            setDetalhando(null);
          }}
        />
      )}
      <ConfirmDialog
        aberto={excluindo !== null}
        onAbertoChange={(aberto) => aberto || setExcluindo(null)}
        titulo="Excluir Conta a Receber"
        descricao={`Tem certeza que deseja excluir a conta "${excluindo?.descricao ?? ''}"? Esta ação não pode ser desfeita.`}
        rotuloConfirmar="Excluir"
        onConfirmar={() => (excluindo ? excluir.mutateAsync(excluindo.id) : undefined)}
      />
    </div>
  );
}
