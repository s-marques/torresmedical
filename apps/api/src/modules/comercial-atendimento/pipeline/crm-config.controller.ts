import { Body, Controller, Delete, Get, HttpCode, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  estagioInputSchema,
  estagioSchema,
  motivoPerdaInputSchema,
  motivoPerdaListaSchema,
  motivoPerdaSchema,
  pipelineInputSchema,
  pipelineListaSchema,
  pipelineSchema,
  type Estagio,
  type EstagioInput,
  type MotivoPerda,
  type MotivoPerdaInput,
  type Pipeline,
  type PipelineInput,
} from '@torres/shared';
import { Audit } from '../../../common/audit/audit.decorator';
import { RequirePermission } from '../../../common/auth/auth.decorators';
import { ApiErrorResponses, ApiZodBody, ApiZodResponse } from '../../../common/swagger/zod-openapi';
import { IdParam } from '../../../common/validation/id-param.decorator';
import { ZodValidationPipe } from '../../../common/validation/zod-validation.pipe';
import { CrmConfigService } from './crm-config.service';

/** Modal "Configurações do CRM" da tela Pipeline (`/crm`): pipelines, estágios e motivos de perda. */
@ApiTags('Comercial/Atendimento: Pipeline (configurações)')
@Controller('comercial-atendimento/pipeline')
export class CrmConfigController {
  constructor(private readonly config: CrmConfigService) {}

  @Get('pipelines')
  @RequirePermission('comercial-atendimento.pipeline.ver')
  @ApiOperation({ summary: 'Pipelines com os estágios e a quantidade de negócios de cada estágio' })
  @ApiZodResponse(200, pipelineListaSchema)
  @ApiErrorResponses(401, 403)
  listPipelines(): Promise<Pipeline[]> {
    return this.config.listPipelines();
  }

  @Post('pipelines')
  @RequirePermission('comercial-atendimento.pipeline.criar')
  @Audit({ entity: 'Pipeline' })
  @ApiOperation({ summary: 'Cria um pipeline ("Nome do novo pipeline" + Criar)' })
  @ApiZodBody(pipelineInputSchema)
  @ApiZodResponse(201, pipelineSchema)
  @ApiErrorResponses(400, 401, 403, 409)
  createPipeline(
    @Body(new ZodValidationPipe(pipelineInputSchema)) body: PipelineInput,
  ): Promise<Pipeline> {
    return this.config.createPipeline(body);
  }

  @Patch('pipelines/:id')
  @RequirePermission('comercial-atendimento.pipeline.editar')
  @Audit({ entity: 'Pipeline' })
  @ApiOperation({ summary: 'Renomeia o pipeline' })
  @ApiZodBody(pipelineInputSchema)
  @ApiZodResponse(200, pipelineSchema)
  @ApiErrorResponses(400, 401, 403, 404, 409)
  updatePipeline(
    @IdParam() id: string,
    @Body(new ZodValidationPipe(pipelineInputSchema)) body: PipelineInput,
  ): Promise<Pipeline> {
    return this.config.updatePipeline(id, body);
  }

  @Delete('pipelines/:id')
  @RequirePermission('comercial-atendimento.pipeline.excluir')
  @HttpCode(200)
  @Audit({ entity: 'Pipeline' })
  @ApiOperation({ summary: 'Exclui o pipeline e os estágios (exclusão lógica). Só sem negócios' })
  @ApiZodResponse(200, pipelineSchema)
  @ApiErrorResponses(400, 401, 403, 404, 409)
  removePipeline(@IdParam() id: string): Promise<Pipeline> {
    return this.config.removePipeline(id);
  }

  @Post('pipelines/:id/estagios')
  @RequirePermission('comercial-atendimento.pipeline.criar')
  @Audit({ entity: 'EstagioPipeline' })
  @ApiOperation({ summary: 'Adiciona um estágio no fim do pipeline (nome, cor e marco)' })
  @ApiZodBody(estagioInputSchema)
  @ApiZodResponse(201, estagioSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  createEstagio(
    @IdParam() pipelineId: string,
    @Body(new ZodValidationPipe(estagioInputSchema)) body: EstagioInput,
  ): Promise<Estagio> {
    return this.config.createEstagio(pipelineId, body);
  }

  @Patch('estagios/:id')
  @RequirePermission('comercial-atendimento.pipeline.editar')
  @Audit({ entity: 'EstagioPipeline' })
  @ApiOperation({ summary: 'Altera nome, cor e marco do estágio' })
  @ApiZodBody(estagioInputSchema)
  @ApiZodResponse(200, estagioSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  updateEstagio(
    @IdParam() id: string,
    @Body(new ZodValidationPipe(estagioInputSchema)) body: EstagioInput,
  ): Promise<Estagio> {
    return this.config.updateEstagio(id, body);
  }

  @Delete('estagios/:id')
  @RequirePermission('comercial-atendimento.pipeline.excluir')
  @HttpCode(200)
  @Audit({ entity: 'EstagioPipeline' })
  @ApiOperation({ summary: 'Exclui o estágio (exclusão lógica). Só sem negócios' })
  @ApiZodResponse(200, estagioSchema)
  @ApiErrorResponses(400, 401, 403, 404, 409)
  removeEstagio(@IdParam() id: string): Promise<Estagio> {
    return this.config.removeEstagio(id);
  }

  @Get('motivos-perda')
  @RequirePermission('comercial-atendimento.pipeline.ver')
  @ApiOperation({ summary: 'Motivos de perda, na ordem da lista' })
  @ApiZodResponse(200, motivoPerdaListaSchema)
  @ApiErrorResponses(401, 403)
  listMotivosPerda(): Promise<MotivoPerda[]> {
    return this.config.listMotivosPerda();
  }

  @Post('motivos-perda')
  @RequirePermission('comercial-atendimento.pipeline.criar')
  @Audit({ entity: 'MotivoPerda' })
  @ApiOperation({ summary: 'Adiciona um motivo de perda (o código vem do nome)' })
  @ApiZodBody(motivoPerdaInputSchema)
  @ApiZodResponse(201, motivoPerdaSchema)
  @ApiErrorResponses(400, 401, 403, 409)
  createMotivoPerda(
    @Body(new ZodValidationPipe(motivoPerdaInputSchema)) body: MotivoPerdaInput,
  ): Promise<MotivoPerda> {
    return this.config.createMotivoPerda(body);
  }

  @Patch('motivos-perda/:id')
  @RequirePermission('comercial-atendimento.pipeline.editar')
  @Audit({ entity: 'MotivoPerda' })
  @ApiOperation({ summary: 'Renomeia o motivo de perda (o código não muda)' })
  @ApiZodBody(motivoPerdaInputSchema)
  @ApiZodResponse(200, motivoPerdaSchema)
  @ApiErrorResponses(400, 401, 403, 404, 409)
  updateMotivoPerda(
    @IdParam() id: string,
    @Body(new ZodValidationPipe(motivoPerdaInputSchema)) body: MotivoPerdaInput,
  ): Promise<MotivoPerda> {
    return this.config.updateMotivoPerda(id, body);
  }

  @Delete('motivos-perda/:id')
  @RequirePermission('comercial-atendimento.pipeline.excluir')
  @HttpCode(200)
  @Audit({ entity: 'MotivoPerda' })
  @ApiOperation({ summary: 'Exclui o motivo (exclusão lógica). Só se nenhum negócio o usar' })
  @ApiZodResponse(200, motivoPerdaSchema)
  @ApiErrorResponses(400, 401, 403, 404, 409)
  removeMotivoPerda(@IdParam() id: string): Promise<MotivoPerda> {
    return this.config.removeMotivoPerda(id);
  }
}
