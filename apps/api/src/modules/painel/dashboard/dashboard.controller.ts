import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import {
  abaPainelSchema,
  dashboardPainelSchema,
  filtrosPainelSchema,
  type AbaPainel,
  type DashboardPainel,
  type FiltrosPainel,
} from '@torres/shared';
import { RequirePermission } from '../../../common/auth/auth.decorators';
import {
  ApiErrorResponses,
  ApiZodQuery,
  ApiZodResponse,
} from '../../../common/swagger/zod-openapi';
import { ZodValidationPipe } from '../../../common/validation/zod-validation.pipe';
import { DashboardService } from './dashboard.service';

/** Tela Painel (`/`). Somente leitura: não há `@Audit`. */
@ApiTags('Painel: Dashboard')
@Controller('painel/dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get(':aba')
  @RequirePermission('painel.painel.ver')
  @ApiOperation({ summary: 'Indicadores, tabelas e gráficos de uma aba do dashboard' })
  @ApiParam({ name: 'aba', enum: abaPainelSchema.options })
  @ApiZodQuery(filtrosPainelSchema)
  @ApiZodResponse(200, dashboardPainelSchema)
  @ApiErrorResponses(400, 401, 403)
  obter(
    @Param('aba', new ZodValidationPipe(abaPainelSchema)) aba: AbaPainel,
    @Query(new ZodValidationPipe(filtrosPainelSchema)) filtros: FiltrosPainel,
  ): Promise<DashboardPainel> {
    return this.dashboard.obter(aba, filtros);
  }
}
