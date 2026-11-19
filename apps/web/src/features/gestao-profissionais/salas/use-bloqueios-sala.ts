import {
  salaBloqueioSchema,
  type CancelarSalaBloqueioInput,
  type CreateSalaBloqueioInput,
  type SalaBloqueio,
  type UpdateSalaBloqueioInput,
} from '@torres/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api/client';
import { META_FORMULARIO } from '@/lib/api/query-client';

export const URL_BLOQUEIOS = '/api/gestao-profissionais/salas-bloqueios';

/** Ao concluir, a tabela e o painel (Mapa e Dashboard, chaves `salas`) recarregam. */
function useMutationBloqueio<TVariaveis>(
  mutationFn: (variaveis: TVariaveis) => Promise<SalaBloqueio>,
  { formulario = false, sucesso }: { formulario?: boolean; sucesso: string },
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    meta: formulario ? META_FORMULARIO : undefined,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['data-grid', URL_BLOQUEIOS] }),
        queryClient.invalidateQueries({ queryKey: ['salas'] }),
      ]);
      toast.success(sucesso);
    },
  });
}

function chamar(path: string, method: 'POST' | 'PATCH', body: unknown) {
  return apiFetch(`${URL_BLOQUEIOS}${path}`, { method, body, schema: salaBloqueioSchema });
}

export function useCriarBloqueio() {
  const { t } = useTranslation();
  return useMutationBloqueio((dados: CreateSalaBloqueioInput) => chamar('', 'POST', dados), {
    formulario: true,
    sucesso: t('salasBloqueios.sucesso.criado'),
  });
}

export function useAlterarBloqueio(id: string) {
  const { t } = useTranslation();
  return useMutationBloqueio((dados: UpdateSalaBloqueioInput) => chamar(`/${id}`, 'PATCH', dados), {
    formulario: true,
    sucesso: t('salasBloqueios.sucesso.atualizado'),
  });
}

/** Cancela sem excluir: a API grava quem, quando e o motivo. */
export function useCancelarBloqueio(id: string) {
  const { t } = useTranslation();
  return useMutationBloqueio(
    (dados: CancelarSalaBloqueioInput) => chamar(`/${id}/cancelar`, 'POST', dados),
    { formulario: true, sucesso: t('salasBloqueios.sucesso.cancelado') },
  );
}
