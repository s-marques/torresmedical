import { useTranslation } from 'react-i18next';
import { ChecklistOnboarding } from './ChecklistOnboarding';
import { useOnboardingProfissional } from './use-onboarding';

/**
 * Seção "Onboarding" do detalhe do profissional (issue #142). Só aparece para quem passou por um
 * contrato assinado: cadastros anteriores não têm checklist.
 */
export function OnboardingProfissional({ profissionalId }: Readonly<{ profissionalId: string }>) {
  const { t } = useTranslation();
  const consulta = useOnboardingProfissional(profissionalId);
  const onboarding = consulta.data?.onboarding;

  if (consulta.isPending || (!consulta.isError && !onboarding)) return null;

  return (
    <section aria-labelledby="titulo-onboarding-profissional" className="grid gap-3 border-t pt-4">
      <h3 id="titulo-onboarding-profissional" className="text-sm font-semibold">
        {t('onboarding.titulo')}
      </h3>
      {consulta.isError && (
        <p role="alert" className="text-sm text-destructive">
          {t('onboarding.erroCarregar')}
        </p>
      )}
      {onboarding && <ChecklistOnboarding onboarding={onboarding} />}
    </section>
  );
}
