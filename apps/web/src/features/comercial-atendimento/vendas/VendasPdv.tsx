import {
  exportVendasQuerySchema,
  listVendasQuerySchema,
  VENDA_ROTULO_STATUS,
  vendaPageSchema,
  type Venda,
} from '@torres/shared';
import { DataGrid } from '@/components/shared/data-grid/DataGrid';
import type { ColunaGrid, ExportacaoGrid, FiltroStatus } from '@/components/shared/data-grid/tipos';
import { StatusBadge, type TomStatus } from '@/components/shared/StatusBadge';
import { formatarMoeda } from '@/lib/forms/mascaras';
import { formatarData } from '@/lib/formatar';
import { URL_VENDAS } from './use-vendas';

const STATUS: FiltroStatus = {
  rotuloTodos: 'Todas',
  opcoes: [
    { valor: 'orcamento-aprovado', rotulo: 'Orç. Aprovados' },
    { valor: 'finalizada', rotulo: 'Finalizada' },
    { valor: 'cancelada', rotulo: 'Cancelada' },
  ],
};

const TOM_STATUS: Record<Venda['status'], TomStatus> = {
  ORCAMENTO_APROVADO: 'info',
  FINALIZADA: 'sucesso',
  CANCELADA: 'perigo',
};

const EXPORTACAO: ExportacaoGrid = {
  permissao: 'comercial-atendimento.vendas-pdv.exportar',
  nomeArquivo: 'vendas-pdv',
  schema: exportVendasQuerySchema,
};

const COLUNAS: ColunaGrid<Venda>[] = [
  { id: 'id', titulo: '#', ordenavel: true, exportavel: true, celula: (v) => v.numero },
  {
    id: 'data',
    titulo: 'Data',
    ordenavel: true,
    exportavel: true,
    celula: (v) => formatarData(v.data),
  },
  { id: 'cliente', titulo: 'Cliente', ordenavel: true, exportavel: true },
  {
    id: 'pagamento',
    titulo: 'Pagamento',
    ordenavel: true,
    exportavel: true,
    celula: (v) => v.formaPagamento ?? '-',
  },
  {
    id: 'total',
    titulo: 'Total',
    ordenavel: true,
    exportavel: true,
    celula: (v) => formatarMoeda(Number(v.total)),
  },
  {
    id: 'status',
    titulo: 'Status',
    ordenavel: true,
    exportavel: true,
    celula: (v) => (
      <StatusBadge tom={TOM_STATUS[v.status]}>{VENDA_ROTULO_STATUS[v.status]}</StatusBadge>
    ),
  },
];

/** Aba "Vendas (PDV)": chips Todas / Orç. Aprovados / Finalizada / Cancelada e busca por cliente. */
export function VendasPdv() {
  return (
    <DataGrid
      url={URL_VENDAS}
      schema={vendaPageSchema}
      querySchema={listVendasQuerySchema}
      colunas={COLUNAS}
      busca="Buscar vendas..."
      status={STATUS}
      exportacao={EXPORTACAO}
      mensagemVazio="Nenhuma venda encontrada."
    />
  );
}
