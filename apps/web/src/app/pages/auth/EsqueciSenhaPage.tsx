import { esqueciSenhaSchema } from '@torres/shared';
import { useId, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { ApiRequestError, ERRO_INESPERADO_API } from '@/lib/api/api-error';
import { pedirRedefinicaoSenha } from '@/lib/auth/sessao';
import { errosDoZod } from '@/lib/forms/erros-zod';
import { AuthLayout } from './AuthLayout';
import { CampoAuth } from './CampoAuth';

export const MENSAGEM_LINK_ENVIADO =
  'Se o e-mail estiver cadastrado, você receberá um link para redefinir a senha.';

/** Pede o link de redefinição de senha. A resposta é a mesma exista ou não o e-mail. */
export function EsqueciSenhaPage() {
  const id = useId();
  const [erro, setErro] = useState<string | undefined>();
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [enviado, setEnviado] = useState(false);
  const [enviando, setEnviando] = useState(false);

  async function enviar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const dados = esqueciSenhaSchema.safeParse({
      email: new FormData(event.currentTarget).get('email'),
    });
    setErroGeral(null);
    if (!dados.success) {
      setErro(errosDoZod(dados.error.issues).email);
      return;
    }

    setErro(undefined);
    setEnviando(true);
    try {
      await pedirRedefinicaoSenha(dados.data);
      setEnviado(true);
    } catch (error) {
      setErroGeral(error instanceof ApiRequestError ? error.message : ERRO_INESPERADO_API);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <AuthLayout titulo="Esqueci minha senha" descricao="Informe o e-mail usado para entrar">
      {enviado ? (
        <p role="status" className="text-center text-sm">
          {MENSAGEM_LINK_ENVIADO}
        </p>
      ) : (
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
            erro={erro}
          />
          <Button type="submit" className="w-full" disabled={enviando}>
            Enviar link
          </Button>
        </form>
      )}
      <Link to="/login" className="mt-4 block text-center text-sm text-primary hover:underline">
        Voltar ao login
      </Link>
    </AuthLayout>
  );
}
