import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  atendimentoEmCursoSchema,
  atendimentoMedicoDetalheSchema,
  atendimentoMedicoPageSchema,
  evolucaoInputSchema,
  evolucaoPageSchema,
  evolucaoSchema,
  historicoAtendimentoPageSchema,
  listAtendimentoMedicoQuerySchema,
  listProtocolosReceitaQuerySchema,
  listRegistrosQuerySchema,
  pacienteDadosAtendimentoSchema,
  pagamentoAtendimentoSchema,
  protocoloCategoriasSchema,
  protocoloReceitaPageSchema,
  receitaInputSchema,
  receitaPageSchema,
  receitaSchema,
  recebimentoInputSchema,
  recebimentoSchema,
  type AtendimentoEmCurso,
  type AtendimentoMedicoDetalhe,
  type AtendimentoMedicoItem,
  type CreateEvolucaoInput,
  type CreateReceitaInput,
  type CreateRecebimentoInput,
  type Evolucao,
  type HistoricoAtendimento,
  type ListAtendimentoMedicoQuery,
  type ListProtocolosReceitaQuery,
  type ListRegistrosQuery,
  type PacienteDadosAtendimento,
  type PagamentoAtendimento,
  type ProtocoloCategorias,
  type ProtocoloReceita,
  type Receita,
  type Recebimento,
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

  // Rotas fixas antes de `:agendamentoId`.
  @Get('protocolos')
  @RequirePermission('consultorio-assistencial.atendimento-medico.ver')
  @ApiOperation({ summary: '"Selecionar Protocolo/Receita": protocolos do cadastro' })
  @ApiZodQuery(listProtocolosReceitaQuerySchema)
  @ApiZodResponse(200, protocoloReceitaPageSchema)
  @ApiErrorResponses(400, 401, 403)
  listarProtocolos(
    @Query(new ZodValidationPipe(listProtocolosReceitaQuerySchema))
    query: ListProtocolosReceitaQuery,
  ): Promise<Page<ProtocoloReceita>> {
    return this.service.listarProtocolos(query);
  }

  @Get('protocolos/categorias')
  @RequirePermission('consultorio-assistencial.atendimento-medico.ver')
  @ApiOperation({ summary: 'Categorias do select "Todas" do seletor de protocolos' })
  @ApiZodResponse(200, protocoloCategoriasSchema)
  @ApiErrorResponses(401, 403)
  categoriasProtocolos(): Promise<ProtocoloCategorias> {
    return this.service.categoriasProtocolos();
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

  @Get(':agendamentoId/receitas')
  @RequirePermission('consultorio-assistencial.atendimento-medico.ver')
  @ApiOperation({ summary: '"Receitas Anteriores" do paciente' })
  @ApiZodQuery(listRegistrosQuerySchema)
  @ApiZodResponse(200, receitaPageSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  listarReceitas(
    @IdParam('agendamentoId') agendamentoId: string,
    @Query(new ZodValidationPipe(listRegistrosQuerySchema)) query: ListRegistrosQuery,
  ): Promise<Page<Receita>> {
    return this.service.listarReceitas(agendamentoId, query);
  }

  @Post(':agendamentoId/receitas')
  @RequirePermission('consultorio-assistencial.atendimento-medico.criar')
  @Audit({ entity: 'AtendimentoReceita' })
  @ApiOperation({ summary: '"Salvar Receita" (receita manual) do atendimento em andamento' })
  @ApiZodBody(receitaInputSchema)
  @ApiZodResponse(201, receitaSchema)
  @ApiErrorResponses(400, 401, 403, 404, 422)
  criarReceita(
    @IdParam('agendamentoId') agendamentoId: string,
    @Body(new ZodValidationPipe(receitaInputSchema)) body: CreateReceitaInput,
  ): Promise<Receita> {
    return this.service.criarReceita(agendamentoId, body);
  }

  @Get(':agendamentoId/pagamento')
  @RequirePermission('consultorio-assistencial.atendimento-medico.ver')
  @ApiOperation({ summary: 'Aba "Pagamento": valor, já recebido, saldo e formas aceitas' })
  @ApiZodResponse(200, pagamentoAtendimentoSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  pagamento(@IdParam('agendamentoId') agendamentoId: string): Promise<PagamentoAtendimento> {
    return this.service.pagamento(agendamentoId);
  }

  @Post(':agendamentoId/recebimentos')
  @RequirePermission('consultorio-assistencial.atendimento-medico.criar')
  @Audit({ entity: 'AgendamentoRecebimento' })
  @ApiOperation({ summary: '"Registrar Pagamento": recebimento parcial ou total da consulta' })
  @ApiZodBody(recebimentoInputSchema)
  @ApiZodResponse(201, recebimentoSchema)
  @ApiErrorResponses(400, 401, 403, 404, 422)
  registrarRecebimento(
    @IdParam('agendamentoId') agendamentoId: string,
    @Body(new ZodValidationPipe(recebimentoInputSchema)) body: CreateRecebimentoInput,
  ): Promise<Recebimento> {
    return this.service.registrarRecebimento(agendamentoId, body);
  }

  @Get(':agendamentoId/historico')
  @RequirePermission('consultorio-assistencial.atendimento-medico.ver')
  @ApiOperation({ summary: 'Aba "Histórico": atendimentos do paciente com as evoluções' })
  @ApiZodQuery(listRegistrosQuerySchema)
  @ApiZodResponse(200, historicoAtendimentoPageSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  historico(
    @IdParam('agendamentoId') agendamentoId: string,
    @Query(new ZodValidationPipe(listRegistrosQuerySchema)) query: ListRegistrosQuery,
  ): Promise<Page<HistoricoAtendimento>> {
    return this.service.historico(agendamentoId, query);
  }

  /** Auditado no service: o `before` é o atendimento, achado pelo agendamento. */
  @Post(':agendamentoId/finalizar')
  @RequirePermission('consultorio-assistencial.atendimento-medico.editar')
  @ApiOperation({
    summary: '"Finalizar": grava o horário de fim e muda o agendamento para Atendido',
  })
  @ApiZodResponse(201, atendimentoEmCursoSchema)
  @ApiErrorResponses(400, 401, 403, 404, 422)
  finalizar(@IdParam('agendamentoId') agendamentoId: string): Promise<AtendimentoEmCurso> {
    return this.service.finalizar(agendamentoId);
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
