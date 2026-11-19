import {
  preferenciasSchema,
  type AtualizarPreferenciasInput,
  type Preferencias,
} from '@torres/shared';
import { useMutation } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';
import { atualizarUsuarioSessao } from '@/lib/auth/sessao';

/**
 * Grava preferências do usuário logado (abas Preferências e Aparência da tela Configurações e
 * o menu de tema do cabeçalho; issue #30). A mudança aparece na hora (sessão) e volta ao valor
 * anterior se a API recusar; o erro vira toast pelo tratamento global.
 */
export function useAtualizarPreferencias() {
  return useMutation({
    mutationFn: (dados: AtualizarPreferenciasInput) =>
      apiFetch('/api/configuracoes-gestao/configuracoes/preferencias', {
        method: 'PATCH',
        body: dados,
        schema: preferenciasSchema,
      }),
    onMutate: (dados) => {
      let anteriores: Preferencias | undefined;
      atualizarUsuarioSessao((usuario) => {
        anteriores = usuario.preferencias;
        return { preferencias: { ...usuario.preferencias, ...dados } };
      });
      return { anteriores };
    },
    onError: (_erro, _dados, contexto) => {
      const anteriores = contexto?.anteriores;
      if (anteriores) atualizarUsuarioSessao(() => ({ preferencias: anteriores }));
    },
    onSuccess: (preferencias) => {
      atualizarUsuarioSessao(() => ({ preferencias }));
    },
  });
}
