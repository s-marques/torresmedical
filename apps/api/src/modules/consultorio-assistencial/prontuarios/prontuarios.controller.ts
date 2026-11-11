import { Body, Controller, Get, Post, Put, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  anamneseInputSchema,
  anamnesePageSchema,
  anamneseSchema,
  atendimentoInputSchema,
  atendimentoPageSchema,
  atendimentoSchema,
  historicoClinicoPageSchema,
  listPacientesComRegistrosQuerySchema,
  listRegistrosQuerySchema,
  pacienteResumoProntuarioSchema,
  pacientesComRegistrosPageSchema,
  prontuarioInputSchema,
  prontuarioSchema,
  type Anamnese,
  type Atendimento,
  type CreateAnamneseInput,
  type CreateAtendimentoInput,
  type HistoricoClinicoItem,
  type ListPacientesComRegistrosQuery,
  type ListRegistrosQuery,
  type PacienteComRegistros,
  type PacienteResumoProntuario,
  type Prontuario,
  type UpsertProntuarioInput,
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
import { ProntuariosService } from './prontuarios.service';

/** Tela Prontuários (`/prontuarios`): busca de paciente, prontuário, atendimentos, anamneses
 *  e histórico clínico. */
@ApiTags('Consultório / Assistencial: Prontuários')
@Controller('consultorio-assistencial/prontuarios')
export class ProntuariosController {
  constructor(private readonly prontuarios: ProntuariosService) {}

  @Get()
  @RequirePermission('consultorio-assistencial.prontuarios.ver')
  @ApiOperation({ summary: 'Card "Pacientes com Prontuário": só quem tem registro clínico' })
  @ApiZodQuery(listPacientesComRegistrosQuerySchema)
  @ApiZodResponse(200, pacientesComRegistrosPageSchema)
  @ApiErrorResponses(400, 401, 403)
  listarComRegistros(
    @Query(new ZodValidationPipe(listPacientesComRegistrosQuerySchema))
    query: ListPacientesComRegistrosQuery,
  ): Promise<Page<PacienteComRegistros>> {
    return this.prontuarios.listarComRegistros(query);
  }

  @Get(':pacienteId/paciente')
  @RequirePermission('consultorio-assistencial.prontuarios.ver')
  @ApiOperation({ summary: 'Cabeçalho do paciente ao abrir o prontuário (busca do topo)' })
  @ApiZodResponse(200, pacienteResumoProntuarioSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  paciente(@IdParam('pacienteId') pacienteId: string): Promise<PacienteResumoProntuario> {
    return this.prontuarios.paciente(pacienteId);
  }

  @Get(':pacienteId')
  @RequirePermission('consultorio-assistencial.prontuarios.ver')
  @ApiOperation({ summary: 'Aba "Prontuário": alergias, medicamentos, doenças etc.' })
  @ApiZodResponse(200, prontuarioSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  detalheProntuario(@IdParam('pacienteId') pacienteId: string): Promise<Prontuario> {
    return this.prontuarios.detalheProntuario(pacienteId);
  }

  @Put(':pacienteId')
  @RequirePermission('consultorio-assistencial.prontuarios.editar')
  @Audit({ entity: 'Prontuario', idParam: 'pacienteId' })
  @ApiOperation({ summary: 'Botão "Salvar": cria o prontuário se ainda não existir' })
  @ApiZodBody(prontuarioInputSchema)
  @ApiZodResponse(200, prontuarioSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  salvarProntuario(
    @IdParam('pacienteId') pacienteId: string,
    @Body(new ZodValidationPipe(prontuarioInputSchema)) body: UpsertProntuarioInput,
  ): Promise<Prontuario> {
    return this.prontuarios.salvarProntuario(pacienteId, body);
  }

  @Get(':pacienteId/atendimentos')
  @RequirePermission('consultorio-assistencial.prontuarios.ver')
  @ApiOperation({ summary: 'Aba "Atendimentos": histórico de atendimentos do paciente' })
  @ApiZodQuery(listRegistrosQuerySchema)
  @ApiZodResponse(200, atendimentoPageSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  listarAtendimentos(
    @IdParam('pacienteId') pacienteId: string,
    @Query(new ZodValidationPipe(listRegistrosQuerySchema)) query: ListRegistrosQuery,
  ): Promise<Page<Atendimento>> {
    return this.prontuarios.listarAtendimentos(pacienteId, query);
  }

  @Post(':pacienteId/atendimentos')
  @RequirePermission('consultorio-assistencial.prontuarios.criar')
  @Audit({ entity: 'Atendimento' })
  @ApiOperation({ summary: 'Botão "Novo Atendimento"' })
  @ApiZodBody(atendimentoInputSchema)
  @ApiZodResponse(201, atendimentoSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  criarAtendimento(
    @IdParam('pacienteId') pacienteId: string,
    @Body(new ZodValidationPipe(atendimentoInputSchema)) body: CreateAtendimentoInput,
  ): Promise<Atendimento> {
    return this.prontuarios.criarAtendimento(pacienteId, body);
  }

  @Get(':pacienteId/anamneses')
  @RequirePermission('consultorio-assistencial.prontuarios.ver')
  @ApiOperation({ summary: 'Aba "Anamneses": registros de anamnese do paciente' })
  @ApiZodQuery(listRegistrosQuerySchema)
  @ApiZodResponse(200, anamnesePageSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  listarAnamneses(
    @IdParam('pacienteId') pacienteId: string,
    @Query(new ZodValidationPipe(listRegistrosQuerySchema)) query: ListRegistrosQuery,
  ): Promise<Page<Anamnese>> {
    return this.prontuarios.listarAnamneses(pacienteId, query);
  }

  @Post(':pacienteId/anamneses')
  @RequirePermission('consultorio-assistencial.prontuarios.criar')
  @Audit({ entity: 'Anamnese' })
  @ApiOperation({ summary: 'Botão "Nova Anamnese"' })
  @ApiZodBody(anamneseInputSchema)
  @ApiZodResponse(201, anamneseSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  criarAnamnese(
    @IdParam('pacienteId') pacienteId: string,
    @Body(new ZodValidationPipe(anamneseInputSchema)) body: CreateAnamneseInput,
  ): Promise<Anamnese> {
    return this.prontuarios.criarAnamnese(pacienteId, body);
  }

  @Get(':pacienteId/historico-clinico')
  @RequirePermission('consultorio-assistencial.prontuarios.ver')
  @ApiOperation({
    summary: 'Aba "Histórico Clínico": linha do tempo somente leitura (atendimentos e anamneses)',
  })
  @ApiZodQuery(listRegistrosQuerySchema)
  @ApiZodResponse(200, historicoClinicoPageSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  historicoClinico(
    @IdParam('pacienteId') pacienteId: string,
    @Query(new ZodValidationPipe(listRegistrosQuerySchema)) query: ListRegistrosQuery,
  ): Promise<Page<HistoricoClinicoItem>> {
    return this.prontuarios.historicoClinico(pacienteId, query);
  }
}
