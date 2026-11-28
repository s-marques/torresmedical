import { Body, Controller, Delete, Get, HttpCode, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  acompanhamentoMetasQuerySchema,
  acompanhamentoMetasSchema,
  listMetasComerciaisQuerySchema,
  metaComercialInputSchema,
  metaComercialPageSchema,
  metaComercialSchema,
  type AcompanhamentoMetas,
  type AcompanhamentoMetasQuery,
  type ListMetasComerciaisQuery,
  type MetaComercial,
  type MetaComercialInput,
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
import { MetasService } from './metas.service';

const ENTITY = 'MetaComercial';

/** Tela Metas (`/crm/metas`): metas comerciais projetadas × realizadas por período. */
@ApiTags('Comercial / Atendimento: Metas')
@Controller('comercial-atendimento/metas')
export class MetasController {
  constructor(private readonly metas: MetasService) {}

  @Get()
  @RequirePermission('comercial-atendimento.metas.ver')
  @ApiOperation({ summary: 'Lista paginada, com o realizado do CRM em cada meta' })
  @ApiZodQuery(listMetasComerciaisQuerySchema)
  @ApiZodResponse(200, metaComercialPageSchema)
  @ApiErrorResponses(400, 401, 403)
  list(
    @Query(new ZodValidationPipe(listMetasComerciaisQuerySchema)) query: ListMetasComerciaisQuery,
  ): Promise<Page<MetaComercial>> {
    return this.metas.list(query);
  }

  // Antes de ":id" para "acompanhamento" não ser tratado como id.
  @Get('acompanhamento')
  @RequirePermission('comercial-atendimento.metas.ver')
  @ApiOperation({
    summary: 'Projetado × realizado por métrica, com a evolução período a período',
  })
  @ApiZodQuery(acompanhamentoMetasQuerySchema)
  @ApiZodResponse(200, acompanhamentoMetasSchema)
  @ApiErrorResponses(400, 401, 403)
  acompanhamento(
    @Query(new ZodValidationPipe(acompanhamentoMetasQuerySchema)) query: AcompanhamentoMetasQuery,
  ): Promise<AcompanhamentoMetas> {
    return this.metas.acompanhamento(query);
  }

  @Get(':id')
  @RequirePermission('comercial-atendimento.metas.ver')
  @ApiOperation({ summary: 'Detalhe' })
  @ApiZodResponse(200, metaComercialSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  findById(@IdParam() id: string): Promise<MetaComercial> {
    return this.metas.findById(id);
  }

  @Post()
  @RequirePermission('comercial-atendimento.metas.criar')
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Cadastra a meta de uma métrica num período (mês ou trimestre)' })
  @ApiZodBody(metaComercialInputSchema)
  @ApiZodResponse(201, metaComercialSchema)
  @ApiErrorResponses(400, 401, 403, 409)
  create(
    @Body(new ZodValidationPipe(metaComercialInputSchema)) body: MetaComercialInput,
  ): Promise<MetaComercial> {
    return this.metas.create(body);
  }

  @Patch(':id')
  @RequirePermission('comercial-atendimento.metas.editar')
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Altera a meta' })
  @ApiZodBody(metaComercialInputSchema)
  @ApiZodResponse(200, metaComercialSchema)
  @ApiErrorResponses(400, 401, 403, 404, 409)
  update(
    @IdParam() id: string,
    @Body(new ZodValidationPipe(metaComercialInputSchema)) body: MetaComercialInput,
  ): Promise<MetaComercial> {
    return this.metas.update(id, body);
  }

  @Delete(':id')
  @RequirePermission('comercial-atendimento.metas.excluir')
  @HttpCode(200)
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Exclui (exclusão lógica)' })
  @ApiZodResponse(200, metaComercialSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  remove(@IdParam() id: string): Promise<MetaComercial> {
    return this.metas.remove(id);
  }
}
