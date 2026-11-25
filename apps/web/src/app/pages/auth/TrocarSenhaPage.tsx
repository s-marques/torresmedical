import { regrasSenhaSchema, trocarSenhaFormSchema, type RegrasSenha } from '@torres/shared';
import { useQuery } from '@tanstack/react-query';
import type { TFunction } from 'i18next';
import { useId, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router';
import { Button } from '@/components/ui/button';
import { ApiRequestError, erroInesperadoApi } from '@/lib/api/api-error';
import { apiFetch } from '@/lib/api/client';
import { errosPorCampo } from '@/lib/api/tratar-erro';
import { sair, trocarSenha } from '@/lib/auth/sessao';
import { errosDoZod } from '@/lib/forms/erros-zod';
import { destinoAposLogin } from '@/lib/auth/redirect';
import { AuthLayout } from './AuthLayout';
import { CampoAuth } from './CampoAuth';

/** Regras da política de senha em texto, para mostrar acima do formulário. */
function regrasEmTexto(regras: RegrasSenha, t: TFunction) {
  return [
    t('auth.regraTamanho', { min: regras.tamanhoMinimo }),
    t('auth.regraLetrasNumeros'),
    ...(regras.exigirMaiuscula ? [t('auth.regraMaiuscula')] : []),
    ...(regras.exigirSimbolo ? [t('auth.regraSimbolo')] : []),
  ];
}

/**
 * Troca de senha do usuário logado (issue #156). É a única tela liberada enquanto a senha for
 * provisória ou tiver vencido: a `RotaProtegida` leva para cá até a troca.
 */
export function TrocarSenhaPage() {
  const id = useId();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [erros, setErros] = useState<Record<string, string>>({});
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const regras = useQuery({
    queryKey: ['regras-senha'],
    queryFn: ({ signal }) =>
      apiFetch('/api/auth/regras-senha', { schema: regrasSenhaSchema, signal }),
  });

  async function enviar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const dados = trocarSenhaFormSchema.safeParse({
      senhaAtual: form.get('senhaAtual'),
      senhaNova: form.get('senhaNova'),
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
      await trocarSenha({ senhaAtual: dados.data.senhaAtual, senhaNova: dados.data.senhaNova });
      void navigate(destinoAposLogin(params.get('redirect')), { replace: true });
    } catch (error) {
      const porCampo = errosPorCampo(error);
      setErros(porCampo);
      if (Object.keys(porCampo).length === 0) {
        setErroGeral(error instanceof ApiRequestError ? error.message : erroInesperadoApi());
      }
    } finally {
      setEnviando(false);
    }
  }

  return (
    <AuthLayout titulo={t('auth.trocarSenhaTitulo')} descricao={t('auth.trocarSenhaDescricao')}>
      <form className="grid gap-4" noValidate onSubmit={(event) => void enviar(event)}>
        {erroGeral && (
          <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {erroGeral}
          </p>
        )}
        {regras.data && (
          <div className="rounded-md bg-muted p-3 text-sm">
            <p className="font-medium">{t('auth.regrasTitulo')}</p>
            <ul className="list-disc pl-5">
              {regrasEmTexto(regras.data, t).map((regra) => (
                <li key={regra}>{regra}</li>
              ))}
            </ul>
          </div>
        )}
        <CampoAuth
          id={`${id}-atual`}
          rotulo={t('auth.senhaAtual')}
          name="senhaAtual"
          type="password"
          autoComplete="current-password"
          erro={erros.senhaAtual}
        />
        <CampoAuth
          id={`${id}-nova`}
          rotulo={t('auth.senhaNova')}
          name="senhaNova"
          type="password"
          autoComplete="new-password"
          erro={erros.senhaNova}
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
        <Button type="button" variant="ghost" className="w-full" onClick={() => void sair()}>
          {t('layout.sair')}
        </Button>
      </form>
    </AuthLayout>
  );
}
