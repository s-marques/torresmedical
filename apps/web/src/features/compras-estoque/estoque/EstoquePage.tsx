import {
  exportSugestaoQuerySchema,
  listMovimentacoesQuerySchema,
  listPosicaoQuerySchema,
  listSugestaoQuerySchema,
  movimentacaoEstoquePageSchema,
  posicaoEstoquePageSchema,
  PRIORIDADES_SUGESTAO,
  ROTULO_ESTOQUE_STATUS,
  ROTULO_PRIORIDADE_SUGESTAO,
  ROTULO_TIPO_MOVIMENTACAO,
  sugestaoCompraPageSchema,
  TIPOS_MOVIMENTACAO,
  ESTOQUE_STATUS_FILTRO,
} from '@torres/shared';
import { CircleArrowDownIcon, CircleArrowUpIcon, RefreshCwIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { DataGrid } from '@/components/shared/data-grid/DataGrid';
import type { ExportacaoGrid, FiltroGrid, FiltroStatus } from '@/components/shared/data-grid/tipos';
import { PageHeader } from '@/components/shared/PageHeader';
import { SePermitido } from '@/components/shared/SePermitido';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useLookup } from '@/lib/api/lookups';
import { AbaAjustes } from './AbaAjustes';
import { AbaAlertas } from './AbaAlertas';
import { CardsResumo } from './CardsResumo';
import { COLUNAS_MOVIMENTACOES, COLUNAS_POSICAO, COLUNAS_SUGESTAO } from './colunas';
import { ModalEntrada } from './ModalEntrada';
import { ModalSaida } from './ModalSaida';
import { URL_MOVIMENTACOES, URL_POSICAO, URL_SUGESTAO } from './use-estoque';

const STATUS_POSICAO: FiltroStatus = {
  opcoes: ESTOQUE_STATUS_FILTRO.map((valor) => ({ valor, rotulo: ROTULO_ESTOQUE_STATUS[valor] })),
};

const TIPOS: FiltroStatus = {
  parametro: 'tipo',
  opcoes: TIPOS_MOVIMENTACAO.map((valor) => ({ valor, rotulo: ROTULO_TIPO_MOVIMENTACAO[valor] })),
};

const PRIORIDADES: FiltroStatus = {
  parametro: 'prioridade',
  opcoes: PRIORIDADES_SUGESTAO.map((valor) => ({
    valor,
    rotulo: ROTULO_PRIORIDADE_SUGESTAO[valor],
  })),
};

const PERIODO: readonly FiltroGrid[] = [
  { tipo: 'periodo', rotulo: 'Período', parametroDe: 'de', parametroAte: 'ate' },
];

const EXPORTACAO_SUGESTAO: ExportacaoGrid = {
  permissao: 'compras-estoque.estoque.exportar',
  nomeArquivo: 'sugestao-compra',
  schema: exportSugestaoQuerySchema,
};

type Aba = 'posicao' | 'movimentacoes' | 'ajustes' | 'alertas' | 'sugestao';

/** Filtro "Todas categorias" com as categorias de produto. */
function useFiltroCategoria(): readonly FiltroGrid[] {
  const categorias = useLookup('categorias', '', { filtros: { tipo: 'produto' } });
  return useMemo(
    () => [
      {
        tipo: 'select',
        parametro: 'categoriaId',
        rotulo: 'Todas categorias',
        opcoes: (categorias.data?.data ?? []).map((c) => ({ valor: c.id, rotulo: c.label })),
      },
    ],
    [categorias.data],
  );
}

/**
 * Estoque (`/estoque`, docs/inventario/telas/compras-estoque-estoque.md): cards de resumo e as
 * abas Posição, Movimentações, Ajustes, Alertas e Sugestão. O botão "Ajuste" abre a aba Ajustes,
 * como no sistema atual.
 */
export default function EstoquePage() {
  const [aba, setAba] = useState<Aba>('posicao');
  const [modal, setModal] = useState<'entrada' | 'saida' | null>(null);
  const filtroCategoria = useFiltroCategoria();

  return (
    <div className="grid gap-6">
      <PageHeader
        titulo="Estoque"
        descricao="Gerenciamento de estoque e inventário."
        acoes={
          <>
            <SePermitido permissao="compras-estoque.estoque.criar">
              <Button
                type="button"
                className="bg-emerald-600 text-white hover:bg-emerald-700"
                onClick={() => setModal('entrada')}
              >
                <CircleArrowUpIcon aria-hidden />
                Entrada
              </Button>
              <Button type="button" variant="destructive" onClick={() => setModal('saida')}>
                <CircleArrowDownIcon aria-hidden />
                Saída
              </Button>
            </SePermitido>
            <SePermitido permissao="compras-estoque.estoque.editar">
              <Button type="button" variant="outline" onClick={() => setAba('ajustes')}>
                <RefreshCwIcon aria-hidden />
                Ajuste
              </Button>
            </SePermitido>
          </>
        }
      />

      <CardsResumo />

      <Tabs value={aba} onValueChange={(valor) => setAba(valor as Aba)}>
        <TabsList>
          <TabsTrigger value="posicao">Posição</TabsTrigger>
          <TabsTrigger value="movimentacoes">Movimentações</TabsTrigger>
          <SePermitido permissao="compras-estoque.estoque.editar">
            <TabsTrigger value="ajustes">Ajustes</TabsTrigger>
          </SePermitido>
          <TabsTrigger value="alertas">Alertas</TabsTrigger>
          <TabsTrigger value="sugestao">Sugestão</TabsTrigger>
        </TabsList>

        <TabsContent value="posicao">
          <DataGrid
            url={URL_POSICAO}
            schema={posicaoEstoquePageSchema}
            querySchema={listPosicaoQuerySchema}
            colunas={COLUNAS_POSICAO}
            busca="Buscar produto..."
            status={STATUS_POSICAO}
            filtros={filtroCategoria}
            mensagemVazio="Nenhum produto encontrado."
            tamanhosPagina={[20, 50, 100]}
          />
        </TabsContent>

        <TabsContent value="movimentacoes">
          <DataGrid
            url={URL_MOVIMENTACOES}
            schema={movimentacaoEstoquePageSchema}
            querySchema={listMovimentacoesQuerySchema}
            colunas={COLUNAS_MOVIMENTACOES}
            busca="Buscar produto por nome ou SKU..."
            status={TIPOS}
            filtros={PERIODO}
            mensagemVazio="Nenhuma movimentação encontrada."
            tamanhosPagina={[20, 50, 100]}
          />
        </TabsContent>

        <TabsContent value="ajustes">
          <AbaAjustes />
        </TabsContent>

        <TabsContent value="alertas">
          <AbaAlertas />
        </TabsContent>

        <TabsContent value="sugestao">
          <DataGrid
            url={URL_SUGESTAO}
            schema={sugestaoCompraPageSchema}
            querySchema={listSugestaoQuerySchema}
            colunas={COLUNAS_SUGESTAO}
            busca="Buscar produto..."
            status={PRIORIDADES}
            filtros={filtroCategoria}
            exportacao={EXPORTACAO_SUGESTAO}
            mensagemVazio="Nenhum produto para sugerir."
            tamanhosPagina={[20, 50, 100]}
          />
        </TabsContent>
      </Tabs>

      {modal === 'entrada' && <ModalEntrada onFechar={() => setModal(null)} />}
      {modal === 'saida' && <ModalSaida onFechar={() => setModal(null)} />}
    </div>
  );
}
