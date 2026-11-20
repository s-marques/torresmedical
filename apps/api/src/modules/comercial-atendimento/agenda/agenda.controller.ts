import { Body, Controller, Get, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  agendaProfissionaisSchema,
  agendamentoListaSchema,
  agendamentoSchema,
  createAgendamentoSchema,
  listAgendamentosQuerySchema,
  salaSugeridaQuerySchema,
  salaSugeridaSchema,
  updateAgendamentoSchema,
  type Agendamento,
  type AgendamentoLista,
  type CreateAgendamentoInput,
  type ListAgendamentosQuery,
  type SalaSugerida,
  type SalaSugeridaQuery,
  type UpdateAgendamentoInput,
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
import { AgendaService } from './agenda.service';

const ENTITY = 'Agendamento';

/** Tela Agenda (`/agenda`). */
@ApiTags('Comercial / Atendimento: Agenda')
@Controller('comercial-atendimento/agendamentos')
export class AgendaController {
  constructor(private readonly agenda: AgendaService) {}

  @Get()
  @RequirePermission('comercial-atendimento.agenda.ver')
  @ApiOperation({ summary: 'Agendamentos do período (semana ou dia), com filtro de profissional' })
  @ApiZodQuery(listAgendamentosQuerySchema)
  @ApiZodResponse(200, agendamentoListaSchema)
  @ApiErrorResponses(400, 401, 403)
  async list(
    @Query(new ZodValidationPipe(listAgendamentosQuerySchema)) query: ListAgendamentosQuery,
  ): Promise<AgendamentoLista> {
    return { data: await this.agenda.list(query) };
  }

  /** Antes de `:id` para não ser lido como id. */
  @Get('profissionais')
  @RequirePermission('comercial-atendimento.agenda.ver')
  @ApiOperation({ summary: 'Profissionais ativos com a cor do calendário (colunas e filtro)' })
  @ApiZodResponse(200, agendaProfissionaisSchema)
  @ApiErrorResponses(401, 403)
  async profissionais() {
    return { data: await this.agenda.listarProfissionais() };
  }

  /** Antes de `:id` para não ser lido como id. */
  @Get('sala-sugerida')
  @RequirePermission('comercial-atendimento.agenda.criar')
  @ApiOperation({ summary: 'Sala do contrato do profissional para o dia e a hora (sugestão)' })
  @ApiZodQuery(salaSugeridaQuerySchema)
  @ApiZodResponse(200, salaSugeridaSchema)
  @ApiErrorResponses(400, 401, 403)
  salaSugerida(
    @Query(new ZodValidationPipe(salaSugeridaQuerySchema)) query: SalaSugeridaQuery,
  ): Promise<SalaSugerida> {
    return this.agenda.sugerirSala(query);
  }

  @Get(':id')
  @RequirePermission('comercial-atendimento.agenda.ver')
  @ApiOperation({ summary: 'Detalhe do agendamento' })
  @ApiZodResponse(200, agendamentoSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  findById(@IdParam() id: string): Promise<Agendamento> {
    return this.agenda.findById(id);
  }

  @Post()
  @RequirePermission('comercial-atendimento.agenda.criar')
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Cria um agendamento (status Agendado)' })
  @ApiZodBody(createAgendamentoSchema)
  @ApiZodResponse(201, agendamentoSchema)
  @ApiErrorResponses(400, 401, 403, 404, 409)
  create(
    @Body(new ZodValidationPipe(createAgendamentoSchema)) body: CreateAgendamentoInput,
  ): Promise<Agendamento> {
    return this.agenda.create(body);
  }

  @Patch(':id')
  @RequirePermission('comercial-atendimento.agenda.editar')
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Reagenda: altera sala, data, hora e/ou duração' })
  @ApiZodBody(updateAgendamentoSchema)
  @ApiZodResponse(200, agendamentoSchema)
  @ApiErrorResponses(400, 401, 403, 404, 409)
  update(
    @IdParam() id: string,
    @Body(new ZodValidationPipe(updateAgendamentoSchema)) body: UpdateAgendamentoInput,
  ): Promise<Agendamento> {
    return this.agenda.update(id, body);
  }
}
