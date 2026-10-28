import {
  exportFornecedoresQuerySchema,
  fornecedorPageSchema,
  listFornecedoresQuerySchema,
  type Fornecedor,
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
import { formatarMascara } from '@/lib/forms/mascaras';
import { ModalFornecedor } from './ModalFornecedor';
import { URL_FORNECEDORES, useExcluirFornecedor } from './use-fornecedores';

const STATUS: FiltroStatus = {
  opcoes: [
    { valor: 'ativo', rotulo: 'Ativo' },
    { valor: 'inativo', rotulo: 'Inativo' },
  ],
};

const EXPORTACAO: ExportacaoGrid = {
  permissao: 'compras-estoque.fornecedores.exportar',
  nomeArquivo: 'fornecedores',
  schema: exportFornecedoresQuerySchema,
};

/** CPF (11 dígitos) ou CNPJ (14), conforme o que foi cadastrado. */
function documentoFormatado(documento: string | null): string {
  if (!documento) return '-';
  return formatarMascara('cpf-cnpj', documento);
}

function cidadeUf(f: Fornecedor): string {
  return [f.cidade, f.uf].filter(Boolean).join('/') || '-';
}

const COLUNAS: ColunaGrid<Fornecedor>[] = [
  { id: 'nome', titulo: 'Nome', ordenavel: true, exportavel: true, ocultavel: false },
  {
    id: 'documento',
    titulo: 'CNPJ/CPF',
    ordenavel: true,
    exportavel: true,
    celula: (f) => <span className="font-mono text-xs">{documentoFormatado(f.documento)}</span>,
  },
  {
    id: 'email',
    titulo: 'Email',
    ordenavel: true,
    exportavel: true,
    celula: (f) => f.email ?? '-',
  },
  {
    id: 'telefone',
    titulo: 'Telefone',
    ordenavel: true,
    exportavel: true,
    celula: (f) => (f.telefone ? formatarMascara('telefone', f.telefone) : '-'),
  },
  {
    id: 'cidade',
    titulo: 'Cidade/UF',
    ordenavel: true,
    exportavel: true,
    celula: cidadeUf,
  },
  {
    id: 'status',
    titulo: 'Status',
    ordenavel: true,
    exportavel: true,
    celula: (f) => (
      <StatusBadge tom={f.ativo ? 'sucesso' : 'perigo'}>
        {f.ativo ? 'Ativo' : 'Inativo'}
      </StatusBadge>
    ),
  },
];

/**
 * Fornecedores (`/fornecedores`, docs/inventario/telas/compras-estoque-fornecedores.md):
 * cadastro dos fornecedores e parceiros comerciais.
 */
export default function FornecedoresPage() {
  const [criando, setCriando] = useState(false);
  const [editando, setEditando] = useState<Fornecedor | null>(null);
  const [excluindo, setExcluindo] = useState<Fornecedor | null>(null);
  const excluir = useExcluirFornecedor();

  return (
    <div className="grid gap-6">
      <PageHeader
        titulo="Fornecedores"
        descricao="Gerencie seus fornecedores e parceiros comerciais."
        acoes={
          <SePermitido permissao="compras-estoque.fornecedores.criar">
            <Button type="button" onClick={() => setCriando(true)}>
              <PlusIcon aria-hidden />
              Novo Fornecedor
            </Button>
          </SePermitido>
        }
      />
      <DataGrid
        url={URL_FORNECEDORES}
        schema={fornecedorPageSchema}
        querySchema={listFornecedoresQuerySchema}
        colunas={COLUNAS}
        busca="Buscar fornecedores..."
        status={STATUS}
        exportacao={EXPORTACAO}
        mensagemVazio="Nenhum fornecedor encontrado."
        acoes={(fornecedor) => [
          {
            rotulo: 'Editar',
            icone: PencilIcon,
            permissao: 'compras-estoque.fornecedores.editar',
            onSelect: () => setEditando(fornecedor),
          },
          {
            rotulo: 'Excluir',
            icone: Trash2Icon,
            destrutiva: true,
            permissao: 'compras-estoque.fornecedores.excluir',
            onSelect: () => setExcluindo(fornecedor),
          },
        ]}
      />
      {criando && <ModalFornecedor onFechar={() => setCriando(false)} />}
      {editando && <ModalFornecedor fornecedor={editando} onFechar={() => setEditando(null)} />}
      <ConfirmDialog
        aberto={excluindo !== null}
        onAbertoChange={(aberto) => aberto || setExcluindo(null)}
        titulo="Excluir Fornecedor"
        descricao={`Tem certeza que deseja excluir o fornecedor "${excluindo?.nome ?? ''}"? Esta ação não pode ser desfeita.`}
        rotuloConfirmar="Excluir"
        onConfirmar={() => (excluindo ? excluir.mutateAsync(excluindo.id) : undefined)}
      />
    </div>
  );
}
