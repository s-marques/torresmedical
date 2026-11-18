import { baixaInsumoPageSchema, listBaixasInsumosQuerySchema } from '@torres/shared';
import { PlusIcon } from 'lucide-react';
import { useState } from 'react';
import { DataGrid } from '@/components/shared/data-grid/DataGrid';
import type { FiltroGrid } from '@/components/shared/data-grid/tipos';
import { PageHeader } from '@/components/shared/PageHeader';
import { SePermitido } from '@/components/shared/SePermitido';
import { Button } from '@/components/ui/button';
import { COLUNAS_BAIXAS_INSUMOS } from './colunas';
import { ModalBaixaInsumo } from './ModalBaixaInsumo';
import { URL_BAIXAS_INSUMOS } from './use-baixas-insumos';

/** Filtros Data Início e Data Fim (Filtrar e Limpar do print principal). */
const FILTROS: readonly FiltroGrid[] = [
  {
    tipo: 'periodo',
    rotulo: 'Período',
    parametroDe: 'dataInicio',
    parametroAte: 'dataFim',
  },
];

/**
 * Baixa de Insumos (`/baixa-insumos`, docs/inventario/telas/compras-estoque-baixa-de-insumos.md):
 * grid das baixas com filtro de período e o modal "Nova Baixa". Cada baixa registra o responsável
 * e subtrai o saldo dos insumos (requisito do cliente, issue #17).
 */
export default function BaixasInsumosPage() {
  const [nova, setNova] = useState(false);

  return (
    <div className="grid gap-6">
      <PageHeader
        titulo="Baixa de Insumos"
        descricao="Controle de consumo de insumos por atendimento"
        acoes={
          <SePermitido permissao="compras-estoque.baixa-insumos.criar">
            <Button type="button" onClick={() => setNova(true)}>
              <PlusIcon aria-hidden />
              Nova Baixa
            </Button>
          </SePermitido>
        }
      />

      <DataGrid
        url={URL_BAIXAS_INSUMOS}
        schema={baixaInsumoPageSchema}
        querySchema={listBaixasInsumosQuerySchema}
        colunas={COLUNAS_BAIXAS_INSUMOS}
        busca={false}
        filtros={FILTROS}
        mensagemVazio="Nenhuma baixa registrada."
        tamanhosPagina={[10, 20, 50]}
      />

      {nova && <ModalBaixaInsumo onFechar={() => setNova(false)} />}
    </div>
  );
}
