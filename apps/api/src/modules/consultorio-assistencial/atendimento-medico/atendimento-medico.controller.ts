import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  atendimentoEmCursoSchema,
  atendimentoMedicoDetalheSchema,
  atendimentoMedicoPageSchema,
  evolucaoInputSchema,
  evolucaoPageSchema,
  evolucaoSchema,
  listAtendimentoMedicoQuerySchema,
  listRegistrosQuerySchema,
  pacienteDadosAtendimentoSchema,
  type AtendimentoEmCurso,
  type AtendimentoMedicoDetalhe,
  type AtendimentoMedicoItem,
  type CreateEvolucaoInput,
  type Evolucao,
  type ListAtendimentoMedicoQuery,
  type ListRegistrosQuery,
  type PacienteDadosAtendimento,
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
import { AtendimentoMedicoService } from './atendimento-medico.service';

/** Tela Atendimento Médico (`/atendimento-medico`): agendamentos do dia e o atendimento. */
@ApiTags('Consultório / Assistencial: Atendimento Médico')
@Controller('consultorio-assistencial/atendimento-medico')
export class AtendimentoMedicoController {
  constructor(private readonly service: AtendimentoMedicoService) {}

  @Get()
  @RequirePermission('consultorio-assistencial.atendimento-medico.ver')
  @ApiOperation({ summary: 'Agendamentos do dia, com filtro por profissional e status' })
  @ApiZodQuery(listAtendimentoMedicoQuerySchema)
  @ApiZodResponse(200, atendimentoMedicoPageSchema)
  @ApiErrorResponses(400, 401, 403)
  listar(
    @Query(new ZodValidationPipe(listAtendimentoMedicoQuerySchema))
    query: ListAtendimentoMedicoQuery,
  ): Promise<Page<AtendimentoMedicoItem>> {
    return this.service.listar(query);
  }

  @Get(':agendamentoId')
  @RequirePermission('consultorio-assistencial.atendimento-medico.ver')
  @ApiOperation({ summary: 'Cabeçalho do detalhe: agendamento e atendimento em curso' })
  @ApiZodResponse(200, atendimentoMedicoDetalheSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  detalhe(@IdParam('agendamentoId') agendamentoId: string): Promise<AtendimentoMedicoDetalhe> {
    return this.service.detalhe(agendamentoId);
  }

  @Post(':agendamentoId/iniciar')
  @RequirePermission('consultorio-assistencial.atendimento-medico.criar')
  @Audit({ entity: 'Atendimento' })
  @ApiOperation({
    summary: '"Atender"/"Iniciar Atendimento": grava a entrada e muda o status do agendamento',
  })
  @ApiZodResponse(201, atendimentoEmCursoSchema)
  @ApiErrorResponses(400, 401, 403, 404, 409, 422)
  iniciar(@IdParam('agendamentoId') agendamentoId: string): Promise<AtendimentoEmCurso> {
    return this.service.iniciar(agendamentoId);
  }

  @Get(':agendamentoId/evolucoes')
  @RequirePermission('consultorio-assistencial.atendimento-medico.ver')
  @ApiOperation({ summary: '"Histórico de Evoluções" do paciente' })
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
  @RequirePermission('consultorio-assistencial.atendimento-medico.criar')
  @Audit({ entity: 'AtendimentoEvolucao' })
  @ApiOperation({ summary: '"Salvar Evolução" do atendimento em andamento' })
  @ApiZodBody(evolucaoInputSchema)
  @ApiZodResponse(201, evolucaoSchema)
  @ApiErrorResponses(400, 401, 403, 404, 422)
  criarEvolucao(
    @IdParam('agendamentoId') agendamentoId: string,
    @Body(new ZodValidationPipe(evolucaoInputSchema)) body: CreateEvolucaoInput,
  ): Promise<Evolucao> {
    return this.service.criarEvolucao(agendamentoId, body);
  }

  @Get(':agendamentoId/paciente')
  @RequirePermission('consultorio-assistencial.atendimento-medico.ver')
  @ApiOperation({ summary: 'Aba "Dados": informações pessoais e contato do paciente' })
  @ApiZodResponse(200, pacienteDadosAtendimentoSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  dadosPaciente(
    @IdParam('agendamentoId') agendamentoId: string,
  ): Promise<PacienteDadosAtendimento> {
    return this.service.dadosPaciente(agendamentoId);
  }
}
