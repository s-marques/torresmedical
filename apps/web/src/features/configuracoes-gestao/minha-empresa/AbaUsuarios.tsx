import { UsersIcon } from 'lucide-react';
import { EmptyState } from '@/components/shared/EmptyState';
import { StatusAtivo } from '@/components/shared/StatusBadge';
import { formatarDataHora } from '@/lib/formatar';
import { useUsuariosEmpresa } from './use-minha-empresa';

/**
 * Aba "Usuários": lista somente leitura. Criar/editar/excluir usuário é a tela própria
 * "Usuários" (`/usuarios`), fora desta tela.
 */
export function AbaUsuarios() {
  const usuarios = useUsuariosEmpresa();
  const lista = usuarios.data?.data ?? [];

  return (
    <div className="grid gap-4 rounded-lg border p-6">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <UsersIcon aria-hidden className="size-5" />
          Usuários da Empresa
        </h2>
        <p className="text-sm text-muted-foreground">Lista de usuários vinculados à sua empresa</p>
      </div>
      {lista.length === 0 && !usuarios.isLoading ? (
        <EmptyState icone={UsersIcon} titulo="Nenhum usuário encontrado." />
      ) : (
        <div className="overflow-x-auto rounded-lg border text-sm">
          <table className="w-full">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="px-3 py-2 font-medium">Nome</th>
                <th className="px-3 py-2 font-medium">E-mail</th>
                <th className="px-3 py-2 font-medium">Perfil</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Último Login</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((usuario) => (
                <tr key={usuario.id} className="border-t">
                  <td className="px-3 py-2 font-medium">{usuario.nome}</td>
                  <td className="px-3 py-2">{usuario.email}</td>
                  <td className="px-3 py-2">{usuario.perfilNome ?? '-'}</td>
                  <td className="px-3 py-2">
                    <StatusAtivo ativo={usuario.ativo} />
                  </td>
                  <td className="px-3 py-2">
                    {usuario.ultimoLoginEm ? formatarDataHora(usuario.ultimoLoginEm) : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
