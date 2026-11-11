import {
  arquivoLinkSchema,
  empresaSchema,
  horariosFuncionamentoResponseSchema,
  usuariosResponseSchema,
  type EmpresaInput,
  type SalvarHorariosFuncionamentoInput,
} from '@torres/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api/client';
import { META_FORMULARIO } from '@/lib/api/query-client';

const URL_BASE = '/api/configuracoes-gestao/minha-empresa';
const CHAVE_EMPRESA = ['minha-empresa'];
const CHAVE_USUARIOS = ['minha-empresa', 'usuarios'];
const CHAVE_HORARIOS = ['minha-empresa', 'horarios'];

export function useEmpresa() {
  return useQuery({
    queryKey: CHAVE_EMPRESA,
    queryFn: ({ signal }) => apiFetch(URL_BASE, { schema: empresaSchema, signal }),
  });
}

export function useAtualizarEmpresa() {
  const queryClient = useQueryClient();
  return useMutation({
    meta: META_FORMULARIO,
    mutationFn: (dados: EmpresaInput) =>
      apiFetch(URL_BASE, { method: 'PUT', body: dados, schema: empresaSchema }),
    onSuccess: async (empresa) => {
      queryClient.setQueryData(CHAVE_EMPRESA, empresa);
      toast.success('Alterações salvas.');
    },
  });
}

export function useDefinirLogoEmpresa() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (arquivoId: string | null) =>
      apiFetch(`${URL_BASE}/logo`, { method: 'PUT', body: { arquivoId }, schema: empresaSchema }),
    onSuccess: (empresa) => {
      queryClient.setQueryData(CHAVE_EMPRESA, empresa);
    },
  });
}

/** Link temporário para exibir o logo (mesmo padrão de `foto-profissional`/`logo-receita`). */
export function useLinkArquivo(arquivoId: string | null) {
  return useQuery({
    queryKey: ['arquivo-link', arquivoId],
    enabled: arquivoId !== null,
    staleTime: 60_000,
    queryFn: ({ signal }) =>
      apiFetch(`/api/arquivos/${arquivoId}/link`, { schema: arquivoLinkSchema, signal }),
  });
}

/** Aba Usuários: somente leitura (criar/editar/excluir é a tela própria "Usuários"). */
export function useUsuariosEmpresa() {
  return useQuery({
    queryKey: CHAVE_USUARIOS,
    queryFn: ({ signal }) =>
      apiFetch(`${URL_BASE}/usuarios`, { schema: usuariosResponseSchema, signal }),
  });
}

export function useHorariosFuncionamento() {
  return useQuery({
    queryKey: CHAVE_HORARIOS,
    queryFn: ({ signal }) =>
      apiFetch(`${URL_BASE}/horarios`, { schema: horariosFuncionamentoResponseSchema, signal }),
  });
}

export function useSalvarHorariosFuncionamento() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dias: SalvarHorariosFuncionamentoInput['dias']) =>
      apiFetch(`${URL_BASE}/horarios`, {
        method: 'PUT',
        body: { dias },
        schema: horariosFuncionamentoResponseSchema,
      }),
    onSuccess: (resposta) => {
      queryClient.setQueryData(CHAVE_HORARIOS, resposta);
      toast.success('Horários salvos.');
    },
  });
}
