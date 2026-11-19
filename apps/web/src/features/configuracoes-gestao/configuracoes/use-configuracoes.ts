import { meuPerfilSchema, type MeuPerfil, type MeuPerfilInput } from '@torres/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api/client';
import { META_FORMULARIO } from '@/lib/api/query-client';
import { atualizarUsuarioSessao } from '@/lib/auth/sessao';
import { i18next } from '@/lib/i18n';

const URL_BASE = '/api/configuracoes-gestao/configuracoes';
const CHAVE_PERFIL = ['configuracoes', 'perfil'];

/** Nome, e-mail e avatar novos também aparecem no cabeçalho e no menu (sessão). */
function refletirNaSessao(perfil: MeuPerfil): void {
  atualizarUsuarioSessao(() => ({
    nome: perfil.nome,
    email: perfil.email,
    avatarArquivoId: perfil.avatarArquivoId,
  }));
}

export function useMeuPerfil() {
  return useQuery({
    queryKey: CHAVE_PERFIL,
    queryFn: ({ signal }) => apiFetch(`${URL_BASE}/perfil`, { schema: meuPerfilSchema, signal }),
  });
}

/** "Salvar Alterações" da aba Perfil (mensagem padrão do projeto, confirmado pelo dev). */
export function useAtualizarPerfil() {
  const queryClient = useQueryClient();
  return useMutation({
    meta: META_FORMULARIO,
    mutationFn: (dados: MeuPerfilInput) =>
      apiFetch(`${URL_BASE}/perfil`, { method: 'PUT', body: dados, schema: meuPerfilSchema }),
    onSuccess: (perfil) => {
      queryClient.setQueryData(CHAVE_PERFIL, perfil);
      refletirNaSessao(perfil);
      toast.success(i18next.t('configuracoes.perfil.salvo'));
    },
  });
}

/** "Enviar avatar": o arquivo já foi enviado em `/api/arquivos`; `null` remove. */
export function useDefinirAvatar() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (arquivoId: string | null) =>
      apiFetch(`${URL_BASE}/perfil/avatar`, {
        method: 'PUT',
        body: { arquivoId },
        schema: meuPerfilSchema,
      }),
    onSuccess: (perfil) => {
      queryClient.setQueryData(CHAVE_PERFIL, perfil);
      refletirNaSessao(perfil);
      toast.success(
        i18next.t(
          perfil.avatarArquivoId
            ? 'configuracoes.perfil.avatarSalvo'
            : 'configuracoes.perfil.avatarRemovido',
        ),
      );
    },
  });
}
