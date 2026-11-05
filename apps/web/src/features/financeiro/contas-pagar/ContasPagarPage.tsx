import {
  CONTA_PAGAR_ROTULO_FILTRO_STATUS,
  CONTA_PAGAR_ROTULO_STATUS_EXIBICAO,
  contaPagarPageSchema,
  exportContasPagarQuerySchema,
  listContasPagarQuerySchema,
  statusExibicaoContaPagar,
  type ContaPagar,
  type ContaPagarStatusExibicao,
} from '@torres/shared';
import {
  BanknoteIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  Trash2Icon,
  XCircleIcon,
} from 'lucide-react';
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
import { DetalheContaPagar } from './DetalheContaPagar';
import { ModalBaixaContaPagar } from './ModalBaixaContaPagar';
import { ModalContaPagar } from './ModalContaPagar';
import {
  useCancelarBaixaContaPagar,
  URL_CONTAS_PAGAR,
  useExcluirContaPagar,
} from './use-contas-pagar';

const STATUS: FiltroStatus = {
  opcoes: Object.entries(CONTA_PAGAR_ROTULO_FILTRO_STATUS).map(([valor, rotulo]) => ({
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
  permissao: 'financeiro.contas-pagar.exportar',
  nomeArquivo: 'contas-pagar',
  schema: exportContasPagarQuerySchema,
};

const TOM_STATUS: Record<ContaPagarStatusExibicao, 'sucesso' | 'alerta' | 'perigo'> = {
  PENDENTE: 'alerta',
  PAGO: 'sucesso',
  CANCELADO: 'perigo',
  VENCIDO: 'perigo',
};

const COLUNAS: ColunaGrid<ContaPagar>[] = [
  { id: 'id', titulo: '#', celula: (c) => c.numero, ocultavel: false },
  {
    id: 'descricao',
    titulo: 'Descricao',
    ordenavel: true,
    exportavel: true,
    ocultavel: false,
  },
  {
    id: 'beneficiario',
    titulo: 'Fornecedor / Funcionário',
    ordenavel: true,
    exportavel: true,
    celula: (c) => c.beneficiarioNome ?? '-',
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
      const status = statusExibicaoContaPagar(c);
      return (
        <StatusBadge tom={TOM_STATUS[status]}>
          {CONTA_PAGAR_ROTULO_STATUS_EXIBICAO[status]}
        </StatusBadge>
      );
    },
  },
];

/**
 * Contas a Pagar (`/pagar`, docs/inventario/telas/financeiro-contas-a-pagar.md): gerencie suas
 * contas a pagar e fornecedores.
 */
export default function ContasPagarPage() {
  const [criando, setCriando] = useState(false);
  const [detalhando, setDetalhando] = useState<ContaPagar | null>(null);
  const [editando, setEditando] = useState<ContaPagar | null>(null);
  const [baixando, setBaixando] = useState<ContaPagar | null>(null);
  const [excluindo, setExcluindo] = useState<ContaPagar | null>(null);
  const excluir = useExcluirContaPagar();
  const cancelarBaixa = useCancelarBaixaContaPagar();

  const acoes = (conta: ContaPagar): AcaoLinha[] => [
    {
      rotulo: 'Detalhar',
      icone: SearchIcon,
      onSelect: () => setDetalhando(conta),
    },
    {
      rotulo: 'Editar Baixa',
      icone: BanknoteIcon,
      permissao: 'financeiro.contas-pagar.editar',
      desabilitada: conta.status !== 'PENDENTE',
      onSelect: () => setBaixando(conta),
    },
    {
      rotulo: 'Cancelar Baixa',
      icone: XCircleIcon,
      permissao: 'financeiro.contas-pagar.editar',
      desabilitada: Number(conta.valorPago) <= 0,
      onSelect: () => cancelarBaixa.mutateAsync(conta.id),
    },
    {
      rotulo: 'Editar',
      icone: PencilIcon,
      permissao: 'financeiro.contas-pagar.editar',
      onSelect: () => setEditando(conta),
    },
    {
      rotulo: 'Excluir',
      icone: Trash2Icon,
      destrutiva: true,
      permissao: 'financeiro.contas-pagar.excluir',
      onSelect: () => setExcluindo(conta),
    },
  ];

  return (
    <div className="grid gap-6">
      <PageHeader
        titulo="Contas a Pagar"
        descricao="Gerencie suas contas a pagar e fornecedores."
        acoes={
          <SePermitido permissao="financeiro.contas-pagar.criar">
            <Button type="button" onClick={() => setCriando(true)}>
              <PlusIcon aria-hidden />
              Nova Conta
            </Button>
          </SePermitido>
        }
      />
      <DataGrid
        url={URL_CONTAS_PAGAR}
        schema={contaPagarPageSchema}
        querySchema={listContasPagarQuerySchema}
        colunas={COLUNAS}
        busca="Buscar contas a pagar..."
        status={STATUS}
        filtros={FILTROS}
        exportacao={EXPORTACAO}
        acoes={acoes}
        aoClicarLinha={setDetalhando}
        mensagemVazio="Nenhuma conta a pagar encontrada."
      />
      {criando && <ModalContaPagar onFechar={() => setCriando(false)} />}
      {editando && <ModalContaPagar conta={editando} onFechar={() => setEditando(null)} />}
      {baixando && <ModalBaixaContaPagar conta={baixando} onFechar={() => setBaixando(null)} />}
      {detalhando && (
        <DetalheContaPagar
          conta={detalhando}
          onFechar={() => setDetalhando(null)}
          onEditar={() => {
            setEditando(detalhando);
            setDetalhando(null);
          }}
          onBaixar={() => {
            setBaixando(detalhando);
            setDetalhando(null);
          }}
          onCancelarBaixa={() => {
            void cancelarBaixa.mutateAsync(detalhando.id);
            setDetalhando(null);
          }}
        />
      )}
      <ConfirmDialog
        aberto={excluindo !== null}
        onAbertoChange={(aberto) => aberto || setExcluindo(null)}
        titulo="Excluir Conta a Pagar"
        descricao={`Tem certeza que deseja excluir a conta "${excluindo?.descricao ?? ''}"? Esta ação não pode ser desfeita.`}
        rotuloConfirmar="Excluir"
        onConfirmar={() => (excluindo ? excluir.mutateAsync(excluindo.id) : undefined)}
      />
    </div>
  );
}
