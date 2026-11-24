import type { Permissao, Preferencias, UsuarioSessao } from '@torres/shared';
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
  /** Perfil autorizado a ver dados sensíveis (LGPD), como o CPF dos cadastros. */
  verDadosSensiveis: boolean;
  /** Avatar da tela Configurações (issue #30). */
  avatarArquivoId: string | null;
  /** Preferências e aparência (issue #30), com os padrões quando nunca alteradas. */
  preferencias: Preferencias;
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
    avatarArquivoId: usuario.avatarArquivoId,
    preferencias: usuario.preferencias,
  };
}

/** Requisição depois do guard global: `usuario` está presente nas rotas não públicas. */
export type RequisicaoAutenticada = Request & { usuario?: UsuarioAutenticado };
