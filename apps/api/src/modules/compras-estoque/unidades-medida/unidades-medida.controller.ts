import { Body, Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  createUnidadeMedidaSchema,
  unidadeMedidaSchema,
  type CreateUnidadeMedidaInput,
} from '@torres/shared';
import type { UnidadeMedida } from '../../../generated/prisma/client';
import { Audit } from '../../../common/audit/audit.decorator';
import { RequirePermission } from '../../../common/auth/auth.decorators';
import { ApiErrorResponses, ApiZodBody, ApiZodResponse } from '../../../common/swagger/zod-openapi';
import { ZodValidationPipe } from '../../../common/validation/zod-validation.pipe';
import { UnidadesMedidaService } from './unidades-medida.service';

/** Modal "Unidades de Medida" da tela Produtos/Serviços. A lista é o lookup `unidades-medida`. */
@ApiTags('Compras / Estoque: Unidades de medida')
@Controller('compras-estoque/unidades-medida')
export class UnidadesMedidaController {
  constructor(private readonly unidades: UnidadesMedidaService) {}

  @Post()
  @RequirePermission('compras-estoque.produtos-servicos.criar')
  @Audit({ entity: 'UnidadeMedida' })
  @ApiOperation({ summary: 'Inclui (Incluir, no modal Unidades de Medida)' })
  @ApiZodBody(createUnidadeMedidaSchema)
  @ApiZodResponse(201, unidadeMedidaSchema)
  @ApiErrorResponses(400, 401, 403)
  create(
    @Body(new ZodValidationPipe(createUnidadeMedidaSchema)) body: CreateUnidadeMedidaInput,
  ): Promise<UnidadeMedida> {
    return this.unidades.create(body);
  }
}
