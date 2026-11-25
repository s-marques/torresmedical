import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  profissionalHistoricoQuerySchema,
  profissionalHistoricoSchema,
  type ProfissionalHistorico,
  type ProfissionalHistoricoQuery,
} from '@torres/shared';
import { RequirePermission } from '../../../common/auth/auth.decorators';
import {
  ApiErrorResponses,
  ApiZodQuery,
  ApiZodResponse,
} from '../../../common/swagger/zod-openapi';
import { IdParam } from '../../../common/validation/id-param.decorator';
import { ZodValidationPipe } from '../../../common/validation/zod-validation.pipe';
import { ProfissionaisHistoricoService } from './profissionais-historico.service';

/** Linha do tempo do relacionamento com o profissional (issue #144). Somente leitura. */
@ApiTags('Gestão Profissionais: Histórico do profissional')
@Controller('gestao-profissionais/profissionais')
export class ProfissionaisHistoricoController {
  constructor(private readonly historico: ProfissionaisHistoricoService) {}

  @Get(':id/historico')
  @RequirePermission('gestao-profissionais.profissionais.ver')
  @ApiOperation({
    summary:
      'Linha do tempo do lead ao primeiro atendimento (CRM, contrato, onboarding e atendimento), com filtro por tipo',
  })
  @ApiZodQuery(profissionalHistoricoQuerySchema)
  @ApiZodResponse(200, profissionalHistoricoSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  listar(
    @IdParam() id: string,
    @Query(new ZodValidationPipe(profissionalHistoricoQuerySchema))
    query: ProfissionalHistoricoQuery,
  ): Promise<ProfissionalHistorico> {
    return this.historico.listar(id, query);
  }
}
