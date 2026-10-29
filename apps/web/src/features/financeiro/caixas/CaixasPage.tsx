import {
  caixaPageSchema,
  CAIXA_ROTULO_STATUS,
  exportCaixasQuerySchema,
  listCaixasQuerySchema,
  type Caixa,
} from '@torres/shared';
import { HandCoinsIcon, PlusIcon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { DataGrid } from '@/components/shared/data-grid/DataGrid';
import type { ColunaGrid, ExportacaoGrid, FiltroStatus } from '@/components/shared/data-grid/tipos';
import { EmptyState } from '@/components/shared/EmptyState';
import { PageHeader } from '@/components/shared/PageHeader';
import { SePermitido } from '@/components/shared/SePermitido';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Button } from '@/components/ui/button';
import { formatarMoeda } from '@/lib/forms/mascaras';
import { formatarDataHora } from '@/lib/formatar';
import { ModalAbrirCaixa } from './ModalAbrirCaixa';
import { URL_CAIXAS } from './use-caixas';

const STATUS: FiltroStatus = {
  opcoes: [
    { valor: 'aberto', rotulo: 'Aberto' },
    { valor: 'fechado', rotulo: 'Fechado' },
  ],
};

const EXPORTACAO: ExportacaoGrid = {
  permissao: 'financeiro.caixas.exportar',
  nomeArquivo: 'caixas',
  schema: exportCaixasQuerySchema,
};

const moeda = (valor: string | null) => (valor === null ? '-' : formatarMoeda(Number(valor)));

const COLUNAS: ColunaGrid<Caixa>[] = [
  { id: 'id', titulo: '#', ordenavel: true, exportavel: true, celula: (c) => c.numero },
  { id: 'nome', titulo: 'Nome', ordenavel: true, exportavel: true },
  { id: 'operador', titulo: 'Operador', ordenavel: true, exportavel: true },
  {
    id: 'dataAbertura',
    titulo: 'Abertura',
    ordenavel: true,
    exportavel: true,
    celula: (c) => formatarDataHora(c.dataAbertura),
  },
  {
    id: 'dataFechamento',
    titulo: 'Fechamento',
    ordenavel: true,
    exportavel: true,
    celula: (c) => formatarDataHora(c.dataFechamento),
  },
  {
    id: 'valorAbertura',
    titulo: 'Vl. Abertura',
    ordenavel: true,
    exportavel: true,
    celula: (c) => moeda(c.valorAbertura),
  },
  {
    id: 'valorFechamento',
    titulo: 'Vl. Fechamento',
    ordenavel: true,
    exportavel: true,
    celula: (c) => moeda(c.valorFechamento),
  },
  {
    id: 'quebra',
    titulo: 'Quebra',
    ordenavel: true,
    exportavel: true,
    celula: (c) => moeda(c.quebra),
  },
  {
    id: 'status',
    titulo: 'Status',
    ordenavel: true,
    exportavel: true,
    celula: (c) => (
      <StatusBadge tom={c.status === 'ABERTO' ? 'sucesso' : 'neutro'}>
        {CAIXA_ROTULO_STATUS[c.status]}
      </StatusBadge>
    ),
  },
];

/**
 * Caixas (`/caixas`, docs/inventario/telas/financeiro-caixas.md): abertura e consulta dos
 * caixas. "Aguardando pagamento" ainda não tem origem de dados (vendas e consultas), então
 * "Receber" só confirma o recebimento com a mensagem; a integração fica para quando existirem.
 */
export default function CaixasPage() {
  const [abrindo, setAbrindo] = useState(false);

  return (
    <div className="grid gap-6">
      <PageHeader
        titulo="Caixas"
        descricao="Gerencie a abertura, fechamento e sangrias de caixa."
        acoes={
          <SePermitido permissao="financeiro.caixas.criar">
            <Button type="button" onClick={() => setAbrindo(true)}>
              <PlusIcon aria-hidden />
              Abrir Caixa
            </Button>
          </SePermitido>
        }
      />
      <DataGrid
        url={URL_CAIXAS}
        schema={caixaPageSchema}
        querySchema={listCaixasQuerySchema}
        colunas={COLUNAS}
        busca="Buscar caixas..."
        status={STATUS}
        exportacao={EXPORTACAO}
        mensagemVazio="Nenhum caixa encontrado."
      />
      <section aria-labelledby="aguardando-pagamento" className="grid gap-3 rounded-lg border p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 id="aguardando-pagamento" className="text-base font-semibold">
              Aguardando pagamento
            </h2>
            <p className="text-sm text-muted-foreground">
              Vendas e consultas já fechadas que ainda não foram recebidas em nenhum caixa.
            </p>
          </div>
          <SePermitido permissao="financeiro.caixas.editar">
            <Button
              type="button"
              variant="outline"
              onClick={() => toast.success('Recebimento realizado com sucesso.')}
            >
              <HandCoinsIcon aria-hidden />
              Receber
            </Button>
          </SePermitido>
        </div>
        <EmptyState titulo="Nenhum item aguardando pagamento." />
      </section>
      {abrindo && <ModalAbrirCaixa onFechar={() => setAbrindo(false)} />}
    </div>
  );
}
