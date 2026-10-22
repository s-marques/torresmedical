import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  salaDashboardQuerySchema,
  salaDashboardSchema,
  salaOcupacaoQuerySchema,
  salaOcupacaoSchema,
  type SalaDashboard,
  type SalaDashboardQuery,
  type SalaOcupacao,
  type SalaOcupacaoQuery,
} from '@torres/shared';
import { RequirePermission } from '../../../common/auth/auth.decorators';
import {
  ApiErrorResponses,
  ApiZodQuery,
  ApiZodResponse,
} from '../../../common/swagger/zod-openapi';
import { ZodValidationPipe } from '../../../common/validation/zod-validation.pipe';
import { SalasPainelService } from './salas-painel.service';

/**
 * Abas Mapa Ocupação e Dashboard da tela Gestão de Salas (só leitura). Registrado antes do
 * `SalasController` para "ocupacao" e "dashboard" não serem tratados como `:id`.
 */
@ApiTags('Gestão Profissionais: Salas (Mapa e Dashboard)')
@Controller('gestao-profissionais/salas')
export class SalasPainelController {
  constructor(private readonly painel: SalasPainelService) {}

  @Get('ocupacao')
  @RequirePermission('gestao-profissionais.salas.ver')
  @ApiOperation({
    summary: 'Mapa de ocupação da semana (segunda a domingo) que contém `inicio` (padrão: hoje)',
  })
  @ApiZodQuery(salaOcupacaoQuerySchema)
  @ApiZodResponse(200, salaOcupacaoSchema)
  @ApiErrorResponses(400, 401, 403)
  ocupacao(
    @Query(new ZodValidationPipe(salaOcupacaoQuerySchema)) query: SalaOcupacaoQuery,
  ): Promise<SalaOcupacao> {
    return this.painel.ocupacao(query);
  }

  @Get('dashboard')
  @RequirePermission('gestao-profissionais.salas.ver')
  @ApiOperation({ summary: 'Total, ocupadas, disponíveis, taxa e receita mensal por sala' })
  @ApiZodQuery(salaDashboardQuerySchema)
  @ApiZodResponse(200, salaDashboardSchema)
  @ApiErrorResponses(400, 401, 403)
  dashboard(
    @Query(new ZodValidationPipe(salaDashboardQuerySchema)) query: SalaDashboardQuery,
  ): Promise<SalaDashboard> {
    return this.painel.dashboard(query);
  }
}
