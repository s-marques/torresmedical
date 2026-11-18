import type { Permissao, UsuarioSessao } from '@torres/shared';
import type { Request } from 'express';
import type { EscopoDados } from './escopo-dados';

/** Usuário da requisição, carregado pelo guard global a cada chamada. */
export interface UsuarioAutenticado {
  id: string;
  sessaoId: string;
  empresaId: string;
  nome: string;
  email: string;
  perfil: { id: string; nome: string } | null;
  permissoes: ReadonlySet<Permissao>;
  /** De quem são os dados que o usuário vê (issue #153). */
  escopo: EscopoDados;
}

/** Payload do access token: só os ids. Permissões e status são lidos do banco a cada requisição. */
export interface AccessTokenPayload {
  sub: string;
  sid: string;
}

export function toUsuarioSessao(usuario: UsuarioAutenticado): UsuarioSessao {
  return {
    id: usuario.id,
    nome: usuario.nome,
    email: usuario.email,
    perfil: usuario.perfil,
    permissoes: [...usuario.permissoes].sort((a, b) => a.localeCompare(b)),
  };
}

/** Requisição depois do guard global: `usuario` está presente nas rotas não públicas. */
export type RequisicaoAutenticada = Request & { usuario?: UsuarioAutenticado };
