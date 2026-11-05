import {
  COMPRA_ROTULO_STATUS,
  compraPageSchema,
  exportComprasQuerySchema,
  listComprasQuerySchema,
  type Compra,
  type CompraXmlPrevia,
} from '@torres/shared';
import { FileCodeIcon, PlusIcon, SearchIcon } from 'lucide-react';
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
import { DetalheCompra } from './DetalheCompra';
import { ModalCompra } from './ModalCompra';
import { ModalImportarXml } from './ModalImportarXml';
import { TOM_STATUS_COMPRA } from './opcoes';
import { URL_COMPRAS, useCancelarCompra, useExcluirCompra } from './use-compras';

const STATUS: FiltroStatus = {
  rotuloTodos: 'Todas',
  opcoes: Object.entries(COMPRA_ROTULO_STATUS).map(([valor, rotulo]) => ({ valor, rotulo })),
};

const EXPORTACAO: ExportacaoGrid = {
  permissao: 'compras-estoque.entrada-compras.exportar',
  nomeArquivo: 'compras',
  schema: exportComprasQuerySchema,
};

const COLUNAS: ColunaGrid<Compra>[] = [
  { id: 'id', titulo: '#', celula: (c) => c.numero, ordenavel: true, exportavel: true },
  {
    id: 'dataEntrada',
    titulo: 'Data',
    ordenavel: true,
    exportavel: true,
    celula: (c) => formatarData(c.dataEntrada),
  },
  {
    id: 'fornecedor',
    titulo: 'Fornecedor',
    ordenavel: true,
    exportavel: true,
    celula: (c) => c.fornecedorNome ?? '-',
  },
  { id: 'numeroNf', titulo: 'NF', ordenavel: true, exportavel: true },
  {
    id: 'valorTotal',
    titulo: 'Valor Total',
    ordenavel: true,
    exportavel: true,
    celula: (c) => formatarMoeda(Number(c.valorTotal)),
  },
  {
    id: 'status',
    titulo: 'Status',
    ordenavel: true,
    exportavel: true,
    celula: (c) => (
      <StatusBadge tom={TOM_STATUS_COMPRA[c.status]}>{COMPRA_ROTULO_STATUS[c.status]}</StatusBadge>
    ),
  },
];

/** Compra aberta no modal: nova (com ou sem prévia do XML) ou em edição. */
type ModalAberto = { compra?: Compra; previa?: CompraXmlPrevia };

/**
 * Entrada de Compras (`/compras`, docs/inventario/telas/compras-estoque-entrada-de-compras.md):
 * registre compras de fornecedores e controle o estoque de entrada.
 */
export default function ComprasPage() {
  const [importando, setImportando] = useState(false);
  const [modal, setModal] = useState<ModalAberto | null>(null);
  const [detalhando, setDetalhando] = useState<Compra | null>(null);
  const [excluindo, setExcluindo] = useState<Compra | null>(null);
  const [cancelando, setCancelando] = useState<Compra | null>(null);
  const excluir = useExcluirCompra();
  const cancelar = useCancelarCompra();

  const acoes = (compra: Compra): AcaoLinha[] => [
    { rotulo: 'Ver detalhes', icone: SearchIcon, onSelect: () => setDetalhando(compra) },
  ];

  return (
    <div className="grid gap-6">
      <PageHeader
        titulo="Compras"
        descricao="Registre compras de fornecedores e controle o estoque de entrada."
        acoes={
          <SePermitido permissao="compras-estoque.entrada-compras.criar">
            <Button type="button" variant="outline" onClick={() => setImportando(true)}>
              <FileCodeIcon aria-hidden />
              Importar XML
            </Button>
            <Button type="button" onClick={() => setModal({})}>
              <PlusIcon aria-hidden />
              Nova Compra
            </Button>
          </SePermitido>
        }
      />
      <DataGrid
        url={URL_COMPRAS}
        schema={compraPageSchema}
        querySchema={listComprasQuerySchema}
        colunas={COLUNAS}
        busca="Buscar compras..."
        status={STATUS}
        exportacao={EXPORTACAO}
        acoes={acoes}
        aoClicarLinha={setDetalhando}
        mensagemVazio="Nenhuma compra encontrada."
      />
      {importando && (
        <ModalImportarXml
          onFechar={() => setImportando(false)}
          onPrevia={(previa) => {
            setImportando(false);
            setModal({ previa });
          }}
        />
      )}
      {modal && (
        <ModalCompra compra={modal.compra} previa={modal.previa} onFechar={() => setModal(null)} />
      )}
      {detalhando && (
        <DetalheCompra
          compra={detalhando}
          onFechar={() => setDetalhando(null)}
          onEditar={() => {
            setModal({ compra: detalhando });
            setDetalhando(null);
          }}
          onCancelar={() => {
            setCancelando(detalhando);
            setDetalhando(null);
          }}
          onExcluir={() => {
            setExcluindo(detalhando);
            setDetalhando(null);
          }}
        />
      )}
      <ConfirmDialog
        aberto={cancelando !== null}
        onAbertoChange={(aberto) => aberto || setCancelando(null)}
        titulo="Cancelar Compra"
        descricao={`Cancelar a compra #${cancelando?.numero ?? ''}? A entrada dos itens será desfeita no estoque.`}
        rotuloConfirmar="Cancelar compra"
        onConfirmar={() => (cancelando ? cancelar.mutateAsync(cancelando.id) : undefined)}
      />
      <ConfirmDialog
        aberto={excluindo !== null}
        onAbertoChange={(aberto) => aberto || setExcluindo(null)}
        titulo="Excluir Compra"
        descricao={`Tem certeza que deseja excluir a compra #${excluindo?.numero ?? ''}? A entrada dos itens será desfeita no estoque. Esta ação não pode ser desfeita.`}
        rotuloConfirmar="Excluir"
        onConfirmar={() => (excluindo ? excluir.mutateAsync(excluindo.id) : undefined)}
      />
    </div>
  );
}
