import { esqueciSenhaSchema } from '@torres/shared';
import { useId, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { ApiRequestError, erroInesperadoApi } from '@/lib/api/api-error';
import { pedirRedefinicaoSenha } from '@/lib/auth/sessao';
import { errosDoZod } from '@/lib/forms/erros-zod';
import { AuthLayout } from './AuthLayout';
import { CampoAuth } from './CampoAuth';

/** Pede o link de redefinição de senha. A resposta é a mesma exista ou não o e-mail. */
export function EsqueciSenhaPage() {
  const id = useId();
  const { t } = useTranslation();
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
      setErroGeral(error instanceof ApiRequestError ? error.message : erroInesperadoApi());
    } finally {
      setEnviando(false);
    }
  }

  return (
    <AuthLayout titulo={t('auth.esqueciSenha')} descricao={t('auth.esqueciDescricao')}>
      {enviado ? (
        <p role="status" className="text-center text-sm">
          {t('auth.linkEnviado')}
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
            rotulo={t('auth.email')}
            name="email"
            type="email"
            autoComplete="email"
            erro={erro}
          />
          <Button type="submit" className="w-full" disabled={enviando}>
            {t('auth.enviarLink')}
          </Button>
        </form>
      )}
      <Link to="/login" className="mt-4 block text-center text-sm text-primary hover:underline">
        {t('auth.voltarLogin')}
      </Link>
    </AuthLayout>
  );
}
