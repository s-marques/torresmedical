import {
  servicoProfissionalPageSchema,
  servicoProfissionalSchema,
  type CreateServicoProfissionalInput,
  type ServicoProfissional,
  type UpdateServicoProfissionalInput,
} from '@torres/shared';
import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api/client';
import { META_FORMULARIO } from '@/lib/api/query-client';

export const URL_SERVICOS = '/api/gestao-profissionais/servicos-profissionais';

const CHAVE = ['servicos-profissionais'] as const;

/** O limite da API por página; a tela agrupa por profissional e pagina só acima disso. */
export const TAMANHO_PAGINA = 100;

export interface FiltrosServicos {
  search: string;
  profissionalId: string | null;
  page: number;
}

export function useServicos({ search, profissionalId, page }: FiltrosServicos) {
  return useQuery({
    queryKey: [...CHAVE, { search, profissionalId, page }],
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) =>
      apiFetch(URL_SERVICOS, {
        query: {
          page,
          pageSize: TAMANHO_PAGINA,
          sort: 'nome:asc',
          search: search || undefined,
          profissionalId: profissionalId ?? undefined,
        },
        schema: servicoProfissionalPageSchema,
        signal,
      }),
  });
}

function useMutationServico<TVariaveis>(
  mutationFn: (variaveis: TVariaveis) => Promise<ServicoProfissional>,
  { formulario = false, sucesso }: { formulario?: boolean; sucesso?: string } = {},
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    meta: formulario ? META_FORMULARIO : undefined,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: CHAVE });
      if (sucesso) toast.success(sucesso);
    },
  });
}

function chamar(path: string, method: 'POST' | 'PATCH' | 'DELETE', body?: unknown) {
  return apiFetch(`${URL_SERVICOS}${path}`, { method, body, schema: servicoProfissionalSchema });
}

export function useCriarServico() {
  return useMutationServico((dados: CreateServicoProfissionalInput) => chamar('', 'POST', dados), {
    formulario: true,
    sucesso: 'Serviço criado.',
  });
}

export function useAlterarServico(id: string) {
  return useMutationServico(
    (dados: UpdateServicoProfissionalInput) => chamar(`/${id}`, 'PATCH', dados),
    { formulario: true, sucesso: 'Serviço atualizado.' },
  );
}

export function useAlterarStatusServico() {
  return useMutationServico(
    ({ id, ativo }: { id: string; ativo: boolean }) => chamar(`/${id}/status`, 'PATCH', { ativo }),
    { sucesso: undefined },
  );
}

export function useExcluirServico() {
  return useMutationServico((id: string) => chamar(`/${id}`, 'DELETE'), {
    sucesso: 'Serviço excluído.',
  });
}
