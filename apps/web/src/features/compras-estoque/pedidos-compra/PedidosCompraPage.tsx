import {
  exportPedidosCompraQuerySchema,
  listPedidosCompraQuerySchema,
  PEDIDO_COMPRA_ROTULO_STATUS,
  pedidoCompraPageSchema,
  type PedidoCompra,
} from '@torres/shared';
import { SearchIcon, TruckIcon } from 'lucide-react';
import { useState } from 'react';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { DataGrid } from '@/components/shared/data-grid/DataGrid';
import type {
  AcaoLinha,
  ColunaGrid,
  ExportacaoGrid,
  FiltroStatus,
} from '@/components/shared/data-grid/tipos';
import { PageHeader } from '@/components/shared/PageHeader';
import { SePermitido } from '@/components/shared/SePermitido';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Button } from '@/components/ui/button';
import { formatarData } from '@/lib/formatar';
import { formatarMoeda } from '@/lib/forms/mascaras';
import { DetalhePedido } from './DetalhePedido';
import { ModalPedido } from './ModalPedido';
import { TOM_STATUS_PEDIDO } from './opcoes';
import {
  URL_PEDIDOS_COMPRA,
  useCancelarPedidoCompra,
  useExcluirPedidoCompra,
  useReceberPedidoCompra,
} from './use-pedidos-compra';

const STATUS: FiltroStatus = {
  rotuloTodos: 'Todos',
  opcoes: Object.entries(PEDIDO_COMPRA_ROTULO_STATUS).map(([valor, rotulo]) => ({
    valor,
    rotulo,
  })),
};

const EXPORTACAO: ExportacaoGrid = {
  permissao: 'compras-estoque.pedidos-transito.exportar',
  nomeArquivo: 'pedidos-compra',
  schema: exportPedidosCompraQuerySchema,
};

/** Colunas do inventário: NF, Fornecedor, Data Pedido, Previsao, Valor, Itens e Status. */
const COLUNAS: ColunaGrid<PedidoCompra>[] = [
  {
    id: 'numeroNf',
    titulo: 'NF',
    ordenavel: true,
    exportavel: true,
    celula: (p) => p.numeroNf ?? '-',
  },
  {
    id: 'fornecedor',
    titulo: 'Fornecedor',
    ordenavel: true,
    exportavel: true,
    celula: (p) => p.fornecedorNome ?? '-',
  },
  {
    id: 'dataPedido',
    titulo: 'Data Pedido',
    ordenavel: true,
    exportavel: true,
    celula: (p) => formatarData(p.dataPedido),
  },
  {
    id: 'dataPrevisao',
    titulo: 'Previsao',
    ordenavel: true,
    exportavel: true,
    celula: (p) => (p.dataPrevisao ? formatarData(p.dataPrevisao) : '-'),
  },
  {
    id: 'valorTotal',
    titulo: 'Valor',
    ordenavel: true,
    exportavel: true,
    celula: (p) => formatarMoeda(Number(p.valorTotal)),
  },
  { id: 'qtdItens', titulo: 'Itens', ordenavel: true, exportavel: true },
  {
    id: 'status',
    titulo: 'Status',
    ordenavel: true,
    exportavel: true,
    celula: (p) => (
      <StatusBadge tom={TOM_STATUS_PEDIDO[p.status]}>
        {PEDIDO_COMPRA_ROTULO_STATUS[p.status]}
      </StatusBadge>
    ),
  },
];

/** Pedido aberto no modal: novo (sem pedido) ou em edição. */
type ModalAberto = { pedido?: PedidoCompra };

const descricaoPedido = (p: PedidoCompra | null) =>
  p?.numeroNf ? `o pedido da NF ${p.numeroNf}` : 'este pedido';

/**
 * Pedidos em Trânsito (`/pedidos-compra`, docs/inventario/telas/compras-estoque-pedidos-em-transito.md):
 * gerencie pedidos de compra em trânsito, recebidos e cancelados.
 */
export default function PedidosCompraPage() {
  const [modal, setModal] = useState<ModalAberto | null>(null);
  const [detalhando, setDetalhando] = useState<PedidoCompra | null>(null);
  const [recebendo, setRecebendo] = useState<PedidoCompra | null>(null);
  const [cancelando, setCancelando] = useState<PedidoCompra | null>(null);
  const [excluindo, setExcluindo] = useState<PedidoCompra | null>(null);
  const receber = useReceberPedidoCompra();
  const cancelar = useCancelarPedidoCompra();
  const excluir = useExcluirPedidoCompra();

  const acoes = (pedido: PedidoCompra): AcaoLinha[] => [
    { rotulo: 'Ver detalhes', icone: SearchIcon, onSelect: () => setDetalhando(pedido) },
  ];

  /** Fecha o detalhe e abre a próxima etapa (modal ou confirmação). */
  const depoisDoDetalhe = (abrir: (p: PedidoCompra) => void) => () => {
    if (detalhando) abrir(detalhando);
    setDetalhando(null);
  };

  return (
    <div className="grid gap-6">
      <PageHeader
        titulo="Pedidos de Compra"
        descricao="Gerencie pedidos de compra em transito, recebidos e cancelados."
        acoes={
          <SePermitido permissao="compras-estoque.pedidos-transito.criar">
            <Button type="button" onClick={() => setModal({})}>
              <TruckIcon aria-hidden />
              Novo Pedido
            </Button>
          </SePermitido>
        }
      />
      <DataGrid
        url={URL_PEDIDOS_COMPRA}
        schema={pedidoCompraPageSchema}
        querySchema={listPedidosCompraQuerySchema}
        colunas={COLUNAS}
        busca="Buscar pedidos..."
        status={STATUS}
        exportacao={EXPORTACAO}
        acoes={acoes}
        aoClicarLinha={setDetalhando}
        mensagemVazio="Nenhum pedido encontrado."
      />
      {modal && <ModalPedido pedido={modal.pedido} onFechar={() => setModal(null)} />}
      {detalhando && (
        <DetalhePedido
          pedido={detalhando}
          onFechar={() => setDetalhando(null)}
          onEditar={depoisDoDetalhe((pedido) => setModal({ pedido }))}
          onReceber={depoisDoDetalhe(setRecebendo)}
          onCancelar={depoisDoDetalhe(setCancelando)}
          onExcluir={depoisDoDetalhe(setExcluindo)}
        />
      )}
      <ConfirmDialog
        aberto={recebendo !== null}
        onAbertoChange={(aberto) => aberto || setRecebendo(null)}
        titulo="Marcar como recebido"
        descricao={`Marcar ${descricaoPedido(recebendo)} como recebido? O estoque não é alterado.`}
        rotuloConfirmar="Marcar como recebido"
        onConfirmar={() => (recebendo ? receber.mutateAsync(recebendo.id) : undefined)}
      />
      <ConfirmDialog
        aberto={cancelando !== null}
        onAbertoChange={(aberto) => aberto || setCancelando(null)}
        titulo="Cancelar Pedido"
        descricao={`Cancelar ${descricaoPedido(cancelando)}?`}
        rotuloConfirmar="Cancelar pedido"
        onConfirmar={() => (cancelando ? cancelar.mutateAsync(cancelando.id) : undefined)}
      />
      <ConfirmDialog
        aberto={excluindo !== null}
        onAbertoChange={(aberto) => aberto || setExcluindo(null)}
        titulo="Excluir Pedido"
        descricao={`Tem certeza que deseja excluir ${descricaoPedido(excluindo)}? Esta ação não pode ser desfeita.`}
        rotuloConfirmar="Excluir"
        onConfirmar={() => (excluindo ? excluir.mutateAsync(excluindo.id) : undefined)}
      />
    </div>
  );
}
