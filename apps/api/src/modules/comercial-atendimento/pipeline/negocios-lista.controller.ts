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
  exportNegociosQuerySchema,
  listNegociosQuerySchema,
  motivoPerdaListaSchema,
  negocioPageSchema,
  negocioSchema,
  negocioTelaInputSchema,
  pipelineListaSchema,
  resumoNegociosQuerySchema,
  resumoQuadroSchema,
  responsavelListaSchema,
  type ExportNegociosQuery,
  type ListNegociosQuery,
  type MotivoPerda,
  type Negocio,
  type NegocioTelaInput,
  type Pipeline,
  type ResumoNegociosQuery,
  type ResumoQuadro,
  type Responsavel,
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
import { CrmConfigService } from './crm-config.service';
import { NegociosListaService } from './negocios-lista.service';
import { NegociosService } from './negocios.service';

const ENTITY = 'Negocio';

/** Tela Negócios (`/negocios`): listagem em grid dos negócios do CRM. */
@ApiTags('Comercial / Atendimento: Negócios')
@Controller('comercial-atendimento/negocios')
export class NegociosListaController {
  constructor(
    private readonly lista: NegociosListaService,
    private readonly negocios: NegociosService,
    private readonly config: CrmConfigService,
  ) {}

  @Get()
  @RequirePermission('comercial-atendimento.negocios.ver')
  @ApiOperation({
    summary: 'Lista paginada, com busca, pipeline, status e ordenação',
  })
  @ApiZodQuery(listNegociosQuerySchema)
  @ApiZodResponse(200, negocioPageSchema)
  @ApiErrorResponses(400, 401, 403)
  list(
    @Query(new ZodValidationPipe(listNegociosQuerySchema)) query: ListNegociosQuery,
  ): Promise<Page<Negocio>> {
    return this.lista.list(query);
  }

  @Get('resumo')
  @RequirePermission('comercial-atendimento.negocios.ver')
  @ApiOperation({ summary: 'Quantidade e valor por status (cartões do cabeçalho)' })
  @ApiZodQuery(resumoNegociosQuerySchema)
  @ApiZodResponse(200, resumoQuadroSchema)
  @ApiErrorResponses(400, 401, 403)
  resumo(
    @Query(new ZodValidationPipe(resumoNegociosQuerySchema)) query: ResumoNegociosQuery,
  ): Promise<ResumoQuadro> {
    return this.lista.resumo(query);
  }

  // Antes de ":id" para "export" não ser tratado como id.
  @Get('export')
  @RequirePermission('comercial-atendimento.negocios.exportar')
  @Audit({ entity: ENTITY, action: 'EXPORT' })
  @ApiOperation({
    summary: 'Exporta em Excel ou PDF com os mesmos filtros e ordenação da listagem',
  })
  @ApiZodQuery(exportNegociosQuerySchema)
  @ApiProduces(
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/pdf',
    'text/csv',
  )
  @ApiErrorResponses(400, 401, 403, 422)
  async export(
    @Query(new ZodValidationPipe(exportNegociosQuerySchema)) query: ExportNegociosQuery,
  ): Promise<StreamableFile> {
    return toStreamableFile(await this.lista.export(query));
  }

  @Get('pipelines')
  @RequirePermission('comercial-atendimento.negocios.ver')
  @ApiOperation({ summary: 'Pipelines com os estágios (filtro e campos Pipeline/Estágio)' })
  @ApiZodResponse(200, pipelineListaSchema)
  @ApiErrorResponses(401, 403)
  pipelines(): Promise<Pipeline[]> {
    return this.config.listPipelines();
  }

  @Get('motivos-perda')
  @RequirePermission('comercial-atendimento.negocios.ver')
  @ApiOperation({ summary: 'Motivos de perda (lista padronizada)' })
  @ApiZodResponse(200, motivoPerdaListaSchema)
  @ApiErrorResponses(401, 403)
  motivosPerda(): Promise<MotivoPerda[]> {
    return this.config.listMotivosPerda();
  }

  @Get('responsaveis')
  @RequirePermission('comercial-atendimento.negocios.ver')
  @ApiOperation({ summary: 'Usuários ativos para o campo Responsável' })
  @ApiZodResponse(200, responsavelListaSchema)
  @ApiErrorResponses(401, 403)
  responsaveis(): Promise<Responsavel[]> {
    return this.negocios.responsaveis();
  }

  @Post()
  @RequirePermission('comercial-atendimento.negocios.criar')
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Cria (Novo Negócio)' })
  @ApiZodBody(negocioTelaInputSchema)
  @ApiZodResponse(201, negocioSchema)
  @ApiErrorResponses(400, 401, 403, 404, 422)
  create(
    @Body(new ZodValidationPipe(negocioTelaInputSchema)) body: NegocioTelaInput,
  ): Promise<Negocio> {
    return this.negocios.createDaTela(body);
  }

  @Patch(':id')
  @RequirePermission('comercial-atendimento.negocios.editar')
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Altera (Editar Negócio)' })
  @ApiZodBody(negocioTelaInputSchema)
  @ApiZodResponse(200, negocioSchema)
  @ApiErrorResponses(400, 401, 403, 404, 422)
  update(
    @IdParam() id: string,
    @Body(new ZodValidationPipe(negocioTelaInputSchema)) body: NegocioTelaInput,
  ): Promise<Negocio> {
    return this.negocios.updateDaTela(id, body);
  }

  @Delete(':id')
  @RequirePermission('comercial-atendimento.negocios.excluir')
  @HttpCode(200)
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Exclui (exclusão lógica)' })
  @ApiZodResponse(200, negocioSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  remove(@IdParam() id: string): Promise<Negocio> {
    return this.negocios.remove(id);
  }
}
