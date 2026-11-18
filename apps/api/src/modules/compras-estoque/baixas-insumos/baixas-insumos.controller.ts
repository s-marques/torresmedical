import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  baixaInsumoInputSchema,
  baixaInsumoPageSchema,
  baixaInsumoSchema,
  listBaixasInsumosQuerySchema,
  type BaixaInsumo,
  type BaixaInsumoInput,
  type ListBaixasInsumosQuery,
} from '@torres/shared';
import { Audit } from '../../../common/audit/audit.decorator';
import { RequirePermission } from '../../../common/auth/auth.decorators';
import type { Page } from '../../../common/pagination/paginate';
import {
  ApiErrorResponses,
  ApiZodBody,
  ApiZodQuery,
  ApiZodResponse,
} from '../../../common/swagger/zod-openapi';
import { ZodValidationPipe } from '../../../common/validation/zod-validation.pipe';
import { BaixasInsumosService } from './baixas-insumos.service';

const ENTITY = 'BaixaInsumo';

/** Tela Baixa de Insumos (`/baixa-insumos`). */
@ApiTags('Compras / Estoque: Baixa de Insumos')
@Controller('compras-estoque/baixas-insumos')
export class BaixasInsumosController {
  constructor(private readonly baixas: BaixasInsumosService) {}

  @Get()
  @RequirePermission('compras-estoque.baixa-insumos.ver')
  @ApiOperation({ summary: 'Lista as baixas de insumos, com filtro de período e ordenação' })
  @ApiZodQuery(listBaixasInsumosQuerySchema)
  @ApiZodResponse(200, baixaInsumoPageSchema)
  @ApiErrorResponses(400, 401, 403)
  list(
    @Query(new ZodValidationPipe(listBaixasInsumosQuerySchema)) query: ListBaixasInsumosQuery,
  ): Promise<Page<BaixaInsumo>> {
    return this.baixas.list(query);
  }

  @Post()
  @RequirePermission('compras-estoque.baixa-insumos.criar')
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Registrar Baixa: grava a baixa e subtrai o saldo de cada insumo' })
  @ApiZodBody(baixaInsumoInputSchema)
  @ApiZodResponse(201, baixaInsumoSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  create(
    @Body(new ZodValidationPipe(baixaInsumoInputSchema)) body: BaixaInsumoInput,
  ): Promise<BaixaInsumo> {
    return this.baixas.create(body);
  }
}
