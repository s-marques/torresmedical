import {
  onboardingResponseSchema,
  onboardingSchema,
  type Onboarding,
  type OnboardingRecepcaoInput,
} from '@torres/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api/client';
import { i18next } from '@/lib/i18n';

export const URL_ONBOARDING = '/api/gestao-profissionais/onboarding';
const CHAVE = 'onboarding-profissional';

/** Checklist do profissional; `onboarding: null` quando ele não passou por contrato assinado. */
export function useOnboardingProfissional(profissionalId: string) {
  return useQuery({
    queryKey: [CHAVE, profissionalId],
    queryFn: ({ signal }) =>
      apiFetch(`/api/gestao-profissionais/profissionais/${profissionalId}/onboarding`, {
        schema: onboardingResponseSchema,
        signal,
      }),
  });
}

/** Marca ou desmarca "Recepção orientada"; atualiza o checklist, a lista e o cadastro. */
export function useDefinirRecepcao() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...corpo }: { id: string } & OnboardingRecepcaoInput): Promise<Onboarding> =>
      apiFetch(`${URL_ONBOARDING}/${id}/recepcao`, {
        method: 'PUT',
        body: corpo,
        schema: onboardingSchema,
      }),
    onSuccess: async (_dados, variaveis) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: [CHAVE] }),
        queryClient.invalidateQueries({ queryKey: ['data-grid', URL_ONBOARDING] }),
      ]);
      toast.success(
        i18next.t(
          variaveis.orientada
            ? 'onboarding.mensagens.orientada'
            : 'onboarding.mensagens.desmarcada',
        ),
      );
    },
  });
}
