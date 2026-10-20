import {
  exportProdutosQuerySchema,
  listProdutosQuerySchema,
  PRODUTO_TIPO_ROTULOS,
  produtoPageSchema,
  type Produto,
} from '@torres/shared';
import { PackageIcon, PencilIcon, PlusIcon, RulerIcon, TagsIcon, Trash2Icon } from 'lucide-react';
import { useState } from 'react';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { DataGrid } from '@/components/shared/data-grid/DataGrid';
import type { ColunaGrid, ExportacaoGrid, FiltroStatus } from '@/components/shared/data-grid/tipos';
import { PageHeader } from '@/components/shared/PageHeader';
import { SePermitido } from '@/components/shared/SePermitido';
import { StatusAtivo } from '@/components/shared/StatusBadge';
import { Button } from '@/components/ui/button';
import { ModalCategoria } from '../categorias/ModalCategoria';
import { ModalProduto } from './ModalProduto';
import { ModalUnidadesMedida } from './ModalUnidadesMedida';
import { tipoDoFormulario } from './opcoes-tipo';
import { URL_PRODUTOS, useExcluirProduto } from './use-produtos';

/** Chips Todos/Produtos/Serviços: o filtro `tipo` da listagem. Produtos inclui Revenda e Uso e Consumo. */
const FILTRO_TIPO: FiltroStatus = {
  parametro: 'tipo',
  opcoes: [
    { valor: 'produto', rotulo: 'Produtos' },
    { valor: 'servico', rotulo: 'Serviços' },
  ],
};

const EXPORTACAO: ExportacaoGrid = {
  permissao: 'compras-estoque.produtos-servicos.exportar',
  nomeArquivo: 'produtos-servicos',
  schema: exportProdutosQuerySchema,
};

const MOEDA = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const QUANTIDADE = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 });

function moeda(valor: string | null): string {
  return valor === null ? '-' : MOEDA.format(Number(valor));
}

const COLUNAS: ColunaGrid<Produto>[] = [
  {
    id: 'nome',
    titulo: 'Produto/Serviço',
    ordenavel: true,
    exportavel: true,
    ocultavel: false,
    celula: (produto) => (
      <div className="grid">
        <span className="font-medium">{produto.nome}</span>
        <span className="text-xs text-muted-foreground">
          {PRODUTO_TIPO_ROTULOS[tipoDoFormulario(produto.tipo)]}
        </span>
      </div>
    ),
  },
  {
    id: 'codigo',
    titulo: 'Código',
    ordenavel: true,
    exportavel: true,
    celula: (produto) => produto.sku ?? produto.codigoBarras ?? '-',
  },
  {
    id: 'precoVenda',
    titulo: 'Preço Venda',
    ordenavel: true,
    exportavel: true,
    celula: (produto) => moeda(produto.precoVenda),
  },
  {
    id: 'precoCusto',
    titulo: 'Custo',
    ordenavel: true,
    exportavel: true,
    celula: (produto) => moeda(produto.precoCusto),
  },
  {
    id: 'estoqueAtual',
    titulo: 'Estoque',
    ordenavel: true,
    exportavel: true,
    celula: (produto) => QUANTIDADE.format(Number(produto.estoqueAtual)),
  },
  {
    id: 'ativo',
    titulo: 'Status',
    ordenavel: true,
    exportavel: true,
    celula: (produto) => <StatusAtivo ativo={produto.ativo} />,
  },
];

/**
 * Produtos/Serviços (`/produtos`, docs/inventario/telas/compras-estoque-produtos-servicos.md):
 * catálogo da clínica. O saldo da coluna Estoque é movimentado pela tela Estoque (#20).
 */
export default function ProdutosServicosPage() {
  const [criando, setCriando] = useState(false);
  const [editando, setEditando] = useState<Produto | null>(null);
  const [excluindo, setExcluindo] = useState<Produto | null>(null);
  const [novaCategoria, setNovaCategoria] = useState(false);
  const [unidades, setUnidades] = useState(false);
  const excluir = useExcluirProduto();

  return (
    <div className="grid gap-6">
      <PageHeader
        titulo="Produtos e Serviços"
        descricao="Gerencie o catálogo da clínica."
        acoes={
          <>
            <SePermitido permissao="compras-estoque.categorias.criar">
              <Button type="button" variant="outline" onClick={() => setNovaCategoria(true)}>
                <TagsIcon aria-hidden />
                Nova Categoria
              </Button>
            </SePermitido>
            <SePermitido permissao="compras-estoque.produtos-servicos.criar">
              <Button type="button" variant="outline" onClick={() => setUnidades(true)}>
                <RulerIcon aria-hidden />
                Unidades
              </Button>
              <Button type="button" onClick={() => setCriando(true)}>
                <PlusIcon aria-hidden />
                Novo Produto
              </Button>
            </SePermitido>
          </>
        }
      />
      <DataGrid
        url={URL_PRODUTOS}
        schema={produtoPageSchema}
        querySchema={listProdutosQuerySchema}
        colunas={COLUNAS}
        busca="Buscar produtos por nome, SKU ou código de barras..."
        status={FILTRO_TIPO}
        exportacao={EXPORTACAO}
        mensagemVazio="Nenhum produto ou serviço encontrado."
        acoes={(produto) => [
          {
            rotulo: 'Editar',
            icone: PencilIcon,
            permissao: 'compras-estoque.produtos-servicos.editar',
            onSelect: () => setEditando(produto),
          },
          {
            // O modal e as movimentações são da tela Estoque (#20).
            rotulo: 'Movimentar Estoque',
            icone: PackageIcon,
            permissao: 'compras-estoque.estoque.editar',
            desabilitada: true,
            onSelect: () => undefined,
          },
          {
            rotulo: 'Excluir',
            icone: Trash2Icon,
            destrutiva: true,
            permissao: 'compras-estoque.produtos-servicos.excluir',
            onSelect: () => setExcluindo(produto),
          },
        ]}
      />
      {criando && <ModalProduto onFechar={() => setCriando(false)} />}
      {editando && <ModalProduto produto={editando} onFechar={() => setEditando(null)} />}
      {novaCategoria && <ModalCategoria onFechar={() => setNovaCategoria(false)} />}
      {unidades && <ModalUnidadesMedida onFechar={() => setUnidades(false)} />}
      <ConfirmDialog
        aberto={excluindo !== null}
        onAbertoChange={(aberto) => aberto || setExcluindo(null)}
        titulo="Excluir Produto"
        descricao={`Tem certeza que deseja excluir "${excluindo?.nome ?? ''}"?`}
        rotuloConfirmar="Excluir"
        onConfirmar={() => (excluindo ? excluir.mutateAsync(excluindo.id) : undefined)}
      />
    </div>
  );
}
