import { Body, Controller, Delete, Get, HttpCode, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  contratoHoraSchema,
  contratoHorasResponseSchema,
  createContratoHoraSchema,
  listContratoHorasQuerySchema,
  type ContratoHora,
  type ContratoHorasResponse,
  type CreateContratoHoraInput,
  type ListContratoHorasQuery,
} from '@torres/shared';
import { Audit } from '../../../common/audit/audit.decorator';
import { RequirePermission } from '../../../common/auth/auth.decorators';
import {
  ApiErrorResponses,
  ApiZodBody,
  ApiZodQuery,
  ApiZodResponse,
} from '../../../common/swagger/zod-openapi';
import { IdParam } from '../../../common/validation/id-param.decorator';
import { ZodValidationPipe } from '../../../common/validation/zod-validation.pipe';
import { ContratosSalaHorasService } from './contratos-sala-horas.service';

const ENTITY = 'ContratoSalaHora';

/** Modal "Horas Utilizadas" dos contratos de Hora Avulsa. Usa as permissões da tela Salas. */
@ApiTags('Gestão Profissionais: Horas utilizadas dos contratos de salas')
@Controller('gestao-profissionais/contratos-sala/:id/horas')
export class ContratosSalaHorasController {
  constructor(private readonly horas: ContratosSalaHorasService) {}

  @Get()
  @RequirePermission('gestao-profissionais.salas.ver')
  @ApiOperation({ summary: 'Horas lançadas no mês (`mes=AAAA-MM`), com o resumo do contrato' })
  @ApiZodQuery(listContratoHorasQuerySchema)
  @ApiZodResponse(200, contratoHorasResponseSchema)
  @ApiErrorResponses(400, 401, 403, 404, 409)
  list(
    @IdParam() id: string,
    @Query(new ZodValidationPipe(listContratoHorasQuerySchema)) query: ListContratoHorasQuery,
  ): Promise<ContratoHorasResponse> {
    return this.horas.list(id, query);
  }

  @Post()
  @RequirePermission('gestao-profissionais.salas.editar')
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Adiciona um lançamento (Novo Lançamento)' })
  @ApiZodBody(createContratoHoraSchema)
  @ApiZodResponse(201, contratoHoraSchema)
  @ApiErrorResponses(400, 401, 403, 404, 409)
  create(
    @IdParam() id: string,
    @Body(new ZodValidationPipe(createContratoHoraSchema)) body: CreateContratoHoraInput,
  ): Promise<ContratoHora> {
    return this.horas.create(id, body);
  }

  @Delete(':horaId')
  @RequirePermission('gestao-profissionais.salas.editar')
  @HttpCode(200)
  @Audit({ entity: ENTITY, idParam: 'horaId' })
  @ApiOperation({ summary: 'Remove um lançamento' })
  @ApiZodResponse(200, contratoHoraSchema)
  @ApiErrorResponses(400, 401, 403, 404, 409)
  remove(@IdParam() id: string, @IdParam('horaId') horaId: string): Promise<ContratoHora> {
    return this.horas.remove(id, horaId);
  }
}
