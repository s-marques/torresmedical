import { Body, Controller, Get, Post, Query, StreamableFile } from '@nestjs/common';
import { ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import {
  catalogoVendaPageSchema,
  catalogoVendaQuerySchema,
  criarVendaSchema,
  exportVendasQuerySchema,
  listVendasQuerySchema,
  vendaPageSchema,
  vendaSchema,
  type CatalogoVendaItem,
  type CatalogoVendaQuery,
  type CriarVendaInput,
  type ExportVendasQuery,
  type ListVendasQuery,
  type Venda,
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
import { ZodValidationPipe } from '../../../common/validation/zod-validation.pipe';
import { VendasService } from './vendas.service';

const ENTITY = 'Venda';

/** Tela Vendas/PDV (`/vendas`), aba Vendas (PDV). */
@ApiTags('Comercial/Atendimento: Vendas/PDV')
@Controller('comercial-atendimento/vendas')
export class VendasController {
  constructor(private readonly vendas: VendasService) {}

  @Get()
  @RequirePermission('comercial-atendimento.vendas-pdv.ver')
  @ApiOperation({ summary: 'Lista paginada, com busca por cliente, filtro de status e ordenação' })
  @ApiZodQuery(listVendasQuerySchema)
  @ApiZodResponse(200, vendaPageSchema)
  @ApiErrorResponses(400, 401, 403)
  list(
    @Query(new ZodValidationPipe(listVendasQuerySchema)) query: ListVendasQuery,
  ): Promise<Page<Venda>> {
    return this.vendas.list(query);
  }

  // Antes de qualquer rota com parâmetro, para "export" e "catalogo" não virarem id.
  @Get('export')
  @RequirePermission('comercial-atendimento.vendas-pdv.exportar')
  @Audit({ entity: ENTITY, action: 'EXPORT' })
  @ApiOperation({
    summary: 'Exporta em Excel ou PDF com os mesmos filtros e ordenação da listagem',
  })
  @ApiZodQuery(exportVendasQuerySchema)
  @ApiProduces(
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/pdf',
    'text/csv',
  )
  @ApiErrorResponses(400, 401, 403, 422)
  async export(
    @Query(new ZodValidationPipe(exportVendasQuerySchema)) query: ExportVendasQuery,
  ): Promise<StreamableFile> {
    return toStreamableFile(await this.vendas.export(query));
  }

  @Get('catalogo')
  @RequirePermission('comercial-atendimento.vendas-pdv.criar')
  @ApiOperation({
    summary: 'Produtos/serviços ou protocolos que podem entrar na venda (com preço)',
  })
  @ApiZodQuery(catalogoVendaQuerySchema)
  @ApiZodResponse(200, catalogoVendaPageSchema)
  @ApiErrorResponses(400, 401, 403)
  catalogo(
    @Query(new ZodValidationPipe(catalogoVendaQuerySchema)) query: CatalogoVendaQuery,
  ): Promise<Page<CatalogoVendaItem>> {
    return this.vendas.catalogo(query);
  }

  @Post()
  @RequirePermission('comercial-atendimento.vendas-pdv.criar')
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Registra uma venda Finalizada (Finalizar Venda do PDV)' })
  @ApiZodBody(criarVendaSchema)
  @ApiZodResponse(201, vendaSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  criar(@Body(new ZodValidationPipe(criarVendaSchema)) body: CriarVendaInput): Promise<Venda> {
    return this.vendas.create(body);
  }
}
