import { Body, Controller, Delete, Get, HttpCode, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  centroCustoPageSchema,
  centroCustoSchema,
  createCentroCustoSchema,
  listCentrosCustoQuerySchema,
  updateCentroCustoSchema,
  type CreateCentroCustoInput,
  type ListCentrosCustoQuery,
  type UpdateCentroCustoInput,
} from '@torres/shared';
import type { CentroCusto } from '../../../generated/prisma/client';
import { Audit } from '../../../common/audit/audit.decorator';
import { RequirePermission } from '../../../common/auth/auth.decorators';
import type { Page } from '../../../common/pagination/paginate';
import {
  ApiErrorResponses,
  ApiZodBody,
  ApiZodQuery,
  ApiZodResponse,
} from '../../../common/swagger/zod-openapi';
import { IdParam } from '../../../common/validation/id-param.decorator';
import { ZodValidationPipe } from '../../../common/validation/zod-validation.pipe';
import { CentrosCustoService } from './centros-custo.service';

const ENTITY = 'CentroCusto';

/** Aba Centros de Custo da tela Contas a Pagar (`/pagar`). Usa as permissões da tela. */
@ApiTags('Financeiro: Centros de Custo')
@Controller('financeiro/centros-custo')
export class CentrosCustoController {
  constructor(private readonly centros: CentrosCustoService) {}

  @Get()
  @RequirePermission('financeiro.contas-pagar.ver')
  @ApiOperation({ summary: 'Lista paginada, com busca e ordenação' })
  @ApiZodQuery(listCentrosCustoQuerySchema)
  @ApiZodResponse(200, centroCustoPageSchema)
  @ApiErrorResponses(400, 401, 403)
  list(
    @Query(new ZodValidationPipe(listCentrosCustoQuerySchema)) query: ListCentrosCustoQuery,
  ): Promise<Page<CentroCusto>> {
    return this.centros.list(query);
  }

  @Post()
  @RequirePermission('financeiro.contas-pagar.criar')
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Cria (Novo Centro de Custo)' })
  @ApiZodBody(createCentroCustoSchema)
  @ApiZodResponse(201, centroCustoSchema)
  @ApiErrorResponses(400, 401, 403, 409)
  create(
    @Body(new ZodValidationPipe(createCentroCustoSchema)) body: CreateCentroCustoInput,
  ): Promise<CentroCusto> {
    return this.centros.create(body);
  }

  @Patch(':id')
  @RequirePermission('financeiro.contas-pagar.editar')
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Altera o nome ou o interruptor Ativar/Desativar (campo ativo)' })
  @ApiZodBody(updateCentroCustoSchema)
  @ApiZodResponse(200, centroCustoSchema)
  @ApiErrorResponses(400, 401, 403, 404, 409)
  update(
    @IdParam() id: string,
    @Body(new ZodValidationPipe(updateCentroCustoSchema)) body: UpdateCentroCustoInput,
  ): Promise<CentroCusto> {
    return this.centros.update(id, body);
  }

  @Delete(':id')
  @RequirePermission('financeiro.contas-pagar.excluir')
  @HttpCode(200)
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Exclui (exclusão lógica)' })
  @ApiZodResponse(200, centroCustoSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  remove(@IdParam() id: string): Promise<CentroCusto> {
    return this.centros.remove(id);
  }
}
