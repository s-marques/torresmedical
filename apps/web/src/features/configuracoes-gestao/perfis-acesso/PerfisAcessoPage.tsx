import {
  exportPerfisQuerySchema,
  listPerfisQuerySchema,
  perfilPageSchema,
  TOTAL_PAGINAS_SISTEMA,
  type Perfil,
} from '@torres/shared';
import { PencilIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import { useState } from 'react';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { DataGrid } from '@/components/shared/data-grid/DataGrid';
import type { ColunaGrid, ExportacaoGrid, FiltroStatus } from '@/components/shared/data-grid/tipos';
import { PageHeader } from '@/components/shared/PageHeader';
import { SePermitido } from '@/components/shared/SePermitido';
import { StatusAtivo } from '@/components/shared/StatusBadge';
import { Button } from '@/components/ui/button';
import { ModalPerfil } from './ModalPerfil';
import { URL_PERFIS_ACESSO, useExcluirPerfil } from './use-perfis-acesso';

const STATUS: FiltroStatus = {
  opcoes: [
    { valor: 'ativo', rotulo: 'Ativo' },
    { valor: 'inativo', rotulo: 'Inativo' },
  ],
};

const EXPORTACAO: ExportacaoGrid = {
  permissao: 'configuracoes-gestao.perfis-acesso.exportar',
  nomeArquivo: 'perfis',
  schema: exportPerfisQuerySchema,
};

const COLUNAS: ColunaGrid<Perfil>[] = [
  {
    id: 'nome',
    titulo: 'Nome',
    ordenavel: true,
    exportavel: true,
    ocultavel: false,
    celula: (perfil) => (
      <div>
        <div className="font-medium">{perfil.nome}</div>
        {perfil.descricao && (
          <div className="text-xs text-muted-foreground">{perfil.descricao}</div>
        )}
      </div>
    ),
  },
  {
    id: 'paginasPermitidas',
    titulo: 'Páginas',
    exportavel: 'paginas',
    celula: (perfil) => `${perfil.paginasPermitidas.length} de ${TOTAL_PAGINAS_SISTEMA} páginas`,
  },
  {
    id: 'ativo',
    titulo: 'Status',
    exportavel: 'status',
    celula: (perfil) => <StatusAtivo ativo={perfil.ativo} />,
  },
];

/**
 * Perfis de Acesso (`/perfis`, docs/inventario/telas/configuracoes-gestao-perfis-de-acesso.md):
 * o conjunto de páginas que um perfil libera para os seus usuários.
 */
export default function PerfisAcessoPage() {
  const [criando, setCriando] = useState(false);
  const [editando, setEditando] = useState<Perfil | null>(null);
  const [excluindo, setExcluindo] = useState<Perfil | null>(null);
  const excluir = useExcluirPerfil();

  return (
    <div className="grid gap-6">
      <PageHeader
        titulo="Perfis de Acesso"
        descricao="Crie e gerencie perfis para controlar o acesso dos usuários às páginas do sistema."
        acoes={
          <SePermitido permissao="configuracoes-gestao.perfis-acesso.criar">
            <Button type="button" onClick={() => setCriando(true)}>
              <PlusIcon aria-hidden />
              Novo Perfil
            </Button>
          </SePermitido>
        }
      />
      <DataGrid
        url={URL_PERFIS_ACESSO}
        schema={perfilPageSchema}
        querySchema={listPerfisQuerySchema}
        colunas={COLUNAS}
        busca="Buscar perfis..."
        status={STATUS}
        exportacao={EXPORTACAO}
        mensagemVazio="Nenhum perfil encontrado."
        acoes={(perfil) => [
          {
            rotulo: 'Editar',
            icone: PencilIcon,
            permissao: 'configuracoes-gestao.perfis-acesso.editar',
            onSelect: () => setEditando(perfil),
          },
          {
            rotulo: 'Excluir',
            icone: Trash2Icon,
            destrutiva: true,
            permissao: 'configuracoes-gestao.perfis-acesso.excluir',
            onSelect: () => setExcluindo(perfil),
          },
        ]}
      />
      {criando && <ModalPerfil onFechar={() => setCriando(false)} />}
      {editando && <ModalPerfil perfil={editando} onFechar={() => setEditando(null)} />}
      <ConfirmDialog
        aberto={excluindo !== null}
        onAbertoChange={(aberto) => aberto || setExcluindo(null)}
        titulo="Excluir Perfil"
        descricao={`Tem certeza que deseja excluir o perfil "${excluindo?.nome ?? ''}"? Esta ação não pode ser desfeita.`}
        rotuloConfirmar="Excluir"
        onConfirmar={() => (excluindo ? excluir.mutateAsync(excluindo.id) : undefined)}
      />
    </div>
  );
}
