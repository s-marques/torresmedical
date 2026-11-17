import type { UsuarioCanalWhatsapp } from '@torres/shared';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { useUsuariosDisponiveis } from './use-canais-whatsapp';

export interface SeletorUsuariosProps {
  value: readonly string[];
  onChange: (ids: string[]) => void;
  /** O modal "Usuários" mostra o e-mail ao lado do nome; o "Novo Canal" só nome e perfil. */
  mostrarEmail?: boolean;
}

function alternar(ids: readonly string[], id: string, marcado: boolean): string[] {
  const outros = ids.filter((atual) => atual !== id);
  return marcado ? [...outros, id] : outros;
}

function ItemUsuario({
  usuario,
  marcado,
  mostrarEmail,
  onChange,
}: Readonly<{
  usuario: UsuarioCanalWhatsapp;
  marcado: boolean;
  mostrarEmail: boolean;
  onChange: (marcado: boolean) => void;
}>) {
  return (
    <li>
      <label className="flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2 text-sm hover:bg-accent">
        <Checkbox checked={marcado} onCheckedChange={(valor) => onChange(valor === true)} />
        <span className="min-w-0 flex-1">
          <span className="font-medium">{usuario.nome}</span>
          {mostrarEmail && <span className="ml-2 text-muted-foreground">{usuario.email}</span>}
        </span>
        {usuario.perfil && (
          <span className="shrink-0 text-xs text-muted-foreground">{usuario.perfil}</span>
        )}
      </label>
    </li>
  );
}

/** Lista de usuários com checkbox. Nenhum marcado = todos os usuários têm acesso ao canal. */
export function SeletorUsuarios({
  value,
  onChange,
  mostrarEmail = false,
}: Readonly<SeletorUsuariosProps>) {
  const usuarios = useUsuariosDisponiveis();

  if (usuarios.isPending) {
    return (
      <div className="grid gap-2" aria-busy>
        {[1, 2, 3].map((n) => (
          <Skeleton key={n} className="h-10" />
        ))}
      </div>
    );
  }
  if (usuarios.isError) {
    return <p className="text-sm text-destructive">Não foi possível carregar os usuários.</p>;
  }
  return (
    <ul className="grid gap-2" aria-label="Usuários com acesso">
      {usuarios.data.map((usuario) => (
        <ItemUsuario
          key={usuario.id}
          usuario={usuario}
          marcado={value.includes(usuario.id)}
          mostrarEmail={mostrarEmail}
          onChange={(marcado) => onChange(alternar(value, usuario.id, marcado))}
        />
      ))}
    </ul>
  );
}
