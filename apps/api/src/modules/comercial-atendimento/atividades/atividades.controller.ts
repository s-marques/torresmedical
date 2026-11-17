import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Patch,
  Post,
  Query,
  StreamableFile,
} from '@nestjs/common';
import { ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import {
  atividadeInputSchema,
  atividadePageSchema,
  atividadeSchema,
  exportAtividadesQuerySchema,
  leadsSemFollowUpQuerySchema,
  listAtividadesQuerySchema,
  negocioPageSchema,
  responsavelListaSchema,
  resumoAtividadesQuerySchema,
  resumoAtividadesSchema,
  type Atividade,
  type AtividadeInput,
  type ExportAtividadesQuery,
  type LeadsSemFollowUpQuery,
  type ListAtividadesQuery,
  type Negocio,
  type Responsavel,
  type ResumoAtividades,
  type ResumoAtividadesQuery,
} from '@torres/shared';
import { Audit } from '../../../common/audit/audit.decorator';
import { RequirePermission } from '../../../common/auth/auth.decorators';
import { toStreamableFile } from '../../../common/export/export-response';
import type { Page } from '../../../common/pagination/paginate';
import {
  ApiErrorResponses,
  ApiZodBody,
  ApiZodQuery,
  ApiZodResponse,
} from '../../../common/swagger/zod-openapi';
import { IdParam } from '../../../common/validation/id-param.decorator';
import { ZodValidationPipe } from '../../../common/validation/zod-validation.pipe';
import { NegociosService } from '../pipeline/negocios.service';
import { AtividadesService } from './atividades.service';

const ENTITY = 'AtividadeNegocio';

/** Tela Atividades (`/atividades`): tarefas, ligações e follow-ups do CRM. */
@ApiTags('Comercial / Atendimento: Atividades')
@Controller('comercial-atendimento/atividades')
export class AtividadesController {
  constructor(
    private readonly atividades: AtividadesService,
    private readonly negocios: NegociosService,
  ) {}

  @Get()
  @RequirePermission('comercial-atendimento.atividades.ver')
  @ApiOperation({ summary: 'Lista paginada, com busca, tipo, status e ordenação' })
  @ApiZodQuery(listAtividadesQuerySchema)
  @ApiZodResponse(200, atividadePageSchema)
  @ApiErrorResponses(400, 401, 403)
  list(
    @Query(new ZodValidationPipe(listAtividadesQuerySchema)) query: ListAtividadesQuery,
  ): Promise<Page<Atividade>> {
    return this.atividades.list(query);
  }

  @Get('resumo')
  @RequirePermission('comercial-atendimento.atividades.ver')
  @ApiOperation({ summary: 'Total, pendentes, concluídas e canceladas (cartões do cabeçalho)' })
  @ApiZodQuery(resumoAtividadesQuerySchema)
  @ApiZodResponse(200, resumoAtividadesSchema)
  @ApiErrorResponses(400, 401, 403)
  resumo(
    @Query(new ZodValidationPipe(resumoAtividadesQuerySchema)) query: ResumoAtividadesQuery,
  ): Promise<ResumoAtividades> {
    return this.atividades.resumo(query);
  }

  // Rotas fixas antes de ":id" para não serem lidas como id.
  @Get('export')
  @RequirePermission('comercial-atendimento.atividades.exportar')
  @Audit({ entity: ENTITY, action: 'EXPORT' })
  @ApiOperation({
    summary: 'Exporta em Excel ou PDF com os mesmos filtros e ordenação da listagem',
  })
  @ApiZodQuery(exportAtividadesQuerySchema)
  @ApiProduces(
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/pdf',
  )
  @ApiErrorResponses(400, 401, 403, 422)
  async export(
    @Query(new ZodValidationPipe(exportAtividadesQuerySchema)) query: ExportAtividadesQuery,
  ): Promise<StreamableFile> {
    return toStreamableFile(await this.atividades.export(query));
  }

  @Get('leads-sem-follow-up')
  @RequirePermission('comercial-atendimento.atividades.ver')
  @ApiOperation({
    summary: 'Negócios abertos sem próxima ação futura (sem atividade pendente ou atrasada)',
  })
  @ApiZodQuery(leadsSemFollowUpQuerySchema)
  @ApiZodResponse(200, negocioPageSchema)
  @ApiErrorResponses(400, 401, 403)
  leadsSemFollowUp(
    @Query(new ZodValidationPipe(leadsSemFollowUpQuerySchema)) query: LeadsSemFollowUpQuery,
  ): Promise<Page<Negocio>> {
    return this.atividades.leadsSemFollowUp(query);
  }

  @Get('responsaveis')
  @RequirePermission('comercial-atendimento.atividades.ver')
  @ApiOperation({ summary: 'Usuários ativos para o campo Responsável' })
  @ApiZodResponse(200, responsavelListaSchema)
  @ApiErrorResponses(401, 403)
  responsaveis(): Promise<Responsavel[]> {
    return this.negocios.responsaveis();
  }

  @Get(':id')
  @RequirePermission('comercial-atendimento.atividades.ver')
  @ApiOperation({ summary: 'Detalhe da atividade' })
  @ApiZodResponse(200, atividadeSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  findById(@IdParam() id: string): Promise<Atividade> {
    return this.atividades.findById(id);
  }

  @Post()
  @RequirePermission('comercial-atendimento.atividades.criar')
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Cria (Nova Atividade)' })
  @ApiZodBody(atividadeInputSchema)
  @ApiZodResponse(201, atividadeSchema)
  @ApiErrorResponses(400, 401, 403, 404, 422)
  create(
    @Body(new ZodValidationPipe(atividadeInputSchema)) body: AtividadeInput,
  ): Promise<Atividade> {
    return this.atividades.create(body);
  }

  @Patch(':id')
  @RequirePermission('comercial-atendimento.atividades.editar')
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Altera (Editar Atividade)' })
  @ApiZodBody(atividadeInputSchema)
  @ApiZodResponse(200, atividadeSchema)
  @ApiErrorResponses(400, 401, 403, 404, 422)
  update(
    @IdParam() id: string,
    @Body(new ZodValidationPipe(atividadeInputSchema)) body: AtividadeInput,
  ): Promise<Atividade> {
    return this.atividades.update(id, body);
  }

  @Patch(':id/concluir')
  @RequirePermission('comercial-atendimento.atividades.editar')
  @Audit({ entity: ENTITY })
  @ApiOperation({
    summary:
      'Conclui a atividade pendente. A última pendente de um negócio aberto exige a próxima agendada (422 PROXIMA_ACAO_OBRIGATORIA)',
  })
  @ApiZodResponse(200, atividadeSchema)
  @ApiErrorResponses(400, 401, 403, 404, 422)
  concluir(@IdParam() id: string): Promise<Atividade> {
    return this.atividades.concluir(id);
  }

  @Patch(':id/cancelar')
  @RequirePermission('comercial-atendimento.atividades.editar')
  @Audit({ entity: ENTITY })
  @ApiOperation({
    summary:
      'Cancela a atividade pendente. A última pendente de um negócio aberto exige a próxima agendada (422 PROXIMA_ACAO_OBRIGATORIA)',
  })
  @ApiZodResponse(200, atividadeSchema)
  @ApiErrorResponses(400, 401, 403, 404, 422)
  cancelar(@IdParam() id: string): Promise<Atividade> {
    return this.atividades.cancelar(id);
  }

  @Delete(':id')
  @RequirePermission('comercial-atendimento.atividades.excluir')
  @HttpCode(200)
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Exclui (exclusão lógica)' })
  @ApiZodResponse(200, atividadeSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  remove(@IdParam() id: string): Promise<Atividade> {
    return this.atividades.remove(id);
  }
}
