import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { ApiRequestError, erroInesperadoApi } from '@/lib/api/api-error';
import { errosPorCampo } from '@/lib/api/tratar-erro';

/** Chave do erro geral do servidor em `formState.errors.root`. */
export const ERRO_SERVIDOR = 'servidor';

/**
 * Leva o erro do envio para o formulário (CLAUDE.md, seção 3, "Tratamento de erros"):
 * - 400 com `details` vira erro de cada campo, com foco no primeiro;
 * - 401 e 403 ficam com o tratamento global (login e "Sem permissão");
 * - os demais (409, 422, 500, falha de conexão…) viram o erro geral, mostrado no topo do formulário.
 */
export function aplicarErroServidor<T extends FieldValues>(
  setError: UseFormSetError<T>,
  error: unknown,
): void {
  if (error instanceof ApiRequestError && (error.status === 401 || error.status === 403)) return;

  const campos = Object.entries(errosPorCampo(error));
  if (campos.length > 0) {
    campos.forEach(([campo, message], i) => {
      setError(campo as Path<T>, { type: 'server', message }, { shouldFocus: i === 0 });
    });
    return;
  }

  const message = error instanceof ApiRequestError ? error.message : erroInesperadoApi();
  setError(`root.${ERRO_SERVIDOR}`, { type: 'server', message });
}
