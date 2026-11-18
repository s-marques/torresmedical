import type { EscopoDadosPerfil } from '@torres/shared';

/**
 * Escopo de dados do usuário da requisição (issue #153; requisitos R §14 e §37).
 * - `TODOS`: sem restrição por profissional (administração, recepção, rotinas internas).
 * - `PROFISSIONAIS`: só os dados dos profissionais em `profissionalIds`. Lista vazia = nada.
 */
export type EscopoDados =
  | { readonly tipo: 'TODOS' }
  | { readonly tipo: 'PROFISSIONAIS'; readonly profissionalIds: readonly string[] };

export const ESCOPO_TODOS: EscopoDados = Object.freeze({ tipo: 'TODOS' });

/**
 * Escopo a partir do perfil e dos vínculos do usuário. Perfil restrito sem vínculo resulta
 * numa lista vazia (não vê dados clínicos). Sem perfil ativo o usuário não tem permissões, então
 * o escopo não importa e fica `TODOS`.
 */
export function escopoDoUsuario(
  escopoPerfil: EscopoDadosPerfil | null,
  profissionalIds: readonly string[],
): EscopoDados {
  if (escopoPerfil !== 'PROFISSIONAIS_VINCULADOS') return ESCOPO_TODOS;
  return Object.freeze({
    tipo: 'PROFISSIONAIS',
    profissionalIds: Object.freeze(
      [...new Set(profissionalIds)].sort((a, b) => a.localeCompare(b)),
    ),
  });
}
