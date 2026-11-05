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
  compraPageSchema,
  compraSchema,
  compraXmlPreviaSchema,
  createCompraSchema,
  exportComprasQuerySchema,
  importarXmlCompraSchema,
  listComprasQuerySchema,
  updateCompraSchema,
  type Compra,
  type CompraXmlPrevia,
  type CreateCompraInput,
  type ExportComprasQuery,
  type ImportarXmlCompraInput,
  type ListComprasQuery,
  type UpdateCompraInput,
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
import { ComprasService } from './compras.service';

const ENTITY = 'Compra';

/** Tela Entrada de Compras (`/compras`). */
@ApiTags('Compras / Estoque: Entrada de Compras')
@Controller('compras-estoque/compras')
export class ComprasController {
  constructor(private readonly compras: ComprasService) {}

  @Get()
  @RequirePermission('compras-estoque.entrada-compras.ver')
  @ApiOperation({ summary: 'Lista paginada, com busca, status e ordenação' })
  @ApiZodQuery(listComprasQuerySchema)
  @ApiZodResponse(200, compraPageSchema)
  @ApiErrorResponses(400, 401, 403)
  list(
    @Query(new ZodValidationPipe(listComprasQuerySchema)) query: ListComprasQuery,
  ): Promise<Page<Compra>> {
    return this.compras.list(query);
  }

  // Antes de ":id" para "export" não ser tratado como id.
  @Get('export')
  @RequirePermission('compras-estoque.entrada-compras.exportar')
  @Audit({ entity: ENTITY, action: 'EXPORT' })
  @ApiOperation({
    summary: 'Exporta em Excel ou PDF com os mesmos filtros e ordenação da listagem',
  })
  @ApiZodQuery(exportComprasQuerySchema)
  @ApiProduces(
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/pdf',
  )
  @ApiErrorResponses(400, 401, 403, 422)
  async export(
    @Query(new ZodValidationPipe(exportComprasQuerySchema)) query: ExportComprasQuery,
  ): Promise<StreamableFile> {
    return toStreamableFile(await this.compras.export(query));
  }

  @Post('importar-xml')
  @RequirePermission('compras-estoque.entrada-compras.criar')
  @HttpCode(200)
  @ApiOperation({ summary: 'Lê o XML de uma NF-e e devolve a prévia da compra (não grava)' })
  @ApiZodBody(importarXmlCompraSchema)
  @ApiZodResponse(200, compraXmlPreviaSchema)
  @ApiErrorResponses(400, 401, 403, 422)
  importarXml(
    @Body(new ZodValidationPipe(importarXmlCompraSchema)) body: ImportarXmlCompraInput,
  ): Promise<CompraXmlPrevia> {
    return this.compras.importarXml(body.xml);
  }

  @Get(':id')
  @RequirePermission('compras-estoque.entrada-compras.ver')
  @ApiOperation({ summary: 'Detalhe' })
  @ApiZodResponse(200, compraSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  findById(@IdParam() id: string): Promise<Compra> {
    return this.compras.findById(id);
  }

  @Post()
  @RequirePermission('compras-estoque.entrada-compras.criar')
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Registra a compra (Nova Compra) e dá entrada no estoque' })
  @ApiZodBody(createCompraSchema)
  @ApiZodResponse(201, compraSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  create(
    @Body(new ZodValidationPipe(createCompraSchema)) body: CreateCompraInput,
  ): Promise<Compra> {
    return this.compras.create(body);
  }

  @Patch(':id')
  @RequirePermission('compras-estoque.entrada-compras.editar')
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Altera a compra e refaz a entrada no estoque' })
  @ApiZodBody(updateCompraSchema)
  @ApiZodResponse(200, compraSchema)
  @ApiErrorResponses(400, 401, 403, 404, 422)
  update(
    @IdParam() id: string,
    @Body(new ZodValidationPipe(updateCompraSchema)) body: UpdateCompraInput,
  ): Promise<Compra> {
    return this.compras.update(id, body);
  }

  @Post(':id/cancelar')
  @RequirePermission('compras-estoque.entrada-compras.editar')
  @HttpCode(200)
  @Audit({ entity: ENTITY, action: 'UPDATE' })
  @ApiOperation({ summary: 'Cancela a compra e devolve a entrada do estoque' })
  @ApiZodResponse(200, compraSchema)
  @ApiErrorResponses(400, 401, 403, 404, 422)
  cancelar(@IdParam() id: string): Promise<Compra> {
    return this.compras.cancelar(id);
  }

  @Delete(':id')
  @RequirePermission('compras-estoque.entrada-compras.excluir')
  @HttpCode(200)
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Exclui (exclusão lógica) e devolve a entrada do estoque' })
  @ApiZodResponse(200, compraSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  remove(@IdParam() id: string): Promise<Compra> {
    return this.compras.remove(id);
  }
}
