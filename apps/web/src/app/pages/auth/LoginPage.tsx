import { loginSchema } from '@torres/shared';
import { useId, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { Button } from '@/components/ui/button';
import { ApiRequestError, ERRO_INESPERADO_API } from '@/lib/api/api-error';
import { errosPorCampo } from '@/lib/api/tratar-erro';
import { destinoAposLogin } from '@/lib/auth/redirect';
import { entrar } from '@/lib/auth/sessao';
import { errosDoZod } from '@/lib/forms/erros-zod';
import { AuthLayout } from './AuthLayout';
import { CampoAuth } from './CampoAuth';

/** Login com e-mail e senha. Depois de entrar, volta para a tela que o usuário tentou abrir. */
export function LoginPage() {
  const id = useId();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [erros, setErros] = useState<Record<string, string>>({});
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const dados = loginSchema.safeParse({ email: form.get('email'), senha: form.get('senha') });
    setErroGeral(null);
    if (!dados.success) {
      setErros(errosDoZod(dados.error.issues));
      return;
    }

    setErros({});
    setEnviando(true);
    try {
      await entrar(dados.data);
      void navigate(destinoAposLogin(params.get('redirect')), { replace: true });
    } catch (error) {
      const porCampo = errosPorCampo(error);
      setErros(porCampo);
      if (Object.keys(porCampo).length === 0) {
        setErroGeral(error instanceof ApiRequestError ? error.message : ERRO_INESPERADO_API);
      }
    } finally {
      setEnviando(false);
    }
  }

  return (
    <AuthLayout titulo="Torres Medical" descricao="Entre com seu e-mail e senha">
      <form className="grid gap-4" noValidate onSubmit={(event) => void enviar(event)}>
        {erroGeral && (
          <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {erroGeral}
          </p>
        )}
        <CampoAuth
          id={`${id}-email`}
          rotulo="E-mail"
          name="email"
          type="email"
          autoComplete="email"
          erro={erros.email}
        />
        <CampoAuth
          id={`${id}-senha`}
          rotulo="Senha"
          name="senha"
          type="password"
          autoComplete="current-password"
          erro={erros.senha}
          extra={
            <Link to="/esqueci-senha" className="text-xs text-primary hover:underline">
              Esqueci minha senha
            </Link>
          }
        />
        <Button type="submit" className="w-full" disabled={enviando}>
          {enviando ? 'Entrando…' : 'Entrar'}
        </Button>
      </form>
    </AuthLayout>
  );
}
