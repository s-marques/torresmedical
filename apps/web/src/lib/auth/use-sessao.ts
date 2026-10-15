import type { Permissao } from '@torres/shared';
import { useSyncExternalStore } from 'react';
import { assinarSessao, obterSessao, type EstadoSessao } from './sessao';

export function useSessao(): EstadoSessao {
  return useSyncExternalStore(assinarSessao, obterSessao);
}

/** Permissões do usuário logado (vazio sem sessão). */
export function usePermissoes(): readonly Permissao[] {
  const sessao = useSessao();
  return sessao.status === 'autenticado' ? sessao.usuario.permissoes : SEM_PERMISSOES;
}

const SEM_PERMISSOES: readonly Permissao[] = [];

/**
 * O usuário tem a permissão? Use para esconder botões e ações. Quem garante é o back:
 * o front só evita mostrar o que daria 403.
 */
export function usePermissao(permissao: Permissao): boolean {
  return usePermissoes().includes(permissao);
}
