import { Injectable } from '@nestjs/common';
import { RequestContextService } from '../context/request-context.service';
import { ApiException } from '../errors/api.exception';
import { ErrorCode } from '../errors/error-codes';
import { ESCOPO_TODOS, type EscopoDados } from './escopo-dados';

export const FORA_DO_ESCOPO = 'Sem permissão';

/** Filtro Prisma do campo `profissionalId`: um id, uma lista ou nenhum (`undefined`). */
export type FiltroProfissional = string | { in: string[] } | undefined;

/**
 * Helper único de escopo de dados (issue #153, CLAUDE.md seção 6). Restringe os dados de
 * agenda, pacientes, prontuário e salas aos profissionais vinculados ao usuário quando o perfil
 * tem o escopo `PROFISSIONAIS_VINCULADOS`. O escopo é gravado no contexto da requisição pelo
 * guard global; fora de uma requisição (filas, rotinas) vale `TODOS`.
 *
 * Fora do escopo a resposta é 403 "Sem permissão" (confirmado pelo dev).
 */
@Injectable()
export class EscopoDadosService {
  constructor(private readonly context: RequestContextService) {}

  atual(): EscopoDados {
    return this.context.getEscopoDados() ?? ESCOPO_TODOS;
  }

  restrito(): boolean {
    return this.atual().tipo === 'PROFISSIONAIS';
  }

  /** Profissionais visíveis; `null` = todos (sem restrição). */
  profissionalIds(): readonly string[] | null {
    const escopo = this.atual();
    return escopo.tipo === 'PROFISSIONAIS' ? escopo.profissionalIds : null;
  }

  /** O registro do profissional está no escopo? Registro sem profissional só é visível sem restrição. */
  permite(profissionalId: string | null | undefined): boolean {
    const ids = this.profissionalIds();
    if (ids === null) return true;
    return typeof profissionalId === 'string' && ids.includes(profissionalId);
  }

  /** 403 quando o registro é de um profissional fora do escopo. */
  garantirProfissional(profissionalId: string | null | undefined): void {
    if (!this.permite(profissionalId)) throw semPermissao();
  }

  /**
   * Valor do filtro `profissionalId` de uma listagem. Sem restrição, devolve o filtro pedido
   * (ou `undefined`, todos). Restrito, devolve o pedido quando permitido (403 se não) ou a lista
   * dos vinculados.
   */
  filtroProfissional(solicitado?: string | null): FiltroProfissional {
    const ids = this.profissionalIds();
    if (ids === null) return solicitado ?? undefined;
    if (solicitado) {
      this.garantirProfissional(solicitado);
      return solicitado;
    }
    return { in: [...ids] };
  }
}

export function semPermissao(): ApiException {
  return new ApiException(403, ErrorCode.FORBIDDEN, FORA_DO_ESCOPO);
}
