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
  createPedidoCompraSchema,
  exportPedidosCompraQuerySchema,
  listPedidosCompraQuerySchema,
  pedidoCompraPageSchema,
  pedidoCompraSchema,
  updatePedidoCompraSchema,
  type CreatePedidoCompraInput,
  type ExportPedidosCompraQuery,
  type ListPedidosCompraQuery,
  type PedidoCompra,
  type UpdatePedidoCompraInput,
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
import { PedidosCompraService } from './pedidos-compra.service';

const ENTITY = 'PedidoCompra';

/** Tela Pedidos em Trânsito (`/pedidos-compra`). */
@ApiTags('Compras / Estoque: Pedidos em Trânsito')
@Controller('compras-estoque/pedidos-compra')
export class PedidosCompraController {
  constructor(private readonly pedidos: PedidosCompraService) {}

  @Get()
  @RequirePermission('compras-estoque.pedidos-transito.ver')
  @ApiOperation({ summary: 'Lista paginada, com busca, status e ordenação' })
  @ApiZodQuery(listPedidosCompraQuerySchema)
  @ApiZodResponse(200, pedidoCompraPageSchema)
  @ApiErrorResponses(400, 401, 403)
  list(
    @Query(new ZodValidationPipe(listPedidosCompraQuerySchema)) query: ListPedidosCompraQuery,
  ): Promise<Page<PedidoCompra>> {
    return this.pedidos.list(query);
  }

  // Antes de ":id" para "export" não ser tratado como id.
  @Get('export')
  @RequirePermission('compras-estoque.pedidos-transito.exportar')
  @Audit({ entity: ENTITY, action: 'EXPORT' })
  @ApiOperation({
    summary: 'Exporta em Excel ou PDF com os mesmos filtros e ordenação da listagem',
  })
  @ApiZodQuery(exportPedidosCompraQuerySchema)
  @ApiProduces(
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/pdf',
  )
  @ApiErrorResponses(400, 401, 403, 422)
  async export(
    @Query(new ZodValidationPipe(exportPedidosCompraQuerySchema)) query: ExportPedidosCompraQuery,
  ): Promise<StreamableFile> {
    return toStreamableFile(await this.pedidos.export(query));
  }

  @Get(':id')
  @RequirePermission('compras-estoque.pedidos-transito.ver')
  @ApiOperation({ summary: 'Detalhe' })
  @ApiZodResponse(200, pedidoCompraSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  findById(@IdParam() id: string): Promise<PedidoCompra> {
    return this.pedidos.findById(id);
  }

  @Post()
  @RequirePermission('compras-estoque.pedidos-transito.criar')
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Cria o pedido de compra (Novo Pedido), com status Em Transito' })
  @ApiZodBody(createPedidoCompraSchema)
  @ApiZodResponse(201, pedidoCompraSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  create(
    @Body(new ZodValidationPipe(createPedidoCompraSchema)) body: CreatePedidoCompraInput,
  ): Promise<PedidoCompra> {
    return this.pedidos.create(body);
  }

  @Patch(':id')
  @RequirePermission('compras-estoque.pedidos-transito.editar')
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Altera o pedido (só em trânsito)' })
  @ApiZodBody(updatePedidoCompraSchema)
  @ApiZodResponse(200, pedidoCompraSchema)
  @ApiErrorResponses(400, 401, 403, 404, 422)
  update(
    @IdParam() id: string,
    @Body(new ZodValidationPipe(updatePedidoCompraSchema)) body: UpdatePedidoCompraInput,
  ): Promise<PedidoCompra> {
    return this.pedidos.update(id, body);
  }

  @Post(':id/receber')
  @RequirePermission('compras-estoque.pedidos-transito.editar')
  @HttpCode(200)
  @Audit({ entity: ENTITY, action: 'UPDATE' })
  @ApiOperation({ summary: 'Marca o pedido como Recebido (não movimenta o estoque)' })
  @ApiZodResponse(200, pedidoCompraSchema)
  @ApiErrorResponses(400, 401, 403, 404, 422)
  receber(@IdParam() id: string): Promise<PedidoCompra> {
    return this.pedidos.receber(id);
  }

  @Post(':id/cancelar')
  @RequirePermission('compras-estoque.pedidos-transito.editar')
  @HttpCode(200)
  @Audit({ entity: ENTITY, action: 'UPDATE' })
  @ApiOperation({ summary: 'Cancela o pedido' })
  @ApiZodResponse(200, pedidoCompraSchema)
  @ApiErrorResponses(400, 401, 403, 404, 422)
  cancelar(@IdParam() id: string): Promise<PedidoCompra> {
    return this.pedidos.cancelar(id);
  }

  @Delete(':id')
  @RequirePermission('compras-estoque.pedidos-transito.excluir')
  @HttpCode(200)
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Exclui (exclusão lógica)' })
  @ApiZodResponse(200, pedidoCompraSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  remove(@IdParam() id: string): Promise<PedidoCompra> {
    return this.pedidos.remove(id);
  }
}
