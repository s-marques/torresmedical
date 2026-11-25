import { Bell, CheckIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { usePermissao } from '@/lib/auth/use-sessao';
import { cn } from '@/lib/utils';
import { useAlertas, useMarcarAlerta } from './use-alertas';

/**
 * Central de notificações no cabeçalho (issue #160): os alertas do dia do usuário, com o
 * contador, o link para a lista já filtrada e as ações "lido" e "resolvido".
 */
export function MenuAlertas() {
  const { t } = useTranslation();
  const podeVer = usePermissao('painel.painel.ver');
  const [resolvidos, setResolvidos] = useState(false);
  const { data } = useAlertas(resolvidos);
  const lido = useMarcarAlerta('lido');
  const resolver = useMarcarAlerta('resolvido');
  const alertas = data?.data ?? [];
  const naoLidos = data?.naoLidos ?? 0;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={t('layout.notificacoes')}
        >
          <Bell aria-hidden />
          {naoLidos > 0 && (
            <span
              className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] leading-none font-medium text-white"
              aria-label={t('alertas.naoLidas', { count: naoLidos })}
            >
              {naoLidos > 99 ? '99+' : naoLidos}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel>{t('layout.notificacoes')}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {alertas.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">
            {t('layout.nenhumaNotificacao')}
          </p>
        ) : (
          alertas.map((alerta) => (
            <div key={alerta.id} className="flex items-center gap-1">
              <DropdownMenuItem asChild className="flex-1">
                <Link to={alerta.rota} onClick={() => !alerta.lido && lido.mutate(alerta.id)}>
                  <span
                    aria-hidden
                    className={cn(
                      'size-2 shrink-0 rounded-full',
                      alerta.lido ? 'bg-transparent' : 'bg-primary',
                    )}
                  />
                  <span className={cn(alerta.resolvido && 'text-muted-foreground line-through')}>
                    {t(`alertas.tipo.${alerta.tipo}`, { count: alerta.quantidade })}
                  </span>
                </Link>
              </DropdownMenuItem>
              {!alerta.resolvido && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 shrink-0"
                  aria-label={t('alertas.resolver')}
                  title={t('alertas.resolver')}
                  onClick={() => resolver.mutate(alerta.id)}
                >
                  <CheckIcon aria-hidden />
                </Button>
              )}
            </div>
          ))
        )}
        {podeVer && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={(evento) => {
                evento.preventDefault();
                setResolvidos((atual) => !atual);
              }}
            >
              {resolvidos ? t('alertas.ocultarResolvidos') : t('alertas.mostrarResolvidos')}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
