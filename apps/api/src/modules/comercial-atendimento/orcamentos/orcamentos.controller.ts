import { Body, Controller, Get, HttpCode, Post, Query, StreamableFile } from '@nestjs/common';
import { ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import {
  cancelarSemReagendamentoSchema,
  catalogoOrcamentoPageSchema,
  catalogoOrcamentoQuerySchema,
  criarOrcamentoSchema,
  exportOrcamentosQuerySchema,
  listOrcamentosQuerySchema,
  orcamentoPageSchema,
  orcamentoSchema,
  type CancelarSemReagendamentoInput,
  type CatalogoOrcamentoItem,
  type CatalogoOrcamentoQuery,
  type CriarOrcamentoInput,
  type ExportOrcamentosQuery,
  type ListOrcamentosQuery,
  type Orcamento,
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
import { OrcamentosService } from './orcamentos.service';

const ENTITY = 'Orcamento';

/** Tela Orçamentos (`/orcamentos`). */
@ApiTags('Comercial/Atendimento: Orçamentos')
@Controller('comercial-atendimento/orcamentos')
export class OrcamentosController {
  constructor(private readonly orcamentos: OrcamentosService) {}

  @Get()
  @RequirePermission('comercial-atendimento.orcamentos.ver')
  @ApiOperation({ summary: 'Lista paginada, com busca por cliente, filtro de status e ordenação' })
  @ApiZodQuery(listOrcamentosQuerySchema)
  @ApiZodResponse(200, orcamentoPageSchema)
  @ApiErrorResponses(400, 401, 403)
  list(
    @Query(new ZodValidationPipe(listOrcamentosQuerySchema)) query: ListOrcamentosQuery,
  ): Promise<Page<Orcamento>> {
    return this.orcamentos.list(query);
  }

  // Antes de qualquer rota com parâmetro, para "export" e "catalogo" não virarem id.
  @Get('export')
  @RequirePermission('comercial-atendimento.orcamentos.exportar')
  @Audit({ entity: ENTITY, action: 'EXPORT' })
  @ApiOperation({
    summary: 'Exporta em Excel ou PDF com os mesmos filtros e ordenação da listagem',
  })
  @ApiZodQuery(exportOrcamentosQuerySchema)
  @ApiProduces(
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/pdf',
    'text/csv',
  )
  @ApiErrorResponses(400, 401, 403, 422)
  async export(
    @Query(new ZodValidationPipe(exportOrcamentosQuerySchema)) query: ExportOrcamentosQuery,
  ): Promise<StreamableFile> {
    return toStreamableFile(await this.orcamentos.export(query));
  }

  @Get('catalogo')
  @RequirePermission('comercial-atendimento.orcamentos.criar')
  @ApiOperation({
    summary: 'Serviços, protocolos ou protocolos mãe que podem entrar no orçamento (com preço)',
  })
  @ApiZodQuery(catalogoOrcamentoQuerySchema)
  @ApiZodResponse(200, catalogoOrcamentoPageSchema)
  @ApiErrorResponses(400, 401, 403)
  catalogo(
    @Query(new ZodValidationPipe(catalogoOrcamentoQuerySchema)) query: CatalogoOrcamentoQuery,
  ): Promise<Page<CatalogoOrcamentoItem>> {
    return this.orcamentos.catalogo(query);
  }

  @Post()
  @RequirePermission('comercial-atendimento.orcamentos.criar')
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Cria um orçamento Pendente (Criar Orçamento)' })
  @ApiZodBody(criarOrcamentoSchema)
  @ApiZodResponse(201, orcamentoSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  criar(
    @Body(new ZodValidationPipe(criarOrcamentoSchema)) body: CriarOrcamentoInput,
  ): Promise<Orcamento> {
    return this.orcamentos.create(body);
  }

  @Post(':id/cancelar')
  @RequirePermission('comercial-atendimento.orcamentos.editar')
  @HttpCode(200)
  @Audit({ entity: ENTITY, action: 'UPDATE' })
  @ApiOperation({
    summary: 'Cancela o orçamento pendente ou aprovado, com o motivo da lista (#162)',
  })
  @ApiZodBody(cancelarSemReagendamentoSchema)
  @ApiZodResponse(200, orcamentoSchema)
  @ApiErrorResponses(400, 401, 403, 404, 409)
  cancelar(
    @IdParam() id: string,
    @Body(new ZodValidationPipe(cancelarSemReagendamentoSchema))
    body: CancelarSemReagendamentoInput,
  ): Promise<Orcamento> {
    return this.orcamentos.cancelar(id, body);
  }
}
