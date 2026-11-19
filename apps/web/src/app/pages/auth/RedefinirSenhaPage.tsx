import { redefinirSenhaFormSchema } from '@torres/shared';
import { useId, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';
import { Button } from '@/components/ui/button';
import { ApiRequestError, erroInesperadoApi } from '@/lib/api/api-error';
import { errosPorCampo } from '@/lib/api/tratar-erro';
import { redefinirSenha } from '@/lib/auth/sessao';
import { errosDoZod } from '@/lib/forms/erros-zod';
import { AuthLayout } from './AuthLayout';
import { CampoAuth } from './CampoAuth';

/** Troca a senha pelo link recebido (`/redefinir-senha?token=...`). */
export function RedefinirSenhaPage() {
  const id = useId();
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [erros, setErros] = useState<Record<string, string>>({});
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [concluido, setConcluido] = useState(false);
  const [enviando, setEnviando] = useState(false);

  async function enviar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const dados = redefinirSenhaFormSchema.safeParse({
      senha: form.get('senha'),
      confirmacao: form.get('confirmacao'),
    });
    setErroGeral(null);
    if (!dados.success) {
      setErros(errosDoZod(dados.error.issues));
      return;
    }

    setErros({});
    setEnviando(true);
    try {
      await redefinirSenha({ token, senha: dados.data.senha });
      setConcluido(true);
    } catch (error) {
      const { token: erroDoLink, ...porCampo } = errosPorCampo(error);
      setErros(porCampo);
      if (erroDoLink) setErroGeral(erroDoLink);
      else if (Object.keys(porCampo).length === 0) {
        setErroGeral(error instanceof ApiRequestError ? error.message : erroInesperadoApi());
      }
    } finally {
      setEnviando(false);
    }
  }

  if (!token || concluido) {
    return (
      <AuthLayout
        titulo={t('auth.redefinirSenha')}
        descricao={t(concluido ? 'auth.senhaAlterada' : 'auth.linkInvalido')}
      >
        <p role="status" className="text-center text-sm">
          {t(concluido ? 'auth.senhaAlteradaDescricao' : 'auth.pecaNovoLink')}
        </p>
        <Link to="/login" className="mt-4 block text-center text-sm text-primary hover:underline">
          {t('auth.irLogin')}
        </Link>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout titulo={t('auth.redefinirSenha')} descricao={t('auth.redefinirDescricao')}>
      <form className="grid gap-4" noValidate onSubmit={(event) => void enviar(event)}>
        {erroGeral && (
          <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {erroGeral}
          </p>
        )}
        <CampoAuth
          id={`${id}-senha`}
          rotulo={t('auth.senhaNova')}
          name="senha"
          type="password"
          autoComplete="new-password"
          erro={erros.senha}
        />
        <CampoAuth
          id={`${id}-confirmacao`}
          rotulo={t('auth.confirmeSenha')}
          name="confirmacao"
          type="password"
          autoComplete="new-password"
          erro={erros.confirmacao}
        />
        <Button type="submit" className="w-full" disabled={enviando}>
          {t('auth.alterarSenha')}
        </Button>
      </form>
    </AuthLayout>
  );
}
