import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  evolucaoPageSchema,
  evolucaoSchema,
  evolucaoVozAgendamentoPageSchema,
  evolucaoVozAgendamentoSchema,
  evolucaoVozInputSchema,
  listEvolucaoVozQuerySchema,
  listRegistrosQuerySchema,
  type CreateEvolucaoVozInput,
  type Evolucao,
  type EvolucaoVozAgendamento,
  type ListEvolucaoVozQuery,
  type ListRegistrosQuery,
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
import { IdParam } from '../../../common/validation/id-param.decorator';
import { ZodValidationPipe } from '../../../common/validation/zod-validation.pipe';
import { EvolucaoVozService } from './evolucao-voz.service';

/** Tela Evolução por Voz (`/evolucoes`): agendamentos de hoje e a gravação da evolução. */
@ApiTags('Consultório / Assistencial: Evolução por Voz')
@Controller('consultorio-assistencial/evolucao-voz')
export class EvolucaoVozController {
  constructor(private readonly service: EvolucaoVozService) {}

  @Get()
  @RequirePermission('consultorio-assistencial.evolucao-voz.ver')
  @ApiOperation({ summary: '"Agendamentos de Hoje", com busca por paciente e profissional' })
  @ApiZodQuery(listEvolucaoVozQuerySchema)
  @ApiZodResponse(200, evolucaoVozAgendamentoPageSchema)
  @ApiErrorResponses(400, 401, 403)
  listar(
    @Query(new ZodValidationPipe(listEvolucaoVozQuerySchema)) query: ListEvolucaoVozQuery,
  ): Promise<Page<EvolucaoVozAgendamento>> {
    return this.service.listar(query);
  }

  @Get(':agendamentoId')
  @RequirePermission('consultorio-assistencial.evolucao-voz.ver')
  @ApiOperation({ summary: 'Cabeçalho da sessão: paciente, profissional e número do agendamento' })
  @ApiZodResponse(200, evolucaoVozAgendamentoSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  detalhe(@IdParam('agendamentoId') agendamentoId: string): Promise<EvolucaoVozAgendamento> {
    return this.service.detalhe(agendamentoId);
  }

  @Get(':agendamentoId/evolucoes')
  @RequirePermission('consultorio-assistencial.evolucao-voz.ver')
  @ApiOperation({ summary: '"Histórico": evoluções do paciente' })
  @ApiZodQuery(listRegistrosQuerySchema)
  @ApiZodResponse(200, evolucaoPageSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  listarEvolucoes(
    @IdParam('agendamentoId') agendamentoId: string,
    @Query(new ZodValidationPipe(listRegistrosQuerySchema)) query: ListRegistrosQuery,
  ): Promise<Page<Evolucao>> {
    return this.service.listarEvolucoes(agendamentoId, query);
  }

  @Post(':agendamentoId/evolucoes')
  @RequirePermission('consultorio-assistencial.evolucao-voz.criar')
  @Audit({ entity: 'AtendimentoEvolucao' })
  @ApiOperation({
    summary: '"Salvar Evolução": grava a transcrição; inicia o atendimento se preciso',
  })
  @ApiZodBody(evolucaoVozInputSchema)
  @ApiZodResponse(201, evolucaoSchema)
  @ApiErrorResponses(400, 401, 403, 404, 422)
  salvar(
    @IdParam('agendamentoId') agendamentoId: string,
    @Body(new ZodValidationPipe(evolucaoVozInputSchema)) body: CreateEvolucaoVozInput,
  ): Promise<Evolucao> {
    return this.service.salvar(agendamentoId, body);
  }
}
