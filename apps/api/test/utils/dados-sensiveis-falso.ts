import { DadosSensiveisService } from '../../src/common/auth/dados-sensiveis.service';
import type { RequestContextService } from '../../src/common/context/request-context.service';

/** `DadosSensiveisService` real sobre um contexto falso, para testes unitários. */
export function dadosSensiveisFalso(permitido = false): DadosSensiveisService {
  return new DadosSensiveisService({
    getVerDadosSensiveis: () => permitido,
  } as unknown as RequestContextService);
}
