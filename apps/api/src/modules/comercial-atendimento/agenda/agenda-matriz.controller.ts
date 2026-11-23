import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  agendaMatrizQuerySchema,
  agendaMatrizSchema,
  type AgendaMatriz,
  type AgendaMatrizQuery,
} from '@torres/shared';
import { RequirePermission } from '../../../common/auth/auth.decorators';
import {
  ApiErrorResponses,
  ApiZodQuery,
  ApiZodResponse,
} from '../../../common/swagger/zod-openapi';
import { ZodValidationPipe } from '../../../common/validation/zod-validation.pipe';
import { AgendaMatrizService } from './agenda-matriz.service';

/** Visão Matriz da Agenda (`/agenda`): Sala × Dia × Horário × Profissional (issue #137). Só leitura. */
@ApiTags('Comercial / Atendimento: Agenda matricial')
@Controller('comercial-atendimento/agenda-matriz')
export class AgendaMatrizController {
  constructor(private readonly matriz: AgendaMatrizService) {}

  @Get()
  @RequirePermission('comercial-atendimento.agenda.ver')
  @ApiOperation({
    summary:
      'Salas × dias × horas (dia) ou turnos (semana e mês) com contratos, agendamentos e bloqueios',
  })
  @ApiZodQuery(agendaMatrizQuerySchema)
  @ApiZodResponse(200, agendaMatrizSchema)
  @ApiErrorResponses(400, 401, 403)
  consultar(
    @Query(new ZodValidationPipe(agendaMatrizQuerySchema)) query: AgendaMatrizQuery,
  ): Promise<AgendaMatriz> {
    return this.matriz.matriz(query);
  }
}
