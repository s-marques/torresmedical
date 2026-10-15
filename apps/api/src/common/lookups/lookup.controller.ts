import { Controller, Get, Inject, Query, type Type } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  LOOKUP_PERMISSOES,
  lookupItemSchema,
  lookupPageSchema,
  lookupQuerySchemas,
  type LookupEntidade,
  type LookupItem,
  type LookupQuery,
  type Permissao,
} from '@torres/shared';
import { RequirePermission } from '../auth/auth.decorators';
import type { Page } from '../pagination/paginate';
import { ApiErrorResponses, ApiZodQuery, ApiZodResponse } from '../swagger/zod-openapi';
import { IdParam } from '../validation/id-param.decorator';
import { ZodValidationPipe } from '../validation/zod-validation.pipe';

/** O que o service do módulo dono expõe para o lookup da entidade. */
export interface ProvedorLookup<E extends LookupEntidade> {
  lookup(query: LookupQuery<E>): Promise<Page<LookupItem>>;
  findLookupById(id: string): Promise<LookupItem>;
}

/**
 * Controller de `GET /api/lookups/<entidade>` e `GET /api/lookups/<entidade>/:id`, registrado
 * pelo módulo dono da entidade com o service dele. A permissão é qualquer uma de
 * `LOOKUP_PERMISSOES[entidade]` (`packages/shared`).
 */
export function criarLookupController<E extends LookupEntidade>(
  entidade: E,
  provedor: Type<ProvedorLookup<E>>,
): Type<unknown> {
  const querySchema = lookupQuerySchemas[entidade];
  const permissoes: readonly [Permissao, ...Permissao[]] = LOOKUP_PERMISSOES[entidade];

  @ApiTags('Lookups (combobox)')
  @Controller(`lookups/${entidade}`)
  @RequirePermission(...permissoes)
  class LookupController {
    constructor(@Inject(provedor) private readonly service: ProvedorLookup<E>) {}

    @Get()
    @ApiOperation({ summary: `Itens de ${entidade} para combobox: ativos, com busca e paginação` })
    @ApiZodQuery(querySchema)
    @ApiZodResponse(200, lookupPageSchema)
    @ApiErrorResponses(400, 401, 403)
    list(
      @Query(new ZodValidationPipe(querySchema)) query: LookupQuery<E>,
    ): Promise<Page<LookupItem>> {
      return this.service.lookup(query);
    }

    @Get(':id')
    @ApiOperation({
      summary: `Item de ${entidade} pelo id (inclusive inativo), para exibir o valor`,
    })
    @ApiZodResponse(200, lookupItemSchema)
    @ApiErrorResponses(400, 401, 403, 404)
    findById(@IdParam() id: string): Promise<LookupItem> {
      return this.service.findLookupById(id);
    }
  }

  const nome = entidade.replaceAll(/(^|-)([a-z])/g, (_trecho, _hifen, letra: string) =>
    letra.toUpperCase(),
  );
  Object.defineProperty(LookupController, 'name', { value: `${nome}LookupController` });
  return LookupController;
}
