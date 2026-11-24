import { ONBOARDING_ETAPA_MANUAL, type Onboarding, type OnboardingEtapaItem } from '@torres/shared';
import { CheckCircle2Icon, CircleIcon, Loader2Icon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { SePermitido } from '@/components/shared/SePermitido';
import { Button } from '@/components/ui/button';
import { formatarData, formatarDataHora } from '@/lib/formatar';
import { cn } from '@/lib/utils';
import { useDefinirRecepcao } from './use-onboarding';

/** Texto do que falta em uma etapa pendente (campos do cadastro ou tipos de documento). */
function usePendencias() {
  const { t } = useTranslation();
  return (item: OnboardingEtapaItem): string => {
    if (item.etapa === 'CADASTRO_COMPLETO') {
      return item.pendencias.map((campo) => t(`onboarding.campos.${campo}`)).join(', ');
    }
    if (item.etapa === 'DOCUMENTACAO_VALIDADA') {
      return item.pendencias.map((tipo) => t(`profissionalDocumentos.tipos.${tipo}`)).join(', ');
    }
    return '';
  };
}

export interface ChecklistOnboardingProps {
  onboarding: Onboarding;
  /** Mostra o botão de marcar a recepção (a lista e o detalhe oferecem; só quem pode editar vê). */
  compacto?: boolean;
}

/**
 * Checklist das 9 etapas do onboarding (issue #142): as automáticas mudam sozinhas pelo dado de
 * origem; só "Recepção orientada" é marcada à mão, com quem e quando. Mostra o prazo (7 dias da
 * assinatura) e as sugestões de horário e usuário.
 */
export function ChecklistOnboarding({
  onboarding,
  compacto = false,
}: Readonly<ChecklistOnboardingProps>) {
  const { t } = useTranslation();
  const definir = useDefinirRecepcao();
  const pendencias = usePendencias();

  return (
    <div className="grid gap-3">
      <p className="text-sm text-muted-foreground">
        {t('onboarding.resumo', {
          concluidas: onboarding.concluidas,
          total: onboarding.total,
          data: formatarData(onboarding.iniciadoEm),
          dias: onboarding.diasEmAndamento,
        })}
      </p>
      <ol className="grid gap-1.5">
        {onboarding.etapas.map((item) => {
          const faltando = pendencias(item);
          const recepcao = item.etapa === ONBOARDING_ETAPA_MANUAL;
          return (
            <li
              key={item.etapa}
              className={cn(
                'flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-sm',
                item.atrasada && 'border-destructive/40 bg-destructive/5',
              )}
            >
              {item.concluida ? (
                <CheckCircle2Icon aria-hidden className="size-4 text-emerald-600" />
              ) : (
                <CircleIcon aria-hidden className="size-4 text-muted-foreground" />
              )}
              <span className="font-medium">{t(`onboarding.etapas.${item.etapa}`)}</span>
              <span className="sr-only">
                {item.concluida ? t('onboarding.concluida') : t('onboarding.pendente')}
              </span>
              {item.atrasada && (
                <span className="text-xs font-medium text-destructive">
                  {t('onboarding.atrasada')}
                </span>
              )}
              {item.concluida && recepcao && item.concluidaEm && (
                <span className="text-xs text-muted-foreground">
                  {t('onboarding.marcadaPor', {
                    nome: item.concluidaPorNome ?? '-',
                    data: formatarDataHora(item.concluidaEm),
                  })}
                </span>
              )}
              {!item.concluida && faltando && (
                <span className="text-xs text-muted-foreground">
                  {t('onboarding.falta', { itens: faltando })}
                </span>
              )}
              {recepcao && !compacto && (
                <SePermitido permissao="gestao-profissionais.onboarding.editar">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="ml-auto"
                    disabled={definir.isPending}
                    onClick={() =>
                      definir.mutate({ id: onboarding.id, orientada: !item.concluida })
                    }
                  >
                    {definir.isPending && <Loader2Icon aria-hidden className="animate-spin" />}
                    {item.concluida ? t('onboarding.desmarcar') : t('onboarding.marcarOrientada')}
                  </Button>
                </SePermitido>
              )}
            </li>
          );
        })}
      </ol>
      {onboarding.sugestoes.horarios.length > 0 && (
        <p className="text-sm">
          <span className="font-medium">{t('onboarding.sugestoes.horarios')}</span>{' '}
          {onboarding.sugestoes.horarios
            .map((dia) => `${t(`onboarding.dias.${dia.diaSemana}`)} ${dia.inicio}-${dia.fim}`)
            .join(', ')}
        </p>
      )}
      {onboarding.sugestoes.criarUsuario && (
        <p className="text-sm">
          <span className="font-medium">{t('onboarding.sugestoes.usuario')}</span>{' '}
          <SePermitido permissao="configuracoes-gestao.usuarios.ver">
            <Link className="text-primary underline" to="/usuarios">
              {t('onboarding.sugestoes.abrirUsuarios')}
            </Link>
          </SePermitido>
        </p>
      )}
      {!onboarding.podeAtivar && (
        <p className="text-xs text-muted-foreground">{t('onboarding.avisoAtivacao')}</p>
      )}
    </div>
  );
}
