import { useId, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/**
 * Login (só o layout). A autenticação real, com validação, token e "esqueci a senha", entra
 * na #79. Até lá, "Entrar" só leva ao Painel.
 */
export function LoginPage() {
  const id = useId();
  const navigate = useNavigate();

  function entrar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void navigate('/');
  }

  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <span className="mx-auto mb-2 flex size-12 items-center justify-center rounded-lg bg-primary text-lg font-bold text-primary-foreground">
            TM
          </span>
          <CardTitle className="text-xl">Torres Medical</CardTitle>
          <CardDescription>Entre com seu e-mail e senha</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4" onSubmit={entrar}>
            <div className="grid gap-2">
              <Label htmlFor={`${id}-email`}>E-mail</Label>
              <Input id={`${id}-email`} name="email" type="email" autoComplete="email" required />
            </div>
            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <Label htmlFor={`${id}-senha`}>Senha</Label>
                <Button type="button" variant="link" className="h-auto p-0 text-xs">
                  Esqueci minha senha
                </Button>
              </div>
              <Input
                id={`${id}-senha`}
                name="senha"
                type="password"
                autoComplete="current-password"
                required
              />
            </div>
            <Button type="submit" className="w-full">
              Entrar
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
