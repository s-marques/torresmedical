import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  indicadoresFinanceirosQuerySchema,
  indicadoresFinanceirosSchema,
  type IndicadoresFinanceiros,
  type IndicadoresFinanceirosQuery,
} from '@torres/shared';
import { RequirePermission } from '../../../common/auth/auth.decorators';
import {
  ApiErrorResponses,
  ApiZodQuery,
  ApiZodResponse,
} from '../../../common/swagger/zod-openapi';
import { ZodValidationPipe } from '../../../common/validation/zod-validation.pipe';
import { IndicadoresFinanceirosService } from './indicadores.service';

/** Tela Indicadores (`/financeiro/indicadores`). Somente leitura: não há `@Audit`. */
@ApiTags('Financeiro: Indicadores')
@Controller('financeiro/indicadores')
export class IndicadoresFinanceirosController {
  constructor(private readonly indicadores: IndicadoresFinanceirosService) {}

  @Get()
  @RequirePermission('financeiro.indicadores.ver')
  @ApiOperation({ summary: 'Indicadores do mês, com o valor do mês anterior e a variação' })
  @ApiZodQuery(indicadoresFinanceirosQuerySchema)
  @ApiZodResponse(200, indicadoresFinanceirosSchema)
  @ApiErrorResponses(400, 401, 403)
  obter(
    @Query(new ZodValidationPipe(indicadoresFinanceirosQuerySchema))
    query: IndicadoresFinanceirosQuery,
  ): Promise<IndicadoresFinanceiros> {
    return this.indicadores.obter(query);
  }
}
