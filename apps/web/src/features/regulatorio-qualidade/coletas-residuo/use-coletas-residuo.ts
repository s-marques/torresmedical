import {
  coletaResiduoSchema,
  type ColetaResiduo,
  type CreateColetaResiduoInput,
  type UpdateColetaResiduoInput,
} from '@torres/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api/client';
import { META_FORMULARIO } from '@/lib/api/query-client';
import { i18next } from '@/lib/i18n';

export const URL_COLETAS_RESIDUO = '/api/regulatorio-qualidade/coletas-residuo';

/** Mutations da tela: ao concluir, a listagem do `DataGrid` é buscada de novo. */
function useMutationColeta<TVariaveis>(
  mutationFn: (variaveis: TVariaveis) => Promise<ColetaResiduo>,
  { formulario = false, sucesso }: { formulario?: boolean; sucesso: string },
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    meta: formulario ? META_FORMULARIO : undefined,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['data-grid', URL_COLETAS_RESIDUO] });
      toast.success(i18next.t(sucesso));
    },
  });
}

function chamar(path: string, method: 'POST' | 'PATCH' | 'DELETE', body?: unknown) {
  return apiFetch(`${URL_COLETAS_RESIDUO}${path}`, { method, body, schema: coletaResiduoSchema });
}

export function useRegistrarColetaResiduo() {
  return useMutationColeta((dados: CreateColetaResiduoInput) => chamar('', 'POST', dados), {
    formulario: true,
    sucesso: 'coletasResiduo.sucesso.criado',
  });
}

export function useEditarColetaResiduo(id: string) {
  return useMutationColeta((dados: UpdateColetaResiduoInput) => chamar(`/${id}`, 'PATCH', dados), {
    formulario: true,
    sucesso: 'coletasResiduo.sucesso.atualizado',
  });
}

export function useExcluirColetaResiduo() {
  return useMutationColeta((id: string) => chamar(`/${id}`, 'DELETE'), {
    sucesso: 'coletasResiduo.sucesso.excluido',
  });
}
