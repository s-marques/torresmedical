import { exportLotesQuerySchema, listLotesQuerySchema, lotePageSchema } from '@torres/shared';
import { PlusIcon } from 'lucide-react';
import { useState } from 'react';
import { DataGrid } from '@/components/shared/data-grid/DataGrid';
import type { ExportacaoGrid, FiltroGrid } from '@/components/shared/data-grid/tipos';
import { PageHeader } from '@/components/shared/PageHeader';
import { SePermitido } from '@/components/shared/SePermitido';
import { Button } from '@/components/ui/button';
import { CardsLotes } from './CardsLotes';
import { COLUNAS_LOTES } from './colunas';
import { ModalNovoLote } from './ModalNovoLote';
import { URL_LOTES } from './use-lotes';

/** "Todos os produtos" e "Apenas com saldo" (print principal). */
const FILTROS: readonly FiltroGrid[] = [
  {
    tipo: 'entidade',
    parametro: 'produtoId',
    rotulo: 'Produto',
    entidade: 'produtos',
    filtros: { tipo: 'produto' },
    rotuloTodos: 'Todos os produtos',
  },
  { tipo: 'checkbox', parametro: 'comSaldo', rotulo: 'Apenas com saldo' },
];

const EXPORTACAO: ExportacaoGrid = {
  permissao: 'compras-estoque.lotes-validade.exportar',
  nomeArquivo: 'lotes',
  schema: exportLotesQuerySchema,
};

/**
 * Lotes / Validade (`/lotes`, docs/inventario/telas/compras-estoque-lotes-validade.md): cards de
 * vencimento e estoque mínimo, grid de lotes e o modal "Novo Lote". O lote não altera o saldo do
 * produto (decisão do dev na issue #22).
 */
export default function LotesValidadePage() {
  const [novo, setNovo] = useState(false);

  return (
    <div className="grid gap-6">
      <PageHeader
        titulo="Controle de Lotes"
        descricao="Gerencie lotes, validades e rastreabilidade de produtos."
        acoes={
          <SePermitido permissao="compras-estoque.lotes-validade.criar">
            <Button type="button" onClick={() => setNovo(true)}>
              <PlusIcon aria-hidden />
              Novo Lote
            </Button>
          </SePermitido>
        }
      />

      <CardsLotes />

      <DataGrid
        url={URL_LOTES}
        schema={lotePageSchema}
        querySchema={listLotesQuerySchema}
        colunas={COLUNAS_LOTES}
        busca="Buscar lotes..."
        filtros={FILTROS}
        exportacao={EXPORTACAO}
        mensagemVazio="Nenhum lote encontrado."
        tamanhosPagina={[10, 20, 50]}
      />

      {novo && <ModalNovoLote onFechar={() => setNovo(false)} />}
    </div>
  );
}
