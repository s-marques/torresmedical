import type { Lote } from '@torres/shared';
import type { ColunaGrid } from '@/components/shared/data-grid/tipos';
import { formatarData } from '@/lib/formatar';
import { formatarQuantidade } from '../estoque/formatar';
import { StatusLote } from './StatusLote';

/**
 * Colunas do print principal: Produto, Lote, Quantidade, Vencimento e Status, todas ordenáveis e
 * exportáveis (o menu "Colunas" do print lista as cinco).
 */
export const COLUNAS_LOTES: ColunaGrid<Lote>[] = [
  {
    id: 'produto',
    titulo: 'Produto',
    ordenavel: true,
    exportavel: true,
    ocultavel: false,
    celula: (l) => <span className="font-medium">{l.produtoNome}</span>,
  },
  { id: 'lote', titulo: 'Lote', ordenavel: true, exportavel: true, celula: (l) => l.numero },
  {
    id: 'quantidade',
    titulo: 'Quantidade',
    ordenavel: true,
    exportavel: true,
    className: 'tabular-nums',
    celula: (l) => formatarQuantidade(l.quantidade),
  },
  {
    id: 'vencimento',
    titulo: 'Vencimento',
    ordenavel: true,
    exportavel: true,
    celula: (l) => formatarData(l.dataVencimento),
  },
  {
    id: 'status',
    titulo: 'Status',
    ordenavel: true,
    exportavel: true,
    celula: (l) => <StatusLote status={l.status} />,
  },
];
