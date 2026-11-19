import { PREFERENCIAS_NOTIFICACAO, type Preferencias } from '@torres/shared';
import { useTranslation } from 'react-i18next';
import { Switch } from '@/components/ui/switch';
import { usePermissao } from '@/lib/auth/use-sessao';
import { useAtualizarPreferencias } from '@/hooks/use-atualizar-preferencias';

export interface AbaPreferenciasProps {
  preferencias: Preferencias;
}

/**
 * Aba "Preferências": cinco interruptores, gravados por usuário ao alternar (confirmado pelo
 * dev). Por enquanto só ficam registrados: nenhum envio usa estas opções ainda.
 */
export function AbaPreferencias({ preferencias }: Readonly<AbaPreferenciasProps>) {
  const { t } = useTranslation();
  const podeEditar = usePermissao('configuracoes-gestao.configuracoes.editar');
  const atualizar = useAtualizarPreferencias();

  return (
    <section className="grid gap-6 rounded-lg border p-6" aria-labelledby="titulo-preferencias">
      <div>
        <h2 id="titulo-preferencias" className="text-lg font-semibold">
          {t('configuracoes.preferencias.titulo')}
        </h2>
        <p className="text-sm text-muted-foreground">{t('configuracoes.preferencias.descricao')}</p>
      </div>
      <ul className="grid gap-5">
        {PREFERENCIAS_NOTIFICACAO.map((chave) => {
          const id = `preferencia-${chave}`;
          return (
            <li key={chave} className="flex items-center justify-between gap-4">
              <div className="grid gap-0.5">
                <label htmlFor={id} className="text-sm font-medium">
                  {t(`configuracoes.preferencias.${chave}`)}
                </label>
                <span id={`${id}-descricao`} className="text-xs text-muted-foreground">
                  {t(`configuracoes.preferencias.${chave}Descricao`)}
                </span>
              </div>
              <Switch
                id={id}
                aria-describedby={`${id}-descricao`}
                checked={preferencias[chave]}
                disabled={!podeEditar}
                onCheckedChange={(ligado) => atualizar.mutate({ [chave]: ligado })}
              />
            </li>
          );
        })}
      </ul>
    </section>
  );
}
