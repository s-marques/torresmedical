import {
  categoriaPageSchema,
  exportCategoriasQuerySchema,
  listCategoriasQuerySchema,
  type Categoria,
} from '@torres/shared';
import { PencilIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import { useState } from 'react';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { DataGrid } from '@/components/shared/data-grid/DataGrid';
import type { ColunaGrid, ExportacaoGrid, FiltroStatus } from '@/components/shared/data-grid/tipos';
import { PageHeader } from '@/components/shared/PageHeader';
import { SePermitido } from '@/components/shared/SePermitido';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Button } from '@/components/ui/button';
import { ModalCategoria } from './ModalCategoria';
import { OPCOES_TIPO } from './opcoes-tipo';
import { BolinhaCor } from './SeletorCor';
import { URL_CATEGORIAS, useExcluirCategoria } from './use-categorias';

/** Chips Todas/Produtos/Serviços: o filtro `tipo` da listagem. */
const FILTRO_TIPO: FiltroStatus = {
  parametro: 'tipo',
  opcoes: [
    { valor: 'produto', rotulo: 'Produtos' },
    { valor: 'servico', rotulo: 'Serviços' },
  ],
};

const EXPORTACAO: ExportacaoGrid = {
  permissao: 'compras-estoque.categorias.exportar',
  nomeArquivo: 'categorias',
  schema: exportCategoriasQuerySchema,
};

const ROTULO_TIPO = {
  PRODUTO: OPCOES_TIPO[0].rotulo,
  SERVICO: OPCOES_TIPO[1].rotulo,
} as const;

const COLUNAS: ColunaGrid<Categoria>[] = [
  { id: 'nome', titulo: 'Nome', ordenavel: true, exportavel: true, ocultavel: false },
  {
    id: 'tipo',
    titulo: 'Tipo',
    ordenavel: true,
    exportavel: true,
    celula: (categoria) => (
      <StatusBadge tom={categoria.tipo === 'SERVICO' ? 'sucesso' : 'info'}>
        {ROTULO_TIPO[categoria.tipo]}
      </StatusBadge>
    ),
  },
  {
    id: 'cor',
    titulo: 'Cor',
    exportavel: true,
    celula: (categoria) =>
      categoria.cor ? <BolinhaCor cor={categoria.cor} className="size-4" /> : '-',
  },
  { id: 'descricao', titulo: 'Descrição', ordenavel: true, exportavel: true },
];

/**
 * Categorias (`/categorias`, docs/inventario/telas/compras-estoque-categorias.md): agrupam
 * os produtos e serviços do catálogo.
 */
export default function CategoriasPage() {
  const [criando, setCriando] = useState(false);
  const [editando, setEditando] = useState<Categoria | null>(null);
  const [excluindo, setExcluindo] = useState<Categoria | null>(null);
  const excluir = useExcluirCategoria();

  return (
    <div className="grid gap-6">
      <PageHeader
        titulo="Categorias"
        descricao="Gerencie as categorias de produtos e serviços."
        acoes={
          <SePermitido permissao="compras-estoque.categorias.criar">
            <Button type="button" onClick={() => setCriando(true)}>
              <PlusIcon aria-hidden />
              Nova Categoria
            </Button>
          </SePermitido>
        }
      />
      <DataGrid
        url={URL_CATEGORIAS}
        schema={categoriaPageSchema}
        querySchema={listCategoriasQuerySchema}
        colunas={COLUNAS}
        busca="Buscar categorias..."
        status={FILTRO_TIPO}
        exportacao={EXPORTACAO}
        mensagemVazio="Nenhuma categoria encontrada."
        acoes={(categoria) => [
          {
            rotulo: 'Editar',
            icone: PencilIcon,
            permissao: 'compras-estoque.categorias.editar',
            onSelect: () => setEditando(categoria),
          },
          {
            rotulo: 'Excluir',
            icone: Trash2Icon,
            destrutiva: true,
            permissao: 'compras-estoque.categorias.excluir',
            onSelect: () => setExcluindo(categoria),
          },
        ]}
      />
      {criando && <ModalCategoria onFechar={() => setCriando(false)} />}
      {editando && <ModalCategoria categoria={editando} onFechar={() => setEditando(null)} />}
      <ConfirmDialog
        aberto={excluindo !== null}
        onAbertoChange={(aberto) => aberto || setExcluindo(null)}
        titulo="Excluir Categoria"
        descricao={`Tem certeza que deseja excluir a categoria "${excluindo?.nome ?? ''}"? Esta ação não pode ser desfeita.`}
        rotuloConfirmar="Excluir"
        onConfirmar={() => (excluindo ? excluir.mutateAsync(excluindo.id) : undefined)}
      />
    </div>
  );
}
