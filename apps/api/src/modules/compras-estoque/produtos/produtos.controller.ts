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
  createProdutoSchema,
  exportProdutosQuerySchema,
  listProdutosQuerySchema,
  produtoPageSchema,
  produtoSchema,
  updateProdutoSchema,
  type CreateProdutoInput,
  type ExportProdutosQuery,
  type ListProdutosQuery,
  type UpdateProdutoInput,
} from '@torres/shared';
import type { Produto } from '../../../generated/prisma/client';
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
import { ProdutosService } from './produtos.service';

const ENTITY = 'Produto';

/** Tela Produtos/Serviços (`/produtos`). */
@ApiTags('Compras / Estoque: Produtos/Serviços')
@Controller('compras-estoque/produtos')
export class ProdutosController {
  constructor(private readonly produtos: ProdutosService) {}

  @Get()
  @RequirePermission('compras-estoque.produtos-servicos.ver')
  @ApiOperation({
    summary:
      'Lista paginada, com busca (nome, SKU, código de barras), tipo (Todos/Produtos/Serviços) e ordenação',
  })
  @ApiZodQuery(listProdutosQuerySchema)
  @ApiZodResponse(200, produtoPageSchema)
  @ApiErrorResponses(400, 401, 403)
  list(
    @Query(new ZodValidationPipe(listProdutosQuerySchema)) query: ListProdutosQuery,
  ): Promise<Page<Produto>> {
    return this.produtos.list(query);
  }

  // Antes de ":id" para "export" não ser tratado como id.
  @Get('export')
  @RequirePermission('compras-estoque.produtos-servicos.exportar')
  @Audit({ entity: ENTITY, action: 'EXPORT' })
  @ApiOperation({
    summary: 'Exporta em Excel ou PDF com os mesmos filtros e ordenação da listagem',
  })
  @ApiZodQuery(exportProdutosQuerySchema)
  @ApiProduces(
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/pdf',
  )
  @ApiErrorResponses(400, 401, 403, 422)
  async export(
    @Query(new ZodValidationPipe(exportProdutosQuerySchema)) query: ExportProdutosQuery,
  ): Promise<StreamableFile> {
    return toStreamableFile(await this.produtos.export(query));
  }

  @Get(':id')
  @RequirePermission('compras-estoque.produtos-servicos.ver')
  @ApiOperation({ summary: 'Detalhe' })
  @ApiZodResponse(200, produtoSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  findById(@IdParam() id: string): Promise<Produto> {
    return this.produtos.findById(id);
  }

  @Post()
  @RequirePermission('compras-estoque.produtos-servicos.criar')
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Cria (Novo Produto/Serviço)' })
  @ApiZodBody(createProdutoSchema)
  @ApiZodResponse(201, produtoSchema)
  @ApiErrorResponses(400, 401, 403)
  create(
    @Body(new ZodValidationPipe(createProdutoSchema)) body: CreateProdutoInput,
  ): Promise<Produto> {
    return this.produtos.create(body);
  }

  @Patch(':id')
  @RequirePermission('compras-estoque.produtos-servicos.editar')
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Altera (Editar Produto)' })
  @ApiZodBody(updateProdutoSchema)
  @ApiZodResponse(200, produtoSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  update(
    @IdParam() id: string,
    @Body(new ZodValidationPipe(updateProdutoSchema)) body: UpdateProdutoInput,
  ): Promise<Produto> {
    return this.produtos.update(id, body);
  }

  @Delete(':id')
  @RequirePermission('compras-estoque.produtos-servicos.excluir')
  @HttpCode(200)
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Exclui (exclusão lógica)' })
  @ApiZodResponse(200, produtoSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  remove(@IdParam() id: string): Promise<Produto> {
    return this.produtos.remove(id);
  }
}
