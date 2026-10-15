import { ShieldX } from 'lucide-react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';

/** Tela que o perfil do usuário não libera (sem a permissão `.ver`). */
export function SemPermissaoPage() {
  return (
    <section className="flex flex-col items-center gap-3 py-16 text-center">
      <ShieldX className="size-10 text-muted-foreground" aria-hidden />
      <h1 className="text-2xl font-bold tracking-tight">Sem permissão</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        Seu perfil de acesso não libera esta tela. Fale com o administrador do sistema.
      </p>
      <Button asChild>
        <Link to="/">Voltar ao Painel</Link>
      </Button>
    </section>
  );
}
