import {
  exportUsuariosQuerySchema,
  listUsuariosQuerySchema,
  usuarioPageSchema,
  type Usuario,
} from '@torres/shared';
import { EyeIcon, KeyRoundIcon, PencilIcon, PlusIcon, PowerIcon } from 'lucide-react';
import { useState } from 'react';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { DataGrid } from '@/components/shared/data-grid/DataGrid';
import type { ColunaGrid, ExportacaoGrid, FiltroStatus } from '@/components/shared/data-grid/tipos';
import { PageHeader } from '@/components/shared/PageHeader';
import { SePermitido } from '@/components/shared/SePermitido';
import { StatusAtivo, StatusBadge } from '@/components/shared/StatusBadge';
import { Button } from '@/components/ui/button';
import { formatarDataHora } from '@/lib/formatar';
import { formatarMascara } from '@/lib/forms/mascaras';
import { ModalResetarSenha } from './ModalResetarSenha';
import { ModalUsuario } from './ModalUsuario';
import { ModalVisualizarUsuario } from './ModalVisualizarUsuario';
import { URL_USUARIOS, useDesativarUsuario } from './use-usuarios';

const STATUS: FiltroStatus = {
  opcoes: [
    { valor: 'ativo', rotulo: 'Ativo' },
    { valor: 'inativo', rotulo: 'Inativo' },
  ],
};

const EXPORTACAO: ExportacaoGrid = {
  permissao: 'configuracoes-gestao.usuarios.exportar',
  nomeArquivo: 'usuarios',
  schema: exportUsuariosQuerySchema,
};

const COLUNAS: ColunaGrid<Usuario>[] = [
  {
    id: 'nome',
    titulo: 'Nome',
    ordenavel: true,
    exportavel: true,
    ocultavel: false,
    celula: (u) => (
      <div>
        <div className="font-medium">{u.nome}</div>
        {u.cargo && <div className="text-xs text-muted-foreground">{u.cargo}</div>}
      </div>
    ),
  },
  { id: 'email', titulo: 'Email', ordenavel: true, exportavel: true },
  {
    id: 'telefone',
    titulo: 'Telefone',
    ordenavel: true,
    exportavel: true,
    celula: (u) => (u.telefone ? formatarMascara('telefone', u.telefone) : '-'),
  },
  {
    id: 'role',
    titulo: 'Role',
    celula: (u) => <StatusBadge tom="destaque">{u.perfilNome ?? 'Sem perfil'}</StatusBadge>,
  },
  {
    id: 'perfil',
    titulo: 'Perfil',
    exportavel: 'perfil',
    celula: (u) => u.perfilNome ?? 'Sem perfil (usa padrão da role)',
  },
  {
    id: 'status',
    titulo: 'Status',
    ordenavel: true,
    exportavel: true,
    celula: (u) => <StatusAtivo ativo={u.ativo} />,
  },
  {
    id: 'ultimoLoginEm',
    titulo: 'Ultimo Login',
    ordenavel: true,
    exportavel: 'ultimoLogin',
    celula: (u) => formatarDataHora(u.ultimoLoginEm),
  },
];

/**
 * Tela "Usuários" (`/usuarios`, docs/inventario/telas/configuracoes-gestao-usuarios.md):
 * usuários do sistema e o perfil de acesso de cada um.
 */
export default function UsuariosPage() {
  const [criando, setCriando] = useState(false);
  const [editando, setEditando] = useState<Usuario | null>(null);
  const [visualizando, setVisualizando] = useState<Usuario | null>(null);
  const [resetandoSenha, setResetandoSenha] = useState<Usuario | null>(null);
  const [desativando, setDesativando] = useState<Usuario | null>(null);
  const desativar = useDesativarUsuario();

  return (
    <div className="grid gap-6">
      <PageHeader
        titulo="Usuarios do Sistema"
        descricao="Gerencie os usuarios que tem acesso ao sistema."
        acoes={
          <SePermitido permissao="configuracoes-gestao.usuarios.criar">
            <Button type="button" onClick={() => setCriando(true)}>
              <PlusIcon aria-hidden />
              Novo Usuario
            </Button>
          </SePermitido>
        }
      />
      <DataGrid
        url={URL_USUARIOS}
        schema={usuarioPageSchema}
        querySchema={listUsuariosQuerySchema}
        colunas={COLUNAS}
        busca="Buscar usuarios..."
        status={STATUS}
        exportacao={EXPORTACAO}
        mensagemVazio="Nenhum usuario encontrado."
        acoes={(usuario) => [
          {
            rotulo: 'Visualizar',
            icone: EyeIcon,
            permissao: 'configuracoes-gestao.usuarios.ver',
            onSelect: () => setVisualizando(usuario),
          },
          {
            rotulo: 'Editar',
            icone: PencilIcon,
            permissao: 'configuracoes-gestao.usuarios.editar',
            onSelect: () => setEditando(usuario),
          },
          {
            rotulo: 'Resetar Senha',
            icone: KeyRoundIcon,
            permissao: 'configuracoes-gestao.usuarios.editar',
            onSelect: () => setResetandoSenha(usuario),
          },
          {
            rotulo: 'Desativar',
            icone: PowerIcon,
            permissao: 'configuracoes-gestao.usuarios.editar',
            desabilitada: !usuario.ativo,
            onSelect: () => setDesativando(usuario),
          },
        ]}
      />
      {criando && <ModalUsuario onFechar={() => setCriando(false)} />}
      {editando && <ModalUsuario usuario={editando} onFechar={() => setEditando(null)} />}
      {visualizando && (
        <ModalVisualizarUsuario usuario={visualizando} onFechar={() => setVisualizando(null)} />
      )}
      {resetandoSenha && (
        <ModalResetarSenha usuario={resetandoSenha} onFechar={() => setResetandoSenha(null)} />
      )}
      <ConfirmDialog
        aberto={desativando !== null}
        onAbertoChange={(aberto) => aberto || setDesativando(null)}
        titulo="Desativar Usuario"
        descricao={`Tem certeza que deseja desativar o usuario "${desativando?.nome ?? ''}"?`}
        rotuloConfirmar="Desativar"
        destrutivo={false}
        onConfirmar={() => (desativando ? desativar.mutateAsync(desativando) : undefined)}
      />
    </div>
  );
}
