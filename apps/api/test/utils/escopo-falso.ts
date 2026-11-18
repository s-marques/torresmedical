import { escopoDoUsuario, type EscopoDados } from '../../src/common/auth/escopo-dados';
import { EscopoDadosService } from '../../src/common/auth/escopo-dados.service';
import type { RequestContextService } from '../../src/common/context/request-context.service';

/**
 * `EscopoDadosService` real sobre um contexto falso, para testes unitários (issue #153).
 * Sem argumentos: sem restrição. Com ids: perfil restrito a esses profissionais.
 */
export function escopoFalso(profissionalIds?: readonly string[]): EscopoDadosService {
  const escopo: EscopoDados =
    profissionalIds === undefined
      ? escopoDoUsuario('TODOS', [])
      : escopoDoUsuario('PROFISSIONAIS_VINCULADOS', profissionalIds);
  return new EscopoDadosService({
    getEscopoDados: () => escopo,
  } as unknown as RequestContextService);
}
